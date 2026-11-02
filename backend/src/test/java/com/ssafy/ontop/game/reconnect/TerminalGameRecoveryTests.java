package com.ssafy.ontop.game.reconnect;

import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.start.GameRuntimeIdentity;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import static org.assertj.core.api.Assertions.assertThat;

class TerminalGameRecoveryTests {
    private static final Instant NOW = Instant.parse("2026-11-02T00:00:00Z");

    @ParameterizedTest
    @EnumSource(value = GameSession.Status.class, names = {"FINISHED", "INVALID"})
    void 이전서버의_저장된종결경기는_엔진없이_정산커밋과_예약해제후_로비를_허용한다(GameSession.Status status)
            throws Exception {
        var active = new AtomicReference<>(Optional.of(record(status)));
        var calls = new AtomicInteger();
        TerminalGameRecovery recovery = (user, game) -> {
            assertThat(user).isEqualTo(101);
            assertThat(game.gameId()).isEqualTo("1");
            calls.incrementAndGet();
            active.set(Optional.empty());
        };
        try (Harness h = new Harness(active, recovery)) {
            assertThat(h.connect("LOBBY").gameId()).isNull();
            assertThat(h.service.canUseLobby(101, "session")).isTrue();
            assertThat(calls).hasValue(1);
        }
    }

    @Test
    void 정산실패는_잠금을_해제하지않고_다음조회에서_동일경기를_재시도한다() throws Exception {
        var active = new AtomicReference<>(Optional.of(record(GameSession.Status.FINISHED)));
        var calls = new AtomicInteger();
        try (Harness h = new Harness(active, (user, game) -> {
            if (calls.getAndIncrement() == 0) { throw new IllegalStateException("rollback"); }
            active.set(Optional.empty());
        })) {
            assertThat(h.connect("UNAVAILABLE").code()).isEqualTo("RECOVERY_UNAVAILABLE");
            assertThat(h.service.canUseLobby(101, "session")).isFalse();
            h.service.refresh(101, "session", "retry", h::offer);
            assertThat(h.await("LOBBY").gameId()).isNull();
            assertThat(calls).hasValue(2);
        }
    }

    @Test
    void 정산호출이_반환돼도_같은활성마커가_남으면_차단한다() throws Exception {
        var active = new AtomicReference<>(Optional.of(record(GameSession.Status.FINISHED)));
        try (Harness h = new Harness(active, (user, game) -> { })) {
            h.connect("UNAVAILABLE");
            assertThat(h.service.canUseLobby(101, "session")).isFalse();
        }
    }

    @ParameterizedTest
    @EnumSource(value = GameSession.Status.class, names = {"RESERVED", "RUNNING"})
    void 저장된판정이_없으면_이전boot여도_자동기권이나_환불하지않는다(GameSession.Status status) throws Exception {
        var active = new AtomicReference<>(Optional.of(record(status)));
        var calls = new AtomicInteger();
        try (Harness h = new Harness(active, (user, game) -> calls.incrementAndGet())) {
            h.connect("UNAVAILABLE");
            assertThat(h.service.canUseLobby(101, "session")).isFalse();
            assertThat(calls).hasValue(0);
        }
    }

    @Test
    void 정산뒤_다른경기가_활성화되면_로비로_잘못_해제하지않는다() throws Exception {
        var active = new AtomicReference<>(Optional.of(record(GameSession.Status.FINISHED)));
        try (Harness h = new Harness(active, (user, game) -> {
            var old = record(GameSession.Status.RUNNING);
            active.set(Optional.of(new ActiveGameRecord(2, old.gameCode(), old.tableId(), old.status(),
                    old.settlementStatus(), old.ownerInstanceId(), old.ownerBootId(), NOW, NOW, null)));
        })) {
            h.connect("UNAVAILABLE");
            assertThat(h.service.canUseLobby(101, "session")).isFalse();
        }
    }

    private ActiveGameRecord record(GameSession.Status status) {
        return new ActiveGameRecord(1, "ALKKAGI", "table-1", status, GameSession.SettlementStatus.PENDING,
                "previous-server", UUID.randomUUID(), NOW, NOW,
                status == GameSession.Status.FINISHED || status == GameSession.Status.INVALID ? NOW : null);
    }

    private static final class Harness implements AutoCloseable {
        private final LinkedBlockingQueue<GameReconnectService.View> messages = new LinkedBlockingQueue<>();
        private final GameReconnectService service;

        private Harness(AtomicReference<Optional<ActiveGameRecord>> active, TerminalGameRecovery recovery) {
            service = new GameReconnectService(Optional.empty(), Optional.empty(),
                    Optional.of(user -> active.get()), Optional.of(new GameRuntimeIdentity("new-server")),
                    Optional.of(recovery));
        }

        private GameReconnectService.View connect(String status) throws Exception {
            service.connected(101, "session", null, this::offer, game -> false);
            return await(status);
        }

        private void offer(String request, GameReconnectService.View view) { messages.add(view); }

        private GameReconnectService.View await(String status) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (true) {
                var view = messages.poll(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                assertThat(view).as(status).isNotNull();
                if (view.status().equals(status)) { return view; }
            }
        }

        @Override
        public void close() { service.shutdown(); }
    }
}
