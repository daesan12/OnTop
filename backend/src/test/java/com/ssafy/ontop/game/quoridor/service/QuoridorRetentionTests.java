package com.ssafy.ontop.game.quoridor.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.result.GameFinished;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QuoridorRetentionTests {
    private final Instant startedAt = Instant.parse("2026-11-22T00:00:00Z");
    private Instant now = startedAt;
    private final Clock clock = new Clock() {
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    };
    private final ObjectMapper mapper = new ObjectMapper();
    private final GameEngineRouter router = new GameEngineRouter();
    private final List<Object> events = new ArrayList<>();
    private final QuoridorEngine engine = new QuoridorEngine(mapper, clock, events::add, router, new Random(1));

    @Test
    void 종료_후_재조회와_중복_영수증을_보존하다_삼십분에_경기와_라우터를_정리한다() {
        engine.create("q", "table", List.of(1L, 2L));
        long actor = router.load(1, "q").orElseThrow().publicState().path("turnUserId").asLong();
        GameActionCommand move = new GameActionCommand(actor, "q", "move", 1,
                mapper.createObjectNode().put("kind", "move").put("x", 4).put("y", actor == 1 ? 1 : 7));
        var accepted = router.apply(move);
        GameForfeitCommand forfeit = new GameForfeitCommand(1, "q", "leave");
        router.forfeit(forfeit);
        assertThat((Map<?, ?>) ReflectionTestUtils.getField(engine, "activeGames")).isEmpty();

        now = startedAt.plusSeconds(1800).minusMillis(1);
        engine.tick();

        assertThat(router.load(1).orElseThrow().phase().name()).isEqualTo("FINISHED");
        assertThat(router.load(99, "q").orElseThrow().publicState().path("status").asText())
                .isEqualTo("FINISHED");
        assertThat(router.apply(move)).isEqualTo(accepted);
        assertThat(router.forfeit(forfeit).duplicate()).isTrue();
        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(1);

        now = startedAt.plusSeconds(1800);
        engine.tick();
        engine.tick();

        assertThat(router.load(99, "q")).isEmpty();
        assertThat(router.load(1)).isEmpty();
        assertThat(engine.load(1, "q")).isEmpty();
        assertThat(engine.load(1)).isEmpty();
        assertThat((Map<?, ?>) ReflectionTestUtils.getField(engine, "games")).isEmpty();
        assertThat((Map<?, ?>) ReflectionTestUtils.getField(engine, "latest")).isEmpty();
        assertThat((Collection<?>) ReflectionTestUtils.getField(engine, "retirements")).isEmpty();
        assertThatThrownBy(() -> router.apply(move)).isInstanceOf(Rejected.class).hasMessage("ACCESS_DENIED");
        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
    }

    @Test
    void 과거_경기_정리는_같은_참가자와_테이블의_새_진행_경기를_지우지_않는다() {
        engine.create("q", "table", List.of(1L, 2L));
        engine.forfeit(new GameForfeitCommand(1, "q", "leave"));
        now = startedAt.plusSeconds(300);
        engine.create("next", "table", List.of(1L, 3L));

        now = startedAt.plusSeconds(1800);
        engine.tick();

        assertThat(router.load(1).orElseThrow().gameId()).isEqualTo("next");
        assertThat(engine.load(1).orElseThrow().gameId()).isEqualTo("next");
        assertThat(router.load(1, "next").orElseThrow().version()).isEqualTo(2);
        assertThat(router.load(1, "q")).isEmpty();
        assertThat(router.load(2)).isEmpty();
        assertThat(engine.load(2)).isEmpty();
        assertThat((Map<?, ?>) ReflectionTestUtils.getField(engine, "games")).hasSize(1);
        assertThat((Map<?, ?>) ReflectionTestUtils.getField(engine, "activeGames")).hasSize(1);
        assertThat((Map<?, ?>) ReflectionTestUtils.getField(engine, "latest")).hasSize(2);
        assertThatThrownBy(() -> engine.create("conflict", "table", List.of(4L, 5L)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 지연된_유예_만료는_과거_종료시간이_아닌_종료_처리_시점부터_보관한다() {
        now = startedAt.minusSeconds(7200);
        engine.create("q", "table", List.of(1L, 2L));
        now = startedAt;

        engine.graceExpired(new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(), 1, "q",
                startedAt.minusSeconds(3630), startedAt.minusSeconds(3600),
                GameRecoveryGateway.Action.FORFEIT));
        engine.tick();

        assertThat(router.load(1, "q").orElseThrow().publicState().path("endedAt").asText())
                .isEqualTo(startedAt.minusSeconds(3600).toString());
        assertThat(router.load(1).orElseThrow().phase().name()).isEqualTo("FINISHED");

        now = startedAt.plusSeconds(1800);
        engine.tick();

        assertThat(router.load(1, "q")).isEmpty();
        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
    }
}
