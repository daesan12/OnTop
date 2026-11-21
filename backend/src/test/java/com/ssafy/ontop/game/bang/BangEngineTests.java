package com.ssafy.ontop.game.bang;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.bang.service.BangEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateView;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BangEngineTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final Instant now = Instant.parse("2026-11-21T00:00:00Z");
    private final List<Object> events = new ArrayList<>();
    private final GameEngineRouter router = new GameEngineRouter();
    private final BangEngine engine = new BangEngine(mapper, Clock.fixed(now, ZoneOffset.UTC), events::add, router, new Random(42));

    @Test
    void 같은_경기를_다시_생성해도_역할과_손패를_재분배하지_않는다() {
        var users = LongStream.rangeClosed(1, 7).boxed().toList();
        engine.create("g1", "t1", users);
        GameStateView before = engine.load(1, "g1").orElseThrow();

        engine.create("g1", "t1", users);

        assertThat(engine.load(1, "g1").orElseThrow()).isEqualTo(before);
        assertThatThrownBy(() -> engine.create("g1", "other-table", users)).isInstanceOf(IllegalStateException.class);
        assertThat(engine.load(1).orElseThrow().participantCount()).isEqualTo(7);
        assertThat(router.load(1, "g1")).isPresent();
    }

    @Test
    void 관전_조회는_비공개_정보를_반환하지_않고_행동을_거부한다() {
        engine.create("g1", "t1", List.of(1L, 2L, 3L, 4L));

        var view = engine.load(999, "g1").orElseThrow();

        assertThat(view.role()).isEqualTo(GameStateView.Role.SPECTATOR);
        assertThat(view.privateState()).isEmpty();
        assertThat(view.publicState().toString()).doesNotContain("\"hand\"", "\"actions\"");
        assertThatThrownBy(() -> engine.apply(new GameActionCommand(999, "g1", "a1", 0,
                mapper.createObjectNode().put("kind", "end_turn")))).isInstanceOf(Rejected.class).hasMessage("ACCESS_DENIED");
    }

    @Test
    void 동일_기권은_멱등하고_경기_종료_알림을_한_번만_발행한다() {
        engine.create("g1", "t1", List.of(1L, 2L, 3L, 4L));
        long sheriff = engine.load(1, "g1").orElseThrow().publicState().path("turnUserId").asLong();
        GameForfeitCommand command = new GameForfeitCommand(sheriff, "g1", "leave");

        engine.forfeit(command);
        var repeated = engine.forfeit(command);
        engine.tick();

        assertThat(repeated.duplicate()).isTrue();
        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
        assertThat(events.stream().filter(GameStateChanged.class::isInstance)).hasSize(1);
        GameFinished finished = events.stream().filter(GameFinished.class::isInstance).map(GameFinished.class::cast).findFirst().orElseThrow();
        assertThat(finished.endReason()).isEqualTo("OUTLAWS_WIN");
        assertThat(finished.participants().stream().filter(player -> player.result() == GameFinished.Result.WIN)).hasSize(2);
        assertThat(engine.load(sheriff).orElseThrow().phase().name()).isEqualTo("FINISHED");
    }
}
