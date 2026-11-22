package com.ssafy.ontop.game.davinci;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.davinci.domain.CodeTile;
import com.ssafy.ontop.game.davinci.service.DavinciEngine;
import com.ssafy.ontop.game.davinci.service.DavinciSocial;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.state.GameStateView;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DavinciEngineTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final MutableClock clock = new MutableClock();
    private final List<Object> events = new ArrayList<>();
    private DavinciEngine engine = new DavinciEngine(mapper, clock, events::add, new GameEngineRouter(), tiles -> { });
    private List<Long> players = List.of(101L, 202L);

    @Test
    void 숫자와_조커는_같은_10초_후에만_배치되고_예약_시점은_공개하지_않는다() {
        for (int value : List.of(7, -1)) {
            String tileId = createWithPoolValue(value);
            Instant drawnAt = clock.now;
            act(101, Map.of("kind", "draw", "tileId", tileId));
            JsonNode publicBefore = view(202).publicState().deepCopy();
            var worldBefore = engine.tablePresentations();
            int count = view(101).privateState().path("tiles").size();
            JsonNode positions = view(101).privateState().path("validPositions");
            int position = positions.get(positions.size() - 1).asInt();
            long version = publicBefore.path("version").asLong();
            var selection = new GameActionCommand(101, "game", "private-place", version,
                    mapper.valueToTree(Map.of("kind", "place", "position", position)));
            events.clear();

            var accepted = engine.apply(selection);

            assertThat(accepted.version()).isEqualTo(version);
            assertThat(engine.apply(selection)).isEqualTo(accepted);
            assertThat(view(202).publicState()).isEqualTo(publicBefore);
            assertThat(engine.tablePresentations()).isEqualTo(worldBefore);
            assertThat(events).isEmpty();
            assertThat(state().path("placementDeadline").asText()).isEqualTo(drawnAt.plusSeconds(10).toString());
            assertThat(view(101).privateState().path("selectedPosition").asInt()).isEqualTo(position);
            assertThat(engine.load(101).orElseThrow().state().path("privateState").path("selectedPosition").asInt())
                    .isEqualTo(position);
            assertThat(view(202).privateState().path("selectedPosition").isNull()).isTrue();
            assertThat(view(999).privateState().isEmpty()).isTrue();
            assertThat(publicBefore.has("selectedPosition")).isFalse();
            assertThatThrownBy(() -> act(101, Map.of("kind", "guess", "targetUserId", "202",
                    "tileId", publicBefore.path("players").get(1).path("tiles").get(0).path("id").asText(),
                    "value", 0))).hasMessage("INVALID_ACTION");
            assertThatThrownBy(() -> act(101, Map.of("kind", "stop"))).hasMessage("INVALID_ACTION");

            clock.now = drawnAt.plusMillis(9999);
            engine.tick();
            assertThat(state().path("stage").asText()).isEqualTo("PLACE_TILE");
            assertThat(view(101).privateState().path("tiles").size()).isEqualTo(count);
            clock.now = drawnAt.plusSeconds(10);
            engine.tick();
            assertThat(state().path("stage").asText()).isEqualTo("GUESS");
            assertThat(state().path("version").asLong()).isEqualTo(version + 1);
            assertThat(view(101).privateState().path("tiles").get(position).path("id").asText()).isEqualTo(tileId);
            assertThat(view(101).privateState().path("selectedPosition").isNull()).isTrue();
            assertThat(state().path("placementDeadline").isNull()).isTrue();
        }
    }

    @Test
    void 미선택_패도_10초에_합법_위치로_한번만_자동_배치한다() {
        for (int value : List.of(7, -1)) {
            String tileId = createWithPoolValue(value);
            act(101, Map.of("kind", "draw", "tileId", tileId));
            List<Integer> valid = new ArrayList<>();
            view(101).privateState().path("validPositions").forEach(p -> valid.add(p.asInt()));
            int count = view(101).privateState().path("tiles").size();
            long version = state().path("version").asLong();
            clock.now = clock.now.plusSeconds(10);

            engine.tick();

            JsonNode tiles = view(101).privateState().path("tiles");
            assertThat(tiles.size()).isEqualTo(count + 1);
            int placed = -1;
            for (int i = 0; i < tiles.size(); i++) {
                if (tileId.equals(tiles.get(i).path("id").asText())) { placed = i; }
            }
            assertThat(valid).contains(placed);
            assertThat(tiles.get(placed).path("value").asInt()).isEqualTo(value);
            assertThat(state().path("stage").asText()).isEqualTo("GUESS");
            engine.tick();
            assertThat(state().path("version").asLong()).isEqualTo(version + 1);
        }
    }

    @Test
    void 마감_직전에도_10초를_보장하고_늦은_선택은_자동배치를_바꾸지_않는다() {
        String tileId = createWithPoolValue(-1);
        clock.now = clock.now.plusSeconds(119);
        act(101, Map.of("kind", "draw", "tileId", tileId));
        long version = state().path("version").asLong();
        clock.now = clock.now.plusMillis(9999);
        engine.tick();
        assertThat(state().path("stage").asText()).isEqualTo("PLACE_TILE");
        clock.now = clock.now.plusMillis(1);

        assertThatThrownBy(() -> engine.apply(new GameActionCommand(101, "game", "late", version,
                mapper.valueToTree(Map.of("kind", "place", "position", 0))))).hasMessage("STALE_VERSION");

        assertThat(state().path("stage").asText()).isEqualTo("GUESS");
        assertThat(view(101).privateState().path("tiles").findValuesAsText("id")).containsOnlyOnce(tileId);
        assertThat(Instant.parse(state().path("turnDeadline").asText())).isEqualTo(clock.now.plusSeconds(1));
        clock.now = clock.now.plusSeconds(1);
        engine.tick();
        assertThat(state().path("turnUserId").asText()).isEqualTo("202");
    }

    @Test
    void 배치중_권한과_예약변경을_검사하고_기권_후_예약을_다시_적용하지_않는다() {
        String tileId = createWithPoolValue(-1);
        act(101, Map.of("kind", "draw", "tileId", tileId));
        assertThatThrownBy(() -> act(202, Map.of("kind", "place", "position", 0)))
                .hasMessage("NOT_YOUR_TURN");
        assertThatThrownBy(() -> act(999, Map.of("kind", "place", "position", 0)))
                .hasMessage("ACCESS_DENIED");
        assertThatThrownBy(() -> act(101, Map.of("kind", "place", "position", 99)))
                .hasMessage("INVALID_ACTION");
        var first = new GameActionCommand(101, "game", "first-place", state().path("version").asLong(),
                mapper.valueToTree(Map.of("kind", "place", "position", 0)));
        engine.apply(first);
        act(101, Map.of("kind", "place", "position", 1));
        engine.apply(first);
        assertThat(view(101).privateState().path("selectedPosition").asInt()).isEqualTo(1);

        engine.forfeit(new GameForfeitCommand(101, "game", "leave-pending"));
        long version = state().path("version").asLong();
        clock.now = clock.now.plusSeconds(10);
        engine.tick();

        assertThat(state().path("status").asText()).isEqualTo("FINISHED");
        assertThat(state().path("placementDeadline").isNull()).isTrue();
        assertThat(state().path("version").asLong()).isEqualTo(version);
        assertThat(view(101).privateState().path("tiles").findValuesAsText("id")).containsOnlyOnce(tileId);
    }

    @Test
    void 무작위_뽑기는_공급_패_하나만_개인에게_전달하고_중복_요청은_다시_뽑지_않는다() {
        engine.create("game", "table", players);
        readyAll();
        JsonNode before = state().path("supply").deepCopy();
        var request = new GameActionCommand(101, "game", "random-draw", state().path("version").asLong(),
                mapper.valueToTree(Map.of("kind", "draw_random")));
        var result = engine.apply(request);
        String selected = view(101).privateState().path("pendingTile").path("id").asText();
        assertThat(before.findValuesAsText("id")).contains(selected);
        assertThat(state().path("supply").size()).isEqualTo(before.size() - 1);
        assertThat(state().path("stage").asText()).isEqualTo("PLACE_TILE");
        assertThat(view(999).privateState().size()).isZero();
        assertThat(engine.apply(request)).isEqualTo(result);
        assertThat(view(101).privateState().path("pendingTile").path("id").asText()).isEqualTo(selected);
        assertThatThrownBy(() -> act(101, Map.of("kind", "draw_random"))).isInstanceOf(Rejected.class);
    }

    @Test
    void 공원_투영은_준비중_순서와_개인_숫자를_보내지_않고_섞기_시각을_유지한다() {
        engine.create("game", "table", players);
        var initial = engine.tablePresentations().get("table");
        assertThat(initial.has("privateState")).isFalse();
        assertThat(initial.path("state").path("players").get(0).path("tiles").size()).isZero();
        String started = initial.path("state").path("openingStartedAt").asText();
        readyAll();
        var playing = engine.tablePresentations().get("table").path("state");
        assertThat(playing.path("openingStartedAt").asText()).isEqualTo(started);
        playing.path("players").forEach(player -> player.path("tiles").forEach(tile ->
                assertThat(tile.path("value").isNull()).isTrue()));
    }

    @Test
    void 사인전에서_여러_상대를_연속으로_탈락시키고_마지막_생존자를_판정한다() {
        players = List.of(101L, 202L, 303L, 404L);
        engine.create("game", "table", players);
        readyAll();
        drawAndPlace(101);

        for (long target : List.of(202L, 303L, 404L)) {
            while (state().path("players").get(players.indexOf(target)).path("active").asBoolean()) {
                guess(101, target, true);
            }
        }

        assertThat(state().path("status").asText()).isEqualTo("FINISHED");
        assertThat(state().path("winnerUserIds").get(0).asText()).isEqualTo("101");
        assertThat(events.stream().filter(GameFinished.class::isInstance).count()).isEqualTo(1);
    }

    @Test
    void 인원별_초기_타일_수를_분배하고_상대_숫자를_숨긴다() {
        for (int count = 2; count <= 4; count++) {
            engine = new DavinciEngine(mapper, clock, events::add, new GameEngineRouter(), tiles -> { });
            players = List.of(101L, 202L, 303L, 404L).subList(0, count);
            engine.create("game", "table", players);
            int each = count == 4 ? 3 : 4;
            assertThat(view(101).privateState().path("tiles").size()).isEqualTo(each);
            readyAll();
            JsonNode state = state();
            assertThat(state.path("supply").size()).isEqualTo(26 - count * each);
            for (JsonNode player : state.path("players")) {
                for (JsonNode tile : player.path("tiles")) { assertThat(tile.path("value").isNull()).isTrue(); }
            }
            assertThat(view(999).privateState().size()).isZero();
            assertThat(state.path("supply").get(0).has("value")).isFalse();
        }
    }

    @Test
    void 숫자는_오름차순이며_같은_수는_검정이_먼저다() {
        engine = new DavinciEngine(mapper, clock, events::add, new GameEngineRouter(), tiles -> {
            tiles.sort((left, right) -> Integer.compare(left.value(), right.value()));
        });
        engine.create("game", "table", players);
        readyAll();
        JsonNode hand = view(101).privateState().path("tiles");
        assertThat(hand.findValuesAsText("value")).containsExactly("-1", "-1", "0", "0");
        assertThat(hand.get(2).path("color").asText()).isEqualTo("BLACK");
        assertThat(hand.get(3).path("color").asText()).isEqualTo("WHITE");
    }

    @Test
    void 조커_위치는_한번만_설정할_수_있다() {
        engine.create("game", "table", players);
        String joker = view(101).privateState().path("unplacedJokerIds").get(0).asText();
        act(101, Map.of("kind", "place_joker", "tileId", joker, "position", 1));
        assertThatThrownBy(() -> act(101, Map.of("kind", "place_joker", "tileId", joker, "position", 0)))
                .isInstanceOf(Rejected.class).hasMessage("INVALID_ACTION");
        assertThat(view(101).privateState().path("tiles").get(1).path("id").asText()).isEqualTo(joker);
    }

    @Test
    void 첫_추리가_틀리면_뽑은_타일만_공개하고_다음_차례로_넘긴다() {
        engine.create("game", "table", players);
        readyAll();
        String drawn = drawAndPlace(101);
        guess(101, 202, false);
        JsonNode hand = view(101).privateState().path("tiles");
        assertThat(hand.findValues("revealed").stream().filter(JsonNode::asBoolean).count()).isEqualTo(1);
        for (JsonNode tile : hand) {
            if (tile.path("id").asText().equals(drawn)) { assertThat(tile.path("revealed").asBoolean()).isTrue(); }
        }
        assertThat(state().path("turnUserId").asText()).isEqualTo("202");
    }

    @Test
    void 추가_추리가_틀리면_본인이_고른_비공개_타일을_공개한다() {
        engine.create("game", "table", players);
        readyAll();
        String drawn = drawAndPlace(101);
        guess(101, 202, true);
        assertThat(state().path("stage").asText()).isEqualTo("CONTINUE");
        guess(101, 202, false);
        assertThat(state().path("stage").asText()).isEqualTo("REVEAL");
        JsonNode chosen = firstHidden(101, drawn);
        act(101, Map.of("kind", "reveal", "tileId", chosen.path("id").asText()));
        assertThat(state().path("turnUserId").asText()).isEqualTo("202");
        for (JsonNode tile : view(101).privateState().path("tiles")) {
            assertThat(tile.path("revealed").asBoolean()).isEqualTo(tile.path("id").asText().equals(chosen.path("id").asText()));
        }
    }

    @Test
    void 정답_후_멈추면_자신의_타일을_공개하지_않는다() {
        engine.create("game", "table", players);
        readyAll();
        drawAndPlace(101);
        guess(101, 202, true);
        act(101, Map.of("kind", "stop"));
        assertThat(state().path("turnUserId").asText()).isEqualTo("202");
        assertThat(view(101).privateState().findValues("revealed")).noneMatch(JsonNode::asBoolean);
    }

    @Test
    void 중앙_타일이_소진되면_뽑기를_생략하고_실패시_기존_타일을_고른다() {
        engine.create("game", "table", players);
        readyAll();
        while (!state().path("supply").isEmpty()) {
            long user = state().path("turnUserId").asLong();
            drawAndPlace(user);
            guess(user, user == 101 ? 202 : 101, false);
        }
        assertThat(state().path("stage").asText()).isEqualTo("GUESS");
        long user = state().path("turnUserId").asLong();
        guess(user, user == 101 ? 202 : 101, false);
        assertThat(state().path("stage").asText()).isEqualTo("REVEAL");
    }

    @Test
    void 상대_타일을_모두_맞히면_한번만_종료하고_기존_숫자는_계속_보호한다() {
        engine.create("game", "table", players);
        readyAll();
        drawAndPlace(101);
        while (!state().path("status").asText().equals("FINISHED")) { guess(101, 202, true); }
        assertThat(state().path("winnerUserIds").get(0).asText()).isEqualTo("101");
        engine.tick();
        assertThat(events.stream().filter(GameFinished.class::isInstance).count()).isEqualTo(1);
        assertThat(view(999).privateState().size()).isZero();
        assertThat(state().path("players").get(0).path("tiles").findValues("value")).allMatch(JsonNode::isNull);
    }

    @Test
    void 동일_행동은_재처리하지_않고_다른_내용의_동일_ID는_거절한다() {
        engine.create("game", "table", players);
        JsonNode input = mapper.valueToTree(Map.of("kind", "place_joker", "tileId",
                view(101).privateState().path("unplacedJokerIds").get(0).asText(), "position", 0));
        GameActionCommand first = new GameActionCommand(101, "game", "receipt", 0, input);
        assertThat(engine.apply(first)).isEqualTo(engine.apply(first));
        assertThatThrownBy(() -> engine.apply(new GameActionCommand(101, "game", "receipt", 0,
                mapper.valueToTree(Map.of("kind", "ready"))))).hasMessage("ACTION_ID_CONFLICT");
        assertThatThrownBy(() -> engine.apply(new GameActionCommand(101, "game", "old", 0, input)))
                .hasMessage("STALE_VERSION");
    }

    @Test
    void 관전자와_다른_차례의_사용자는_입력할_수_없다() {
        engine.create("game", "table", players);
        readyAll();
        assertThatThrownBy(() -> act(999, Map.of("kind", "draw", "tileId", "anything"))).hasMessage("ACCESS_DENIED");
        assertThatThrownBy(() -> act(202, Map.of("kind", "draw", "tileId", "anything"))).hasMessage("NOT_YOUR_TURN");
    }

    @Test
    void 복구에는_본인_숫자만_포함되고_같은_경기_생성은_멱등적이다() {
        engine.create("game", "table", players);
        engine.create("game", "table", players);
        assertThat(engine.load(101).orElseThrow().state().path("privateState").path("userId").asText()).isEqualTo("101");
        assertThat(engine.load(999)).isEmpty();
        assertThatThrownBy(() -> engine.create("game", "other-table", players)).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 기권_중복과_시간초과가_종료_이벤트를_중복_발행하지_않는다() {
        engine.create("game", "table", players);
        readyAll();
        clock.now = clock.now.plusSeconds(121);
        engine.tick();
        assertThat(state().path("turnUserId").asText()).isEqualTo("202");
        assertThat(state().path("players").get(0).path("tiles").findValues("revealed").stream().filter(JsonNode::asBoolean).count()).isEqualTo(1);
        var command = new GameForfeitCommand(202, "game", "leave");
        engine.forfeit(command);
        assertThat(engine.forfeit(command).duplicate()).isTrue();
        engine.tick();
        assertThat(events.stream().filter(GameFinished.class::isInstance).count()).isEqualTo(1);
    }

    @Test
    void 추천_핑은_공개_게임판의_타일_ID만_허용한다() {
        engine.create("game", "table", players);
        readyAll();
        String tileId = state().path("players").get(0).path("tiles").get(0).path("id").asText();
        assertThat(DavinciSocial.validTarget(state(), "101", tileId)).isTrue();
        assertThat(DavinciSocial.validTarget(state(), "202", tileId)).isFalse();
        assertThat(DavinciSocial.validTarget(state(), "101", state().path("supply").get(0).path("id").asText())).isFalse();
    }

    private GameStateView view(long user) { return engine.load(user, "game").orElseThrow(); }
    private JsonNode state() { return view(101).publicState(); }

    private void readyAll() {
        for (long user : players) {
            JsonNode ids = view(user).privateState().path("unplacedJokerIds");
            for (JsonNode id : ids) { act(user, Map.of("kind", "place_joker", "tileId", id.asText(), "position", 0)); }
            act(user, Map.of("kind", "ready"));
        }
    }

    private void act(long user, Map<String, Object> input) {
        engine.apply(new GameActionCommand(user, "game", UUID.randomUUID().toString(), state().path("version").asLong(), mapper.valueToTree(input)));
    }

    private String drawAndPlace(long user) {
        String tileId = state().path("supply").get(0).path("id").asText();
        act(user, Map.of("kind", "draw", "tileId", tileId));
        act(user, Map.of("kind", "place", "position", view(user).privateState().path("validPositions").get(0).asInt()));
        clock.now = clock.now.plusSeconds(10);
        engine.tick();
        return tileId;
    }

    private String createWithPoolValue(int value) {
        String[] selected = new String[1];
        engine = new DavinciEngine(mapper, clock, events::add, new GameEngineRouter(), tiles -> {
            tiles.sort(Comparator.comparingInt(tile -> tile.value() == -1 ? 1 : 0));
            selected[0] = tiles.stream().filter(tile -> tile.color() == CodeTile.Color.WHITE && tile.value() == value)
                    .findFirst().orElseThrow().id();
        });
        engine.create("game", "table", players);
        readyAll();
        return selected[0];
    }

    private JsonNode firstHidden(long user, String excluded) {
        for (JsonNode tile : view(user).privateState().path("tiles")) {
            if (!tile.path("revealed").asBoolean() && !tile.path("id").asText().equals(excluded)) { return tile; }
        }
        throw new AssertionError("비공개 타일이 없습니다.");
    }

    private void guess(long user, long target, boolean correct) {
        JsonNode tile = firstHidden(target, "");
        int value = tile.path("value").asInt();
        act(user, Map.of("kind", "guess", "targetUserId", Long.toString(target), "tileId", tile.path("id").asText(),
                "value", correct ? value : value == 11 ? 0 : value + 1));
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-11-21T00:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
