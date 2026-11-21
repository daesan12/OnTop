package com.ssafy.ontop.game.quoridor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.state.GameStateChanged;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QuoridorEngineTests {
    @Test
    void 자동이동만으로_도착하면_한번만_종료하고_마감시간을_제거한다() {
        Instant[] current = {Instant.parse("2026-11-21T00:00:00Z")};
        Clock clock = new Clock() {
            @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return current[0]; }
        };
        QuoridorEngine timed = new QuoridorEngine(mapper, clock, events::add, new GameEngineRouter(), new Random(1));
        timed.create("q", "table", List.of(1L, 2L));

        for (int turn = 0; turn < 20; turn++) {
            current[0] = current[0].plusSeconds(30);
            timed.tick();
        }

        var state = timed.load(99, "q").orElseThrow().publicState();
        assertThat(state.path("status").asText()).isEqualTo("FINISHED");
        assertThat(state.path("endReason").asText()).isEqualTo("GOAL_REACHED");
        assertThat(state.path("turnDeadline").isNull()).isTrue();
        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
    }
    @Test
    void 마감_입력은_자동이동_후_거절하고_복구와_관전에_같은_새_시간을_보낸다() {
        Instant[] current = {Instant.parse("2026-11-21T00:00:00Z")};
        Clock clock = new Clock() {
            @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return current[0]; }
        };
        QuoridorEngine timed = new QuoridorEngine(mapper, clock, events::add, new GameEngineRouter(), new Random(1));
        timed.create("q", "table", List.of(1L, 2L));
        long actor = timed.load(1, "q").orElseThrow().publicState().path("turnUserId").asLong();
        current[0] = current[0].plusSeconds(30);

        assertThatThrownBy(() -> timed.apply(move("late", actor, 1, 4, actor == 1 ? 1 : 7)))
                .isInstanceOf(Rejected.class).hasMessage("STALE_VERSION");
        timed.tick();
        var watched = timed.load(99, "q").orElseThrow();

        assertThat(watched.version()).isEqualTo(2);
        assertThat(events.stream().filter(GameStateChanged.class::isInstance)).hasSize(1);
        assertThat(watched.publicState().path("turnDeadline").asText()).isEqualTo("2026-11-21T00:01:00Z");
        assertThat(timed.load(actor).orElseThrow().state().path("publicState")).isEqualTo(watched.publicState());
        assertThat(watched.publicState().path("walls")).isEmpty();
        assertThat(watched.privateState().isEmpty()).isTrue();
    }
    private final ObjectMapper mapper = new ObjectMapper();
    private final List<Object> events = new ArrayList<>();
    private final Instant now = Instant.parse("2026-11-21T00:00:00Z");
    private final QuoridorEngine engine = new QuoridorEngine(mapper, Clock.fixed(now, ZoneOffset.UTC),
            events::add, new GameEngineRouter(), new Random(1));

    private GameActionCommand move(String action, long actor, long version, int x, int y) {
        return new GameActionCommand(actor, "q", action, version,
                mapper.createObjectNode().put("kind", "move").put("x", x).put("y", y));
    }

    private long turn() {
        return engine.load(1, "q").orElseThrow().publicState().path("turnUserId").asLong();
    }

    @Test
    void 같은_입력은_중복_실행하지_않고_내용이_다르면_거절한다() {
        engine.create("q", "table", List.of(1L, 2L));
        long actor = turn();
        GameActionCommand command = move("action-1", actor, 1, 4, actor == 1 ? 1 : 7);

        assertThat(engine.apply(command)).isEqualTo(engine.apply(command));
        assertThat(events.stream().filter(GameStateChanged.class::isInstance)).hasSize(1);
        assertThatThrownBy(() -> engine.apply(move("action-1", actor, 1, 3, 0)))
                .isInstanceOf(Rejected.class).hasMessage("ACTION_ID_CONFLICT");
    }

    @Test
    void 관전자와_다른_차례와_낡은_버전과_잘못된_좌표를_거절한다() {
        engine.create("q", "table", List.of(1L, 2L));
        long actor = turn();

        assertThatThrownBy(() -> engine.apply(move("watch", 3, 1, 4, 1)))
                .isInstanceOf(Rejected.class).hasMessage("ACCESS_DENIED");
        assertThatThrownBy(() -> engine.apply(move("other", actor == 1 ? 2 : 1, 1, 4, 1)))
                .isInstanceOf(Rejected.class).hasMessage("NOT_YOUR_TURN");
        assertThatThrownBy(() -> engine.apply(move("stale", actor, 0, 4, 1)))
                .isInstanceOf(Rejected.class).hasMessage("STALE_VERSION");
        assertThatThrownBy(() -> engine.apply(move("bad", actor, 1, Integer.MAX_VALUE, 1)))
                .isInstanceOf(Rejected.class).hasMessage("INVALID_ACTION");
    }

    @Test
    void 같은_경기_재생성은_보존하고_참가자가_다르면_거절한다() {
        engine.create("q", "table", List.of(1L, 2L));
        long actor = turn();
        engine.apply(move("move", actor, 1, 4, actor == 1 ? 1 : 7));

        engine.create("q", "table", List.of(1L, 2L));

        assertThat(engine.load(1, "q").orElseThrow().version()).isEqualTo(2);
        assertThatThrownBy(() -> engine.create("q", "other", List.of(1L, 2L)))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> engine.create("q", "table", List.of(2L, 1L)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 복구와_관전에는_개인정보_없이_같은_공개_판을_보낸다() {
        engine.create("q", "table", List.of(1L, 2L, 3L, 4L));

        var view = engine.load(99, "q").orElseThrow();
        var recovery = engine.load(1).orElseThrow();

        assertThat(view.role().name()).isEqualTo("SPECTATOR");
        assertThat(view.privateState().isEmpty()).isTrue();
        assertThat(recovery.state().path("publicState")).isEqualTo(view.publicState());
        assertThat(view.publicState().path("legalWalls")).hasSize(128);
    }

    @Test
    void 기권과_유예_만료가_중복되어도_종료와_정산_이벤트는_하나뿐이다() {
        engine.create("q", "table", List.of(1L, 2L));
        var command = new GameForfeitCommand(1, "q", "forfeit-1");

        engine.forfeit(command);
        engine.forfeit(command);
        engine.graceExpired(new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(), 1, "q",
                now.minusSeconds(30), now, GameRecoveryGateway.Action.FORFEIT));

        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
        GameFinished finished = (GameFinished) events.stream().filter(GameFinished.class::isInstance)
                .findFirst().orElseThrow();
        assertThat(finished.participants()).extracting(p -> p.result().name()).containsExactly("FORFEIT", "WIN");
    }

    @Test
    void 재접속_유예_전에는_기권시키지_않는다() {
        engine.create("q", "table", List.of(1L, 2L));

        engine.graceExpired(new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(), 1, "q", now,
                now.plusSeconds(30), GameRecoveryGateway.Action.FORFEIT));

        assertThat(engine.load(1, "q").orElseThrow().version()).isEqualTo(1);
        assertThat(events).isEmpty();
    }
}
