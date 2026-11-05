package com.ssafy.ontop.game.skewer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.skewer.coop.config.SkewerCoopConfiguration;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopEngine;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopFinished;
import com.ssafy.ontop.game.state.GameStateChanged;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SkewerCoopMaintenanceTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final AtomicLong now = new AtomicLong(1_000);
    private final Clock clock = mock(Clock.class);
    private final GameEngineRouter router = new GameEngineRouter();
    private final List<Object> events = new ArrayList<>();
    private final List<SkewerCoopFinished> saved = new ArrayList<>();
    private final AtomicBoolean diskFails = new AtomicBoolean();
    private final AtomicBoolean connectionFails = new AtomicBoolean();
    private final AtomicBoolean notificationFails = new AtomicBoolean();
    private final SkewerCoopEngine engine = new SkewerCoopEngine(mapper, clock, router, event -> {
        if (notificationFails.get() && event instanceof GameStateChanged) {
            notificationFails.set(false);
            throw new IllegalStateException("검수용 일회성 알림 오류");
        }
        events.add(event);
    }, user -> { }, (user, channel) -> {
        if (user == 101 && connectionFails.get()) {
            throw new IllegalStateException("검수용 연결 조회 오류");
        }
        return true;
    }, new Random(18), 240, result -> {
        if (diskFails.get()) {
            throw new IllegalStateException("검수용 디스크 오류");
        }
        saved.add(result);
    });

    SkewerCoopMaintenanceTests() {
        when(clock.millis()).thenAnswer(call -> now.get());
        when(clock.instant()).thenAnswer(call -> java.time.Instant.ofEpochMilli(now.get()));
    }

    @Test
    void 취소된_백개_방은_일분간_재시도를_보존한뒤_참조까지_제거한다() {
        String first = null;
        for (int i = 0; i < 100; i++) {
            String id = engine.create(101, "park", "cancel-" + i).path("gameId").asText();
            if (first == null) {
                first = id;
            }
            engine.leaveWaiting(101, id);
        }
        now.addAndGet(59_999);
        engine.tick();
        assertThat(cache("games")).hasSize(100);
        assertThat(engine.create(101, "park", "cancel-0").path("gameId").asText()).isEqualTo(first);

        now.addAndGet(1_000);
        engine.tick();

        for (String name : List.of("games", "roomAccess", "latest", "recoveryLatest", "creations")) {
            assertThat(cache(name)).as(name).isEmpty();
        }
        assertThat(ReflectionTestUtils.getField(engine, "completed")).isEqualTo(java.util.Set.of());
        assertThat(ReflectionTestUtils.getField(engine, "dismissed")).isEqualTo(java.util.Set.of());
        assertThat(engine.load(101, first)).isEmpty();
        assertThat(saved).isEmpty();
    }

    @Test
    void 보관중인_방_상한에서도_기존요청_재시도는_허용하고_새방만_제한한다() {
        String first = null;
        for (int i = 0; i < 1024; i++) {
            String id = engine.create(101, "park", "retained-" + i).path("gameId").asText();
            if (first == null) {
                first = id;
            }
            engine.leaveWaiting(101, id);
        }

        assertThatThrownBy(() -> engine.create(101, "park", "overflow")).isInstanceOf(IllegalStateException.class);
        assertThat(engine.create(101, "park", "retained-0").path("gameId").asText()).isEqualTo(first);
        now.addAndGet(60_000);
        engine.tick();
        assertThat(engine.create(101, "park", "after-cleanup").path("gameId").asText()).isNotBlank();
        assertThat(cache("games")).hasSize(1);
    }

    @Test
    void 저장한_결과는_삼십분간_복구와_중복행동을_보존하고_만료후_라우터까지_정리한다() {
        String id = joined(101, 202, "finished");
        var action = action(101, id, Map.of("type", "ROLE", "role", "server"));
        var receipt = engine.apply(action);
        var quit = new GameForfeitCommand(101, id, "quit");
        engine.forfeit(quit);
        engine.persistTerminalResults();
        now.addAndGet(1_799_999);
        engine.tick();

        assertThat(router.load(101).orElseThrow().gameId()).isEqualTo(id);
        assertThat(router.apply(action)).isEqualTo(receipt);
        assertThat(router.forfeit(quit).duplicate()).isTrue();

        now.addAndGet(1_001);
        engine.tick();

        assertThat(engine.load(101, id)).isEmpty();
        assertThat(router.load(101)).isEmpty();
        assertThat(router.load(101, id)).isEmpty();
        for (String name : List.of("games", "roomAccess", "receipts", "forfeits", "creations", "recoveryLatest")) {
            assertThat(cache(name)).as(name).isEmpty();
        }
        assertThat(saved).hasSize(1);
        assertThatThrownBy(() -> router.apply(action)).hasMessage("ACCESS_DENIED");
    }

    @Test
    void 저널_인계에_실패한_결과는_시간이_지나도_버리지_않고_저장성공부터_보존한다() {
        String id = joined(101, 202, "pending");
        diskFails.set(true);
        engine.forfeit(new GameForfeitCommand(101, id, "quit"));
        engine.persistTerminalResults();
        now.addAndGet(3_600_000);
        engine.tick();

        assertThat(engine.load(101, id)).isPresent();
        assertThat(cache("terminalResults")).containsKey(id);
        assertThatThrownBy(() -> engine.create(101, "park", "not-yet")).isInstanceOf(IllegalStateException.class);
        diskFails.set(false);
        engine.persistTerminalResults();
        engine.tick();
        assertThat(saved).hasSize(1);
        assertThat(engine.load(101, id)).isPresent();
        now.addAndGet(1_800_000);
        engine.tick();
        assertThat(engine.load(101, id)).isEmpty();
    }

    @Test
    void 이전방_만료가_새방의_복구와_진행중_점유를_지우지_않는다() {
        String old = joined(101, 202, "old");
        engine.forfeit(new GameForfeitCommand(101, old, "quit"));
        engine.persistTerminalResults();
        String next = joined(101, 202, "new");

        now.addAndGet(1_800_000);
        engine.tick();

        assertThat(router.load(101).orElseThrow().gameId()).isEqualTo(next);
        assertThat(engine.load(101).orElseThrow().gameId()).isEqualTo(next);
        assertThat(engine.load(101, old)).isEmpty();
        assertThatThrownBy(() -> router.register(engine, "unrelated", "other", List.of(101L, 303L)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 한방의_틱_오류는_해당방만_종료하고_다른방과_영속저장은_진행한다() {
        String broken = joined(101, 202, "broken");
        String healthy = joined(303, 404, "healthy");
        ready(303, 404, healthy);
        long before = engine.load(303, healthy).orElseThrow().version();
        connectionFails.set(true);
        now.addAndGet(100);

        assertThatCode(engine::tick).doesNotThrowAnyException();
        engine.persistTerminalResults();

        assertThat(engine.load(101, broken).orElseThrow().publicState().path("endReason").asText())
                .isEqualTo("SKEWER_RUNTIME_ERROR");
        assertThat(engine.load(303, healthy).orElseThrow().version()).isGreaterThan(before);
        assertThat(saved).singleElement().satisfies(result -> {
            assertThat(result.rankingEligible()).isFalse();
            assertThat(result.result().gameId()).isEqualTo(broken);
        });
        assertThat(engine.load(303, healthy).orElseThrow().publicState().path("phase").asText()).isEqualTo("COUNTDOWN");
        assertThat(engine.load(303, healthy).orElseThrow().publicState().path("countdown").asDouble()).isLessThan(3);
        for (int i = 0; i < 5; i++) {
            now.addAndGet(1_000);
            engine.tick();
            engine.persistTerminalResults();
        }
        assertThat(engine.load(303, healthy).orElseThrow().publicState().path("elapsed").asDouble()).isGreaterThan(0);
        assertThat(saved).hasSize(1);
    }

    @Test
    void 한방의_알림_오류가_나머지방의_알림_발행을_막지_않는다() {
        String first = joined(101, 202, "first");
        String second = joined(303, 404, "second");
        ready(101, 202, first);
        ready(303, 404, second);
        events.clear();
        notificationFails.set(true);

        assertThatCode(engine::tick).doesNotThrowAnyException();

        assertThat(events.stream().filter(GameStateChanged.class::isInstance)
                .map(GameStateChanged.class::cast).map(GameStateChanged::gameId)).containsExactly(second);
        assertThat(engine.load(101, first).orElseThrow().publicState().path("phase").asText()).isEqualTo("COUNTDOWN");
    }

    @Test
    void 실제_예약된_타이머는_일회성_틱_예외후에도_다음_주기를_실행한다() throws Exception {
        var timerEngine = mock(SkewerCoopEngine.class);
        var secondTick = new CountDownLatch(1);
        var first = new AtomicBoolean(true);
        doAnswer(call -> {
            if (first.getAndSet(false)) {
                throw new IllegalStateException("검수용 첫 틱 오류");
            }
            secondTick.countDown();
            return null;
        }).when(timerEngine).tick();

        try (AutoCloseable timer = ReflectionTestUtils.invokeMethod(new SkewerCoopConfiguration(),
                "skewerCoopTimer", timerEngine)) {
            assertThat(secondTick.await(2, TimeUnit.SECONDS)).isTrue();
        }
    }

    private String joined(long host, long guest, String key) {
        String id = engine.create(host, "park", key).path("gameId").asText();
        engine.join(guest, "park", id);
        return id;
    }

    private void ready(long host, long guest, String id) {
        engine.apply(action(host, id, Map.of("type", "ROLE", "role", "server")));
        engine.apply(action(guest, id, Map.of("type", "ROLE", "role", "chef")));
        engine.apply(action(host, id, Map.of("type", "READY", "ready", true)));
        engine.apply(action(guest, id, Map.of("type", "READY", "ready", true)));
    }

    private GameActionCommand action(long user, String id, Map<String, Object> input) {
        long version = engine.load(user, id).orElseThrow().publicState().path("actionVersion").asLong();
        return new GameActionCommand(user, id, UUID.randomUUID().toString(), version, mapper.valueToTree(input));
    }

    @SuppressWarnings("unchecked")
    private Map<Object, Object> cache(String name) {
        return (Map<Object, Object>) ReflectionTestUtils.getField(engine, name);
    }
}
