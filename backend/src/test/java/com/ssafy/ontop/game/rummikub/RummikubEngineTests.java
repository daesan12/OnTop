package com.ssafy.ontop.game.rummikub;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameFinishedResultListener;
import com.ssafy.ontop.game.result.GameResultService;
import com.ssafy.ontop.game.rummikub.service.RummikubEngine;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.table.service.TableHub;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class RummikubEngineTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final List<Object> events = new ArrayList<>();
    private final RummikubEngine engine = new RummikubEngine(mapper,
            Clock.fixed(Instant.parse("2026-11-21T00:00:00Z"), ZoneOffset.UTC), events::add,
            new GameEngineRouter(), tiles -> java.util.Collections.swap(tiles, 0, 12), size -> 0);

    @Test
    void 선공은_추첨_타일의_최고_숫자이며_조커가_13보다_높다() {
        var shuffles = new AtomicInteger();
        var openingEngine = new RummikubEngine(mapper, Clock.systemUTC(), events::add, new GameEngineRouter(),
                tiles -> {
                    if (shuffles.getAndIncrement() == 0) {
                        moveFirst(tiles, List.of("RED-13-0", "JOKER-0", "BLUE-12-0", "BLACK-1-0"));
                    }
                }, size -> 0);

        openingEngine.create("opening", "table", List.of(1L, 2L, 3L, 4L));
        var state = openingEngine.load(99, "opening").orElseThrow().publicState();

        assertThat(state.path("firstUserId").asText()).isEqualTo("2");
        assertThat(state.path("turnUserId").asText()).isEqualTo("2");
        assertThat(state.path("openingDraws").get(1).path("color").isNull()).isTrue();
        assertThat(state.path("turnTimeLimitMs").asInt()).isEqualTo(60000);
        assertThat(state.path("poolCount").asInt()).isEqualTo(50);
        assertThat(shuffles.get()).isEqualTo(2);
    }

    @Test
    void 선공_동점이면_최고_숫자를_뽑은_참가자_중에서만_정한다() {
        var openingEngine = new RummikubEngine(mapper, Clock.systemUTC(), events::add, new GameEngineRouter(),
                tiles -> moveFirst(tiles, List.of("RED-12-0", "BLUE-1-0", "BLACK-12-0")), size -> size - 1);

        openingEngine.create("opening", "table", List.of(1L, 2L, 3L));

        assertThat(openingEngine.load(1, "opening").orElseThrow().publicState().path("firstUserId").asText())
                .isEqualTo("3");
    }

    private static void moveFirst(List<com.ssafy.ontop.game.rummikub.domain.RummikubTile> tiles, List<String> ids) {
        for (int index = 0; index < ids.size(); index++) {
            String id = ids.get(index);
            int source = java.util.stream.IntStream.range(0, tiles.size()).filter(i -> tiles.get(i).id().equals(id))
                    .findFirst().orElseThrow();
            java.util.Collections.swap(tiles, index, source);
        }
    }

    @Test
    void 공통_종료_이벤트가_테이블_종료와_참가자_결과_조회를_연결한다() {
        engine.create("game", "table", List.of(1L, 2L));
        engine.forfeit(new GameForfeitCommand(1, "game", "forfeit"));
        var finished = (GameFinished) events.stream().filter(GameFinished.class::isInstance)
                .findFirst().orElseThrow();
        var tables = mock(TableHub.class);
        var results = mock(GameResultService.class);

        new GameFinishedResultListener(results, Optional.of(tables)).finished(finished);

        verify(tables).roundEnded("table", "game");
        verify(results).finished("game", List.of(1L, 2L));
    }

    @Test
    void 참가자는_자신의_손패만_받고_관전자는_빈_개인상태를_받는다() {
        engine.create("game", "table", List.of(1L, 2L));
        var first = engine.load(1, "game").orElseThrow();
        var second = engine.load(2, "game").orElseThrow();
        var viewer = engine.load(99, "game").orElseThrow();

        assertThat(first.privateState().path("userId").asText()).isEqualTo("1");
        assertThat(second.privateState().path("userId").asText()).isEqualTo("2");
        assertThat(first.privateState().path("tiles").size()).isEqualTo(14);
        assertThat(viewer.privateState().size()).isZero();
        assertThat(viewer.publicState()).isEqualTo(first.publicState());
        assertThat(viewer.publicState().toString()).doesNotContain("BLACK-1-0");
    }

    @Test
    void 같은_경기_재생성은_멱등적이고_다른_참가자나_테이블은_거절한다() {
        engine.create("game", "table", List.of(1L, 2L));
        var before = engine.load(1, "game").orElseThrow();
        engine.create("game", "table", List.of(1L, 2L));

        assertThat(engine.load(1, "game").orElseThrow()).isEqualTo(before);
        assertThatThrownBy(() -> engine.create("game", "other", List.of(1L, 2L))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> engine.create("game", "table", List.of(2L, 1L))).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 재접속_상태는_같은_경기의_공개상태와_본인_손패를_복원한다() {
        engine.create("game", "table", List.of(1L, 2L));
        engine.apply(new GameActionCommand(1, "game", "draw", 0, mapper.valueToTree(Map.of("kind", "draw"))));
        var recovered = engine.load(1).orElseThrow();

        assertThat(recovered.gameId()).isEqualTo("game");
        assertThat(recovered.version()).isEqualTo(1);
        assertThat(recovered.state().path("privateState").path("tiles").size()).isEqualTo(15);
        assertThat(events.stream().filter(GameStateChanged.class::isInstance)).hasSize(1);
    }

    @Test
    void 기권_중복요청은_종료와_정산_이벤트를_중복시키지_않는다() {
        engine.create("game", "table", List.of(1L, 2L));
        var command = new GameForfeitCommand(1, "game", "forfeit");
        var first = engine.forfeit(command);
        var second = engine.forfeit(command);

        assertThat(second.version()).isEqualTo(first.version());
        assertThat(second.duplicate()).isTrue();
        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
        GameFinished finished = (GameFinished) events.stream().filter(GameFinished.class::isInstance).findFirst().orElseThrow();
        assertThat(finished.gameCode()).isEqualTo("RUMMIKUB");
        assertThat(finished.participants().getFirst().result()).isEqualTo(GameFinished.Result.FORFEIT);
        assertThat(finished.participants().get(1).result()).isEqualTo(GameFinished.Result.WIN);
    }
}
