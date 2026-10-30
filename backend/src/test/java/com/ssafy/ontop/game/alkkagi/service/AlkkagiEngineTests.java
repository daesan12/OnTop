package com.ssafy.ontop.game.alkkagi.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateView;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class AlkkagiEngineTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final TestClock clock = new TestClock();
    private final List<Object> events = new java.util.concurrent.CopyOnWriteArrayList<>();
    private final GameEngineRouter router = new GameEngineRouter();
    private final AlkkagiEngine engine = new AlkkagiEngine(mapper, clock, events::add, router);

    @Test
    void 예약커밋_확인전에는_생성하지_않고_확정후_멱등생성한다() {
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "ALKKAGI", List.of(
                new GameStartCommand.Participant("42", 1), new GameStartCommand.Participant("84", 2)));
        assertThatThrownBy(() -> engine.startCommitted(command, GameStartResult.pending(command.startAttemptId())))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(engine.load(42)).isEmpty();
        var reserved = GameStartResult.reserved(command, "g-1");
        engine.startCommitted(command, reserved); engine.startCommitted(command, reserved);
        assertThat(engine.load(42).orElseThrow().gameId()).isEqualTo("g-1");
        assertThat(events).filteredOn(GameStateChanged.class::isInstance).hasSize(1);
        assertThatThrownBy(() -> engine.create("g-1", "other-table", 42, 84)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 조회는_물리를_진행하지_않고_물리프레임은_공통전송버전을_증가시킨다() {
        engine.create("g-1", "table", 42, 84);
        var shot = shot(42, "g-1", "shot", 1);
        var accepted = router.apply(shot);
        for (int i = 0; i < 20; i++) assertThat(engine.load(42, "g-1").orElseThrow().publicState().path("tick").asLong()).isZero();
        for (int i = 0; i < 6; i++) { clock.now += 8; engine.tick(); }
        var state = engine.load(42, "g-1").orElseThrow();
        assertThat(state.publicState().path("tick").asLong()).isEqualTo(6);
        assertThat(state.version()).isGreaterThan(accepted.version());
        assertThat(router.apply(shot)).isEqualTo(accepted);
        assertThat(events).filteredOn(e -> e instanceof GameStateChanged c && c.version() > accepted.version()).isNotEmpty();
    }

    @Test
    void 외부경기식별자와_회원소유권을_사용하고_비밀상태를_분리한다() {
        engine.create("external-game", "table", 42, 84);
        var own = router.load(42, "external-game").orElseThrow();
        var spectator = router.load(99, "external-game").orElseThrow();
        assertThat(own.privateState().path("gameId").asText()).isEqualTo("external-game");
        assertThat(spectator.role()).isEqualTo(GameStateView.Role.SPECTATOR);
        assertThat(spectator.privateState().isEmpty()).isTrue();
        assertThatThrownBy(() -> router.apply(shot(99, "external-game", "bad", 1)))
                .isInstanceOf(GameActionGateway.Rejected.class).hasMessage("ACCESS_DENIED");
        assertThatThrownBy(() -> router.apply(shot(84, "external-game", "wrong-turn", 1)))
                .hasMessage("NOT_YOUR_TURN");
        var invalid = mapper.createObjectNode().put("type", "SHOT").put("pieceId", "p13").put("dx", 0).put("dy", -1).put("power", 1).put("winnerUserId", "42");
        assertThatThrownBy(() -> router.apply(new GameActionCommand(42, "external-game", "injected", 1, invalid))).hasMessage("INVALID_ACTION");
    }

    @Test
    void 기권은_한번만_종료하고_복구후_재확인과_다음판이_가능하다() {
        engine.create("g-1", "table", 42, 84); clock.now = 100;
        var first = router.forfeit(new GameForfeitCommand(42, "g-1", "quit"));
        var again = router.forfeit(new GameForfeitCommand(42, "g-1", "retry"));
        assertThat(again.version()).isEqualTo(first.version()); assertThat(again.duplicate()).isTrue();
        assertThat(engine.load(42).orElseThrow().phase().name()).isEqualTo("FINISHED");
        assertThat(events).filteredOn(GameFinished.class::isInstance).hasSize(1);
        var finished = (GameFinished) events.stream().filter(GameFinished.class::isInstance).findFirst().orElseThrow();
        assertThat(finished.participants().getFirst().result()).isEqualTo(GameFinished.Result.FORFEIT);
        engine.tick(); assertThat(events).filteredOn(GameFinished.class::isInstance).hasSize(1);
        engine.create("g-2", "table", 42, 84);
        assertThat(router.load(42).orElseThrow().gameId()).isEqualTo("g-2");
        assertThat(router.load(42).orElseThrow().phase().name()).isEqualTo("PLAYING");
    }

    @Test
    void 재접속유예_만료만_기권으로_확정하고_중복통지는_무시한다() {
        engine.create("g-1", "table", 42, 84);
        var expiration = new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(), 42, "g-1", Instant.EPOCH,
                Instant.ofEpochMilli(30_000), GameRecoveryGateway.Action.FORFEIT);
        clock.now = 100; router.graceExpired(expiration);
        assertThat(engine.load(42).orElseThrow().phase().name()).isEqualTo("PLAYING");
        clock.now = 30_000; router.graceExpired(expiration); router.graceExpired(expiration);
        assertThat(events).filteredOn(GameFinished.class::isInstance).hasSize(1);
        assertThat(engine.load(42, "g-1").orElseThrow().publicState().path("endReason").asText()).isEqualTo("DISCONNECT_TIMEOUT");
    }

    @Test
    void 로그아웃과_탈퇴는_지정된_시각에_즉시_종료한다() {
        for (var reason : List.of(GameDepartureReason.LOGOUT, GameDepartureReason.MEMBER_DEACTIVATED)) {
            String id = "g-" + reason; engine.create(id, "table", 42, 84); clock.now += 100;
            router.graceExpired(new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(), 42, id, clock.instant(), clock.instant(),
                    GameRecoveryGateway.Action.FORFEIT, reason));
            assertThat(engine.load(42, id).orElseThrow().publicState().path("endReason").asText()).isEqualTo(reason.name());
        }
    }

    @Test
    void 서로_다른_테이블_경기의_물리와_종료는_격리한다() {
        engine.create("a", "table-a", 1, 2); engine.create("b", "table-b", 3, 4);
        router.apply(shot(1, "a", "shot", 1));
        for (int i = 0; i < 12; i++) { clock.now += 8; engine.tick(); }
        assertThat(engine.load(3, "b").orElseThrow().publicState().path("tick").asLong()).isZero();
        router.forfeit(new GameForfeitCommand(1, "a", "quit"));
        assertThat(engine.load(3, "b").orElseThrow().publicState().path("status").asText()).isEqualTo("PLAYING");
    }

    private GameActionCommand shot(long player, String gameId, String action, long version) {
        return new GameActionCommand(player, gameId, action, version, mapper.createObjectNode()
                .put("type", "SHOT").put("pieceId", "p13").put("dx", 0).put("dy", -1).put("power", .3));
    }

    @Test
    void 다중탭_동시기권도_종료이벤트는_한번이다() throws Exception {
        engine.create("race", "table", 42, 84);
        try (var workers = java.util.concurrent.Executors.newFixedThreadPool(4)) {
            var jobs = new ArrayList<java.util.concurrent.Future<?>>();
            for (int i = 0; i < 20; i++) {
                int n = i;
                jobs.add(workers.submit(() -> router.forfeit(new GameForfeitCommand(42, "race", "quit-" + n))));
            }
            for (var job : jobs) job.get(5, java.util.concurrent.TimeUnit.SECONDS);
        }
        assertThat(events).filteredOn(GameFinished.class::isInstance).hasSize(1);
    }

    @Test
    void 다음판_생성과_동시_복구조회는_반쯤_등록된_경기를_반환하지_않는다() throws Exception {
        engine.create("round-0", "table", 42, 84); router.forfeit(new GameForfeitCommand(42, "round-0", "quit"));
        try (var workers = java.util.concurrent.Executors.newFixedThreadPool(3)) {
            var read = workers.submit(() -> {
                for (int i = 0; i < 200; i++) assertThat(router.load(42).orElseThrow().userId()).isEqualTo(42);
            });
            var write = workers.submit(() -> {
                for (int i = 1; i <= 20; i++) {
                    String id = "round-" + i; engine.create(id, "table", 42, 84);
                    router.forfeit(new GameForfeitCommand(42, id, "quit"));
                }
            });
            read.get(10, java.util.concurrent.TimeUnit.SECONDS); write.get(10, java.util.concurrent.TimeUnit.SECONDS);
        }
        assertThat(router.load(42).orElseThrow().gameId()).isEqualTo("round-20");
    }
    private static final class TestClock extends Clock {
        long now;
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(now); }
        @Override public long millis() { return now; }
    }
}
