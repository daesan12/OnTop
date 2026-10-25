package com.ssafy.ontop.game;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.bridge.service.BridgeEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.farkle.service.FarkleEngine;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.onecard.domain.ForfeitHandPolicy;
import com.ssafy.ontop.game.onecard.service.OneCardEngine;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameParticipantLeft;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ManualForfeitEngineTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final List<Object> events = new CopyOnWriteArrayList<>();
    private final GameEngineRouter router = new GameEngineRouter();
    private final Instant now = Instant.parse("2026-10-25T00:00:00Z");
    private final Clock clock = Clock.fixed(now, ZoneOffset.UTC);

    @ParameterizedTest
    @ValueSource(strings = {"OMOK", "DICE", "ONE_CARD", "LIAR_BRIDGE"})
    void 자기차례가아니어도_본인만기권하고_재시도와재클릭은_종료를중복발행하지않는다(String code) {
        create(code, List.of(101L, 202L));
        var command = new GameForfeitCommand(202, "game", "button-1");
        var result = router.forfeit(command);
        assertThat(result.duplicate()).isFalse();
        assertThat(result.version()).isEqualTo(1);
        assertThat(router.forfeit(command).duplicate()).isTrue();
        assertThat(router.forfeit(new GameForfeitCommand(202, "game", "button-2")).version()).isEqualTo(1);
        assertThat(router.load(101, "game").orElseThrow().version()).isEqualTo(1);
        assertThat(events.stream().filter(GameParticipantLeft.class::isInstance)).hasSize(1);
        var finished = events.stream().filter(GameFinished.class::isInstance)
                .map(GameFinished.class::cast).toList();
        assertThat(finished).hasSize(1);
        assertThat(finished.getFirst().participants()).anySatisfy(player -> {
            assertThat(player.userId()).isEqualTo(202);
            assertThat(player.result()).isEqualTo(GameFinished.Result.FORFEIT);
            assertThat(player.leaveReason()).isEqualTo(GameDepartureReason.EXPLICIT_LEAVE);
            assertThat(player.leftAt()).isEqualTo(now);
        }).anySatisfy(player -> {
            assertThat(player.userId()).isEqualTo(101);
            assertThat(player.result()).isEqualTo(GameFinished.Result.WIN);
        });
        assertRejected(new GameForfeitCommand(505, "game", "other"), Rejection.ACCESS_DENIED);
        assertRejected(new GameForfeitCommand(101, "game", "late"), Rejection.GAME_FINISHED);
        assertRejected(new GameForfeitCommand(202, "missing", "unknown"), Rejection.ACCESS_DENIED);
        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"ONE_CARD", "LIAR_BRIDGE"})
    void 세명경기는_한명기권후계속하고_마지막생존자가정해질때만_전체종료한다(String code) {
        create(code, List.of(101L, 202L, 303L));
        router.forfeit(new GameForfeitCommand(202, "game", "first"));
        assertThat(router.load(202).orElseThrow().phase().name()).isEqualTo("ELIMINATED");
        assertThat(router.load(101).orElseThrow().phase().name()).isEqualTo("PLAYING");
        assertThat(events.stream().filter(GameFinished.class::isInstance)).isEmpty();
        if (code.equals("ONE_CARD")) {
            assertThat(router.load(202, "game").orElseThrow().privateState().path("hand").isEmpty()).isTrue();
        }
        router.forfeit(new GameForfeitCommand(303, "game", "second"));
        assertThat(events.stream().filter(GameParticipantLeft.class::isInstance)).hasSize(2);
        var result = events.stream().filter(GameFinished.class::isInstance).map(GameFinished.class::cast)
                .findFirst().orElseThrow();
        assertThat(result.participants().stream().filter(p -> p.result() == GameFinished.Result.FORFEIT)).hasSize(2);
        assertThat(result.participants().stream().filter(p -> p.result() == GameFinished.Result.WIN)
                .map(GameFinished.Participant::userId)).containsExactly(101L);
    }

    @Test
    void 동시기권요청도_참가자당한번만_확정한다() throws Exception {
        create("ONE_CARD", List.of(101L, 202L, 303L));
        var start = new CountDownLatch(1);
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var tasks = java.util.stream.IntStream.range(0, 20).mapToObj(index -> workers.submit(() -> {
                start.await();
                return router.forfeit(new GameForfeitCommand(202, "game", "click-" + index));
            })).toList();
            start.countDown();
            int first = 0;
            for (var task : tasks) { if (!task.get().duplicate()) { first++; } }
            assertThat(first).isEqualTo(1);
        }
        assertThat(events.stream().filter(GameParticipantLeft.class::isInstance)).hasSize(1);
        assertThat(router.load(101, "game").orElseThrow().version()).isEqualTo(1);
    }

    @Test
    void 오목시간패가먼저면_수동기권으로_승패나이탈사유를덮지않는다() {
        // 생성 시각에서 30초 뒤를 읽는 시계를 별도로 구성한다.
        var clockState = new java.util.concurrent.atomic.AtomicReference<>(now);
        var controlled = new Clock() {
            @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return clockState.get(); }
        };
        var otherRouter = new GameEngineRouter();
        var other = new OmokEngine(mapper, controlled, events::add, otherRouter);
        other.create("timeout", "other-table", 101, 202);
        clockState.set(now.plusSeconds(30));
        assertThatThrownBy(() -> otherRouter.forfeit(new GameForfeitCommand(202, "timeout", "late")))
                .isInstanceOfSatisfying(Rejected.class, error -> assertThat(error.reason()).isEqualTo(Rejection.GAME_FINISHED));
        assertThat(events.stream().filter(GameParticipantLeft.class::isInstance)).isEmpty();
        assertThat(other.load(101, "timeout").orElseThrow().publicState().path("endReason").asText())
                .isEqualTo("TURN_TIMEOUT");
        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
    }

    @Test
    void 다리선언중기권은_기존판정경계를유지하고_개인주사위와참가권한을제거한다() {
        create("LIAR_BRIDGE", List.of(101L, 202L, 303L));
        router.apply(new GameActionCommand(101, "game", "roll", 0, mapper.valueToTree(Map.of("kind", "roll"))));
        router.forfeit(new GameForfeitCommand(101, "game", "leave"));
        assertThat(router.load(101).orElseThrow().phase().name()).isEqualTo("ELIMINATED");
        assertThat(router.load(101, "game").orElseThrow().privateState().isEmpty()).isTrue();
        assertThat(events.stream().filter(GameParticipantLeft.class::isInstance)).hasSize(1);
        assertThat(events.stream().filter(GameFinished.class::isInstance)).isEmpty();
    }

    private void assertRejected(GameForfeitCommand command, Rejection rejection) {
        assertThatThrownBy(() -> router.forfeit(command)).isInstanceOfSatisfying(Rejected.class,
                error -> assertThat(error.reason()).isEqualTo(rejection));
    }

    private void create(String code, List<Long> players) {
        switch (code) {
            case "OMOK" -> new OmokEngine(mapper, clock, events::add, router)
                    .create("game", "table", players.get(0), players.get(1));
            case "DICE" -> new FarkleEngine(mapper, clock, events::add, router, () -> 1, () -> 0)
                    .create("game", "table", players, 2000);
            case "ONE_CARD" -> new OneCardEngine(mapper, clock, events::add, router, cards -> { },
                    bound -> 0, ForfeitHandPolicy.REMOVE).create("game", "table", players);
            case "LIAR_BRIDGE" -> new BridgeEngine(mapper, clock, events::add, router, () -> 1, bound -> 0)
                    .create("game", "table", players);
            default -> throw new IllegalArgumentException(code);
        }
    }
}
