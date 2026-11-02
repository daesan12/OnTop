package com.ssafy.ontop.game.reconnect;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.reconnect.GameReconnectService.View;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot.Phase;
import com.ssafy.ontop.game.start.GameRuntimeIdentity;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Function;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class GameReconnectConsistencyTests {
    private static final long USER_ID = 101L;
    private static final Instant RESERVED_AT = Instant.parse("2026-10-29T00:00:00Z");

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void DB와_엔진에_활성경기가_없으면_LOBBY를_허용한다() throws Exception {
        try (Harness harness = harness(user -> Optional.empty(), user -> Optional.empty())) {
            View view = harness.connect().await("LOBBY");
            assertThat(view.gameId()).isNull();
            assertThat(harness.service.canUseLobby(USER_ID, "session")).isTrue();
        }
    }

    @Test
    void DB와_엔진_gameId와_현재소유권이_일치하면_RESTORED를_유지한다() throws Exception {
        try (Harness harness = harnessCurrent(GameSession.Status.RUNNING, GameSession.SettlementStatus.PENDING,
                user -> Optional.of(snapshot("1", Phase.PLAYING)))) {
            View view = harness.connect().await("RESTORED");
            assertThat(view.gameId()).isEqualTo("1");
            assertThat(harness.service.canControlGame(USER_ID, "session", "1")).isTrue();
        }
    }

    @Test
    void DB활성_엔진소실은_LOBBY가_아닌_UNAVAILABLE이다() throws Exception {
        try (Harness harness = harnessCurrent(GameSession.Status.RUNNING, GameSession.SettlementStatus.PENDING,
                user -> Optional.empty())) {
            assertUnavailable(harness);
        }
    }

    @Test
    void 복구Gateway자체가_없어도_DB활성경기를_LOBBY로_허용하지_않는다() throws Exception {
        GameRuntimeIdentity identity = new GameRuntimeIdentity("reconnect-test");
        ActiveGameLookup active = user -> Optional.of(record(GameSession.Status.RUNNING,
                GameSession.SettlementStatus.PENDING, identity.instanceId(), identity.bootId()));
        var service = new GameReconnectService(Optional.empty(), Optional.empty(),
                Optional.of(active), Optional.of(identity));
        try {
            var harness = new Harness(service);
            assertUnavailable(harness);
        } finally {
            service.shutdown();
        }
    }

    @Test
    void 복구Gateway가_없어도_DB활성경기가_없으면_정상_LOBBY이다() throws Exception {
        GameRuntimeIdentity identity = new GameRuntimeIdentity("reconnect-test");
        ActiveGameLookup active = user -> Optional.empty();
        var service = new GameReconnectService(Optional.empty(), Optional.empty(),
                Optional.of(active), Optional.of(identity));
        try {
            var harness = new Harness(service);
            View view = harness.connect().await("LOBBY");
            assertThat(view.gameId()).isNull();
            assertThat(service.canUseLobby(USER_ID, "session")).isTrue();
        } finally {
            service.shutdown();
        }
    }

    @Test
    void DB와_엔진_gameId가_다르면_snapshot을_노출하지_않는다() throws Exception {
        try (Harness harness = harnessCurrent(GameSession.Status.RUNNING, GameSession.SettlementStatus.PENDING,
                user -> Optional.of(snapshot("2", Phase.PLAYING)))) {
            assertUnavailable(harness);
        }
    }

    @Test
    void DB조회예외를_활성경기없음으로_해석하지_않는다() throws Exception {
        ActiveGameLookup failed = user -> { throw new IllegalStateException("fixture lookup failure"); };
        try (Harness harness = harness(failed, user -> Optional.empty())) {
            assertUnavailable(harness);
        }
    }

    @Test
    void 다른boot가_소유한_동일경기도_복구하지_않는다() throws Exception {
        try (Harness harness = harness((user, identity) -> Optional.of(record(GameSession.Status.RUNNING,
                GameSession.SettlementStatus.PENDING, identity.instanceId(), UUID.randomUUID())),
                user -> Optional.of(snapshot("1", Phase.PLAYING)))) {
            assertUnavailable(harness);
        }
    }

    @Test
    void 종료정산대기는_FINISHED로_구분하고_진행snapshot이면_거부한다() throws Exception {
        try (Harness finished = harnessCurrent(GameSession.Status.FINISHED, GameSession.SettlementStatus.PENDING,
                user -> Optional.of(snapshot("1", Phase.FINISHED)))) {
            assertThat(finished.connect().await("FINISHED").gameId()).isEqualTo("1");
        }
        try (Harness inconsistent = harnessCurrent(GameSession.Status.FINISHED,
                GameSession.SettlementStatus.PENDING, user -> Optional.of(snapshot("1", Phase.PLAYING)))) {
            assertUnavailable(inconsistent);
        }
    }

    @Test
    void 정산대기_종료경기의_테이블이력이_메모리에_없어도_LOBBY로_바꾸지_않는다() throws Exception {
        try (Harness harness = harnessCurrent(GameSession.Status.FINISHED, GameSession.SettlementStatus.PENDING,
                user -> Optional.of(snapshot("1", Phase.FINISHED)))) {
            View view = harness.connect(game -> false).await("UNAVAILABLE");
            assertThat(view.code()).isEqualTo("RECOVERY_UNAVAILABLE");
            assertThat(harness.service.canUseLobby(USER_ID, "session")).isFalse();
        }
    }

    @Test
    void 서버가_확인한_기권자는_정산대기_활성마커가_있어도_로비로_복귀한다() throws Exception {
        try (Harness harness = harnessCurrent(GameSession.Status.FINISHED, GameSession.SettlementStatus.PENDING,
                user -> Optional.of(snapshot("1", Phase.FINISHED)))) {
            Inbox inbox = new Inbox();
            harness.service.connected(USER_ID, "session", null, inbox::offer, game -> false, "1"::equals);

            assertThat(inbox.await("LOBBY").gameId()).isNull();
            assertThat(harness.service.canUseLobby(USER_ID, "session")).isTrue();
            assertThat(harness.service.canControlGame(USER_ID, "session", "1")).isFalse();
            assertThat(harness.service.canForfeitGame(USER_ID, "session", "1")).isTrue();
        }
    }

    @Test
    void 정산완료인데_활성마커가_남은_기록은_정상으로_묵인하지_않는다() throws Exception {
        try (Harness harness = harnessCurrent(GameSession.Status.FINISHED, GameSession.SettlementStatus.SETTLED,
                user -> Optional.of(snapshot("1", Phase.FINISHED)))) {
            assertUnavailable(harness);
        }
    }

    @Test
    void DB조회뒤_엔진종료가_경합해도_영구불일치로_판정하지_않는다() throws Exception {
        try (Harness harness = harnessCurrent(GameSession.Status.RUNNING, GameSession.SettlementStatus.PENDING,
                user -> Optional.of(snapshot("1", Phase.FINISHED)))) {
            assertThat(harness.connect().await("FINISHED").gameId()).isEqualTo("1");
        }
    }

    private void assertUnavailable(Harness harness) throws Exception {
        View view = harness.connect().await("UNAVAILABLE");
        assertThat(view.gameId()).isNull();
        assertThat(view.state()).isNull();
        assertThat(view.code()).isEqualTo("RECOVERY_UNAVAILABLE");
        assertThat(harness.service.canUseLobby(USER_ID, "session")).isFalse();
    }

    private Harness harnessCurrent(GameSession.Status status, GameSession.SettlementStatus settlement,
            Function<Long, Optional<GameRecoverySnapshot>> engine) {
        return harness((user, identity) -> Optional.of(record(status, settlement,
                identity.instanceId(), identity.bootId())), engine);
    }

    private Harness harness(ActiveGameLookup lookup, Function<Long, Optional<GameRecoverySnapshot>> engine) {
        return harness((user, identity) -> lookup.findByUserId(user), engine);
    }

    private Harness harness(IdentityLookup lookup, Function<Long, Optional<GameRecoverySnapshot>> load) {
        GameRuntimeIdentity identity = new GameRuntimeIdentity("reconnect-test");
        ActiveGameLookup active = user -> lookup.find(user, identity);
        GameRecoveryGateway engine = new GameRecoveryGateway() {
            @Override
            public Optional<GameRecoverySnapshot> load(long userId) {
                return load.apply(userId);
            }

            @Override
            public void graceExpired(GraceExpiration command) {
            }
        };
        GameReconnectService service = new GameReconnectService(Optional.of(engine),
                Optional.of(Clock.fixed(RESERVED_AT.plusSeconds(10), ZoneOffset.UTC)),
                Optional.of(active), Optional.of(identity));
        return new Harness(service);
    }

    private ActiveGameRecord record(GameSession.Status status, GameSession.SettlementStatus settlement,
            String instanceId, UUID bootId) {
        return new ActiveGameRecord(1, "OMOK", "table-1", status, settlement,
                instanceId, bootId, RESERVED_AT, status == GameSession.Status.RESERVED ? null
                        : RESERVED_AT.plusSeconds(1),
                status == GameSession.Status.FINISHED || status == GameSession.Status.INVALID
                        ? RESERVED_AT.plusSeconds(2) : null);
    }

    private GameRecoverySnapshot snapshot(String gameId, Phase phase) {
        return new GameRecoverySnapshot(USER_ID, gameId, 2, 1, phase,
                mapper.createObjectNode().put("hand", "private-state"));
    }

    @FunctionalInterface
    private interface IdentityLookup {
        Optional<ActiveGameRecord> find(long userId, GameRuntimeIdentity identity);
    }

    private static final class Harness implements AutoCloseable {
        private final GameReconnectService service;

        private Harness(GameReconnectService service) {
            this.service = service;
        }

        private Inbox connect() {
            return connect(game -> true);
        }

        private Inbox connect(java.util.function.Predicate<String> finishedAllowed) {
            Inbox inbox = new Inbox();
            service.connected(USER_ID, "session", null, inbox::offer, finishedAllowed);
            return inbox;
        }

        @Override
        public void close() {
            service.shutdown();
        }
    }

    private static final class Inbox {
        private final BlockingQueue<View> messages = new LinkedBlockingQueue<>();

        private void offer(String requestId, View view) {
            messages.add(view);
        }

        private View await(String status) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (true) {
                View view = messages.poll(Math.max(0, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
                assertThat(view).as(status).isNotNull();
                if (view.status().equals(status)) {
                    return view;
                }
            }
        }
    }
}
