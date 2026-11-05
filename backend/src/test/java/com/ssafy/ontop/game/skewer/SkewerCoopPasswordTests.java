package com.ssafy.ontop.game.skewer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.skewer.coop.domain.SkewerCoopRoomAccess;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopEngine;
import java.time.Clock;
import java.util.Map;
import java.util.Random;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SkewerCoopPasswordTests {
    private final AtomicLong now = new AtomicLong(1_000);
    private final Clock clock = mock(Clock.class);
    private final SkewerCoopEngine engine = new SkewerCoopEngine(new ObjectMapper(), clock,
            new GameEngineRouter(), event -> { }, user -> { }, (user, channel) -> true, new Random(18), 240);

    SkewerCoopPasswordTests() {
        when(clock.millis()).thenAnswer(call -> now.get());
    }

    @Test
    void 올바른_비밀번호로_서른초_내_여섯번_방을_옮겨도_실패로_집계하지_않는다() {
        for (int i = 0; i < 6; i++) {
            String id = room(101 + i);

            assertThat(engine.join(202, "park", id, "abcd").path("registered").asBoolean()).isTrue();

            engine.leaveWaiting(202, id);
        }
    }

    @Test
    void 성공한_검증은_이전_실패를_지우고_이후_다섯번의_실패는_다시_제한한다() {
        String first = room(101);
        for (int i = 0; i < 4; i++) {
            invalid(first);
        }
        engine.join(202, "park", first, "abcd");
        engine.leaveWaiting(202, first);
        String second = room(303);

        for (int i = 0; i < 5; i++) {
            invalid(second);
        }

        assertThatThrownBy(() -> engine.join(202, "park", second, "abcd"))
                .isInstanceOf(SkewerCoopRoomAccess.PasswordRejected.class).hasMessageContaining("30초");
    }

    @Test
    void 다섯번_실패_제한은_정확히_서른초가_지나면_해제된다() {
        String id = room(101);
        for (int i = 0; i < 5; i++) {
            invalid(id);
        }
        now.addAndGet(29_999);
        assertThatThrownBy(() -> engine.join(202, "park", id, "abcd")).hasMessageContaining("30초");

        now.incrementAndGet();

        assertThat(engine.join(202, "park", id, "abcd").path("registered").asBoolean()).isTrue();
    }

    @Test
    void 같은_사용자의_병렬_해시를_막고_다른_사용자와_엔진_조회는_멈추지_않는다() throws Exception {
        String id = room(101);
        String other = room(303);
        var access = lockedAccess();
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(access.accepts("wrong")).thenAnswer(call -> {
            entered.countDown();
            assertThat(release.await(5, TimeUnit.SECONDS)).isTrue();
            return false;
        });
        accessMap().put(id, access);

        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var pending = workers.submit(() -> engine.join(202, "park", id, "wrong"));
            try {
                assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
                assertThatThrownBy(() -> engine.join(202, "park", other, "abcd")).hasMessageContaining("30초");
                assertThat(workers.submit(() -> engine.rooms(404, "park")).get(2, TimeUnit.SECONDS)
                        .path("rooms").size()).isEqualTo(2);
                assertThat(engine.join(404, "park", other, "abcd").path("registered").asBoolean()).isTrue();
            } finally {
                release.countDown();
            }
            assertThatThrownBy(() -> pending.get(5, TimeUnit.SECONDS))
                    .hasCauseInstanceOf(SkewerCoopRoomAccess.PasswordRejected.class);
        }
        verify(access, times(1)).accepts("wrong");
        // 병렬 차단은 실패로 집계하지 않는다. 실제 실패 다섯 번까지는 여전히 검증한다.
        for (int i = 0; i < 4; i++) {
            invalid(id);
        }
        assertThatThrownBy(() -> engine.join(202, "park", id, "abcd")).hasMessageContaining("30초");
    }

    @Test
    void 해시_검증의_내부_예외가_발생해도_진행중_표시를_해제한다() {
        String id = room(101);
        var access = lockedAccess();
        when(access.accepts("wrong")).thenThrow(new IllegalStateException("hash unavailable"));
        when(access.accepts("abcd")).thenReturn(true);
        accessMap().put(id, access);

        assertThatThrownBy(() -> engine.join(202, "park", id, "wrong")).hasMessage("hash unavailable");

        assertThat(engine.join(202, "park", id, "abcd").path("registered").asBoolean()).isTrue();
    }

    private String room(long host) {
        return engine.create(host, "park", "room-" + host, "우리 가게", "방장", "abcd").path("gameId").asText();
    }

    private void invalid(String id) {
        assertThatThrownBy(() -> engine.join(202, "park", id, "wrong")).hasMessageContaining("비밀번호가 맞지");
    }

    private SkewerCoopRoomAccess lockedAccess() {
        var access = mock(SkewerCoopRoomAccess.class);
        when(access.locked()).thenReturn(true);
        when(access.name()).thenReturn("우리 가게");
        when(access.hostNickname()).thenReturn("방장");
        return access;
    }

    @SuppressWarnings("unchecked")
    private Map<String, SkewerCoopRoomAccess> accessMap() {
        return (Map<String, SkewerCoopRoomAccess>) ReflectionTestUtils.getField(engine, "roomAccess");
    }
}
