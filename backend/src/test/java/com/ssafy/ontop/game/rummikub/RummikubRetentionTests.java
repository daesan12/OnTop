package com.ssafy.ontop.game.rummikub;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway.Action;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway.GraceExpiration;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.rummikub.domain.RummikubTile;
import com.ssafy.ontop.game.rummikub.service.RummikubEngine;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RummikubRetentionTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final MovingClock clock = new MovingClock();
    private final List<Object> events = new ArrayList<>();
    private final GameEngineRouter router = new GameEngineRouter();
    private final RummikubEngine engine = new RummikubEngine(mapper, clock, events::add, router,
            tiles -> java.util.Collections.swap(tiles, 0, 12), size -> 0);

    @Test
    void 종료된_경기는_틱에서_제외하고_30분_직전까지_복구와_중복_영수증을_보존한다() {
        engine.create("old", "table", List.of(1L, 2L));
        var draw = new GameActionCommand(1, "old", "draw", 0, mapper.valueToTree(Map.of("kind", "draw")));
        var accepted = engine.apply(draw);
        var forfeit = new GameForfeitCommand(2, "old", "forfeit");
        engine.forfeit(forfeit);
        int eventCount = events.size();

        clock.advance(Duration.ofMinutes(30).minusMillis(1));
        engine.tick();

        assertThat((Map<?, ?>) ReflectionTestUtils.getField(engine, "activeGames")).isEmpty();
        assertThat(engine.load(1, "old").orElseThrow().publicState().path("status").asText()).isEqualTo("FINISHED");
        assertThat(router.load(1).orElseThrow().gameId()).isEqualTo("old");
        assertThat(engine.apply(draw)).isEqualTo(accepted);
        assertThat(engine.forfeit(forfeit).duplicate()).isTrue();
        assertThat(events).hasSize(eventCount);
    }

    @Test
    void 보관_기한에_경기와_라우터와_최근_복구_참조를_제거한다() {
        engine.create("old", "table", List.of(1L, 2L));
        engine.forfeit(new GameForfeitCommand(1, "old", "forfeit"));
        int eventCount = events.size();

        clock.advance(Duration.ofMinutes(30));
        engine.tick();

        assertThat(engine.load(1, "old")).isEmpty();
        assertThat(engine.load(1)).isEmpty();
        assertThat(engine.load(2)).isEmpty();
        assertThat(router.load(1, "old")).isEmpty();
        assertThat(router.load(1)).isEmpty();
        assertThatThrownBy(() -> router.forfeit(new GameForfeitCommand(1, "old", "retry")))
                .isInstanceOf(Rejected.class);
        assertThat((Map<?, ?>) ReflectionTestUtils.getField(engine, "games")).isEmpty();
        assertThat(events).hasSize(eventCount);
    }

    @Test
    void 이전_경기_정리가_같은_참가자와_테이블의_새_경기를_제거하지_않는다() {
        engine.create("old", "table", List.of(1L, 2L));
        engine.forfeit(new GameForfeitCommand(1, "old", "forfeit"));
        clock.advance(Duration.ofMinutes(10));
        engine.create("new", "table", List.of(1L, 2L));

        clock.advance(Duration.ofMinutes(20));
        engine.tick();

        assertThat(engine.load(1, "old")).isEmpty();
        assertThat(engine.load(1).orElseThrow().gameId()).isEqualTo("new");
        assertThat(router.load(1).orElseThrow().gameId()).isEqualTo("new");
        assertThat(router.load(1, "new").orElseThrow().publicState().path("status").asText()).isEqualTo("PLAYING");
        assertThatThrownBy(() -> engine.create("collision", "table", List.of(3L, 4L)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 이탈_처리가_늦어도_실제_처리_시점부터_30분을_보관한다() {
        engine.create("late", "table", List.of(1L, 2L));
        Instant disconnectedAt = clock.instant();
        Instant deadline = disconnectedAt.plusSeconds(60);
        clock.advance(Duration.ofHours(2));

        engine.graceExpired(new GraceExpiration(UUID.randomUUID(), 1, "late", disconnectedAt, deadline,
                Action.FORFEIT));

        clock.advance(Duration.ofMinutes(30).minusMillis(1));
        assertThat(engine.load(1, "late").orElseThrow().publicState().path("endedAt").asText())
                .isEqualTo(deadline.toString());
        clock.advance(Duration.ofMillis(1));
        engine.tick();
        assertThat(engine.load(1, "late")).isEmpty();
        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
    }

    @Test
    void 같은_틱에서_여러_경기가_끝나도_모두_처리하고_보관_기한에_정리한다() {
        for (long first : List.of(1L, 3L)) {
            String gameId = "game" + first;
            engine.create(gameId, "table" + first, List.of(first, first + 1));
            for (int index = 0; index < 79; index++) {
                var state = engine.load(first, gameId).orElseThrow();
                long turn = state.publicState().path("turnUserId").asLong();
                engine.apply(new GameActionCommand(turn, gameId, "draw" + index, state.version(),
                        mapper.valueToTree(Map.of("kind", "draw"))));
            }
        }

        clock.advance(Duration.ofSeconds(60));
        engine.tick();

        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(2);
        assertThat((Map<?, ?>) ReflectionTestUtils.getField(engine, "activeGames")).isEmpty();
        clock.advance(Duration.ofMinutes(30));
        engine.tick();
        assertThat(router.load(1, "game1")).isEmpty();
        assertThat(router.load(3, "game3")).isEmpty();
        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(2);
    }

    @Test
    void 정상_빈손_승리도_종료_상태를_보관한_뒤_정리한다() {
        var first = new ArrayList<>(RummikubMatchTests.run("RED", 7, 13));
        first.addAll(RummikubMatchTests.run("BLUE", 7, 13));
        var ids = new ArrayList<>(first.stream().map(tile -> tile.id()).toList());
        ids.remove("RED-13-0");
        ids.addFirst("RED-13-0");
        var winningEngine = new RummikubEngine(mapper, clock, events::add, router, tiles -> moveFirst(tiles, ids),
                size -> 0);
        winningEngine.create("win", "table", List.of(1L, 2L));

        winningEngine.apply(new GameActionCommand(1, "win", "play", 0, mapper.valueToTree(Map.of(
                "kind", "play", "melds", List.of(RummikubMatchTests.run("RED", 7, 13),
                        RummikubMatchTests.run("BLUE", 7, 13))))));

        assertThat(winningEngine.load(1, "win").orElseThrow().publicState().path("endReason").asText())
                .isEqualTo("EMPTY_HAND");
        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
        clock.advance(Duration.ofMinutes(30));
        winningEngine.tick();
        assertThat(winningEngine.load(1, "win")).isEmpty();
        assertThat(router.load(1)).isEmpty();
    }

    private static void moveFirst(List<RummikubTile> tiles, List<String> ids) {
        for (int index = 0; index < ids.size(); index++) {
            String id = ids.get(index);
            int source = IntStream.range(0, tiles.size()).filter(i -> tiles.get(i).id().equals(id))
                    .findFirst().orElseThrow();
            java.util.Collections.swap(tiles, index, source);
        }
    }

    private static final class MovingClock extends Clock {
        private Instant now = Instant.parse("2026-11-22T00:00:00Z");

        void advance(Duration elapsed) { now = now.plus(elapsed); }

        @Override
        public ZoneId getZone() { return ZoneOffset.UTC; }

        @Override
        public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }

        @Override
        public Instant instant() { return now; }
    }
}
