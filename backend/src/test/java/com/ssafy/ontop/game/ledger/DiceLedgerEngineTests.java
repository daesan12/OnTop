package com.ssafy.ontop.game.ledger;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.ledger.service.DiceLedgerEngine;
import com.ssafy.ontop.game.ledger.service.DiceLedgerGameFinished;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.result.GameFinished;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class DiceLedgerEngineTests {
    private static final String GAME = "ledger";
    // 위칸6칸 합63(보너스35) + 자유26 + 포카드24 + 풀하우스(같은 눈5개)15 + 스몰15 + 라지30 + 장원50 = 258
    private static final List<Object[]> PERFECT = List.of(
            turn("ONES", 1,1,1,2,3), turn("TWOS", 2,2,2,1,3), turn("THREES", 3,3,3,1,2),
            turn("FOURS", 4,4,4,1,2), turn("FIVES", 5,5,5,1,2), turn("SIXES", 6,6,6,1,2),
            turn("CHOICE", 6,6,5,5,4), turn("FOUR_OF_A_KIND", 6,6,6,6,5), turn("FULL_HOUSE", 3,3,3,3,3),
            turn("SMALL_STRAIGHT", 1,2,3,4,6), turn("LARGE_STRAIGHT", 2,3,4,5,6), turn("FIVE_OF_A_KIND", 4,4,4,4,4));
    private final ObjectMapper mapper = new ObjectMapper();
    private final TestClock clock = new TestClock();
    private final List<Object> events = new CopyOnWriteArrayList<>();
    private final GameEngineRouter router = new GameEngineRouter();
    private final ArrayDeque<Integer> faces = new ArrayDeque<>();
    private final DiceLedgerEngine engine = new DiceLedgerEngine(mapper, clock, events::add, router,
            () -> faces.removeFirst(), count -> 0);

    @Test
    void 굴림은세번까지이고_고정은굴림마다자유롭게바꾼다() {
        engine.create(GAME, "table", List.of(101L, 202L));
        reject(Rejection.INVALID_ACTION, () -> act(101, "early", 0, score("CHOICE")));
        reject(Rejection.INVALID_ACTION, () -> act(101, "keep-first", 0, roll(0)));
        roll(101, "r1", 0, List.of(), 1,2,3,4,5);
        roll(101, "r2", 1, List.of(0, 1), 6,6,6);
        assertThat(state().path("dice").get(0).path("held").asBoolean()).isTrue();
        assertThat(state().path("dice").get(0).path("value").asInt()).isEqualTo(1);
        assertThat(state().path("dice").get(2).path("held").asBoolean()).isFalse();
        // 앞에서 고정한 주사위도 다음 굴림에서 다시 굴릴 수 있다.
        roll(101, "r3", 2, List.of(2, 3, 4), 6,6);
        assertThat(state().path("rollCount").asInt()).isEqualTo(3);
        assertThat(state().path("dice").get(0).path("value").asInt()).isEqualTo(6);
        reject(Rejection.INVALID_ACTION, () -> act(101, "r4", 3, roll()));
        reject(Rejection.NOT_YOUR_TURN, () -> act(202, "other", 3, score("CHOICE")));
        reject(Rejection.STALE_VERSION, () -> act(101, "stale", 2, score("CHOICE")));
        reject(Rejection.INVALID_ACTION, () -> act(101, "bad", 3, score("YACHT")));
        reject(Rejection.INVALID_ACTION, () -> act(101, "dup", 3, roll(1, 1)));
        reject(Rejection.INVALID_ACTION, () -> act(101, "range", 3,
                mapper.valueToTree(Map.of("kind", "roll", "keepIds", List.of(5)))));
        reject(Rejection.INVALID_ACTION, () -> act(101, "extra", 3,
                mapper.valueToTree(Map.of("kind", "score", "category", "CHOICE", "points", 99))));
        act(101, "s1", 3, score("FIVE_OF_A_KIND"));
        // 같은 행동 ID·내용 재전송은 기존 결과를 돌려주고 상태를 바꾸지 않는다.
        assertThat(act(101, "s1", 3, score("FIVE_OF_A_KIND")).version()).isEqualTo(4);
        assertThat(card(0).path("scores").path("FIVE_OF_A_KIND").asInt()).isEqualTo(50);
        assertThat(card(0).path("scores").path("CHOICE").isNull()).isTrue();
        assertThat(state().path("turnUserId").asText()).isEqualTo("202");
        assertThat(state().path("rollCount").asInt()).isZero();
        assertThat(state().path("dice").isEmpty()).isTrue();
        assertThat(state().path("lastScored").path("points").asInt()).isEqualTo(50);
        assertThat(state().path("lastScored").path("auto").asBoolean()).isFalse();
        roll(202, "b1", 4, List.of(), 1,1,1,1,1);
        act(202, "b2", 5, score("ONES"));
        roll(101, "r5", 6, List.of(), 6,6,6,6,6);
        reject(Rejection.INVALID_ACTION, () -> act(101, "again", 7, score("FIVE_OF_A_KIND")));
    }

    @Test
    void 열두칸을모두채우면_보너스포함총점으로승자를정하고종료는한번이다() {
        engine.create(GAME, "table", List.of(101L, 202L));
        for (int index = 0; index < 12; index++) {
            play(101, PERFECT.get(index));
            Object[] other = PERFECT.get(index);
            play(202, index == 4 ? turn("FIVES", 5,5,1,1,2) : other);
        }
        JsonNode state = state();
        assertThat(state.path("status").asText()).isEqualTo("FINISHED");
        assertThat(state.path("endReason").asText()).isEqualTo("ALL_CATEGORIES_FILLED");
        assertThat(card(0).path("upperSubtotal").asInt()).isEqualTo(63);
        assertThat(card(0).path("upperBonus").asInt()).isEqualTo(35);
        assertThat(card(0).path("total").asLong()).isEqualTo(258);
        assertThat(card(1).path("upperBonus").asInt()).isZero();
        assertThat(card(1).path("total").asLong()).isEqualTo(218);
        assertThat(state.path("winnerUserIds").toString()).isEqualTo("[\"101\"]");
        assertThat(state.path("turnDeadline").isNull()).isTrue();
        assertThat(events.stream().filter(DiceLedgerGameFinished.class::isInstance)).hasSize(1);
        GameFinished finished = events.stream().filter(GameFinished.class::isInstance).map(GameFinished.class::cast)
                .findFirst().orElseThrow();
        assertThat(finished.gameCode()).isEqualTo("DICE_LEDGER");
        assertThat(finished.participants()).extracting(GameFinished.Participant::result)
                .containsExactly(GameFinished.Result.WIN, GameFinished.Result.LOSE);
        reject(Rejection.GAME_FINISHED, () -> act(101, "late", version(), roll()));
        assertThat(router.load(101).orElseThrow().phase().name()).isEqualTo("FINISHED");
    }

    @Test
    void 최고점동점은모두공동승자다() {
        engine.create(GAME, "table", List.of(101L, 202L, 303L));
        for (int index = 0; index < 12; index++) {
            play(101, PERFECT.get(index));
            play(202, PERFECT.get(index));
            play(303, index == 0 ? turn("ONES", 2,2,2,2,3) : PERFECT.get(index));
        }
        assertThat(state().path("winnerUserIds").toString()).isEqualTo("[\"101\",\"202\"]");
        GameFinished finished = events.stream().filter(GameFinished.class::isInstance).map(GameFinished.class::cast)
                .findFirst().orElseThrow();
        assertThat(finished.participants()).extracting(GameFinished.Participant::result)
                .containsExactly(GameFinished.Result.WIN, GameFinished.Result.WIN, GameFinished.Result.LOSE);
    }

    @Test
    void 시간초과는미굴림이면서버가굴리고_빈칸중최고점칸에자동기록한다() {
        engine.create(GAME, "table", List.of(101L, 202L));
        Instant first = Instant.parse(state().path("turnDeadline").asText());
        faces.addAll(List.of(6,6,6,6,6));
        clock.advance(20);
        engine.tick();
        assertThat(faces).isEmpty();
        assertThat(card(0).path("scores").path("FIVE_OF_A_KIND").asInt()).isEqualTo(50);
        assertThat(state().path("lastEvent").asText()).isEqualTo("TURN_TIMEOUT");
        assertThat(state().path("lastScored").path("auto").asBoolean()).isTrue();
        assertThat(state().path("turnUserId").asText()).isEqualTo("202");
        assertThat(Instant.parse(state().path("turnDeadline").asText())).isEqualTo(first.plusSeconds(20));
        // 굴릴 때마다 그 시각부터 20초를 다시 준다.
        clock.advance(10);
        roll(202, "b1", 1, List.of(), 1,3,4,6,6);
        assertThat(Instant.parse(state().path("turnDeadline").asText())).isEqualTo(first.plusSeconds(30));
        clock.advance(15);
        roll(202, "b2", 2, List.of(0,1,2,3,4));
        assertThat(Instant.parse(state().path("turnDeadline").asText())).isEqualTo(first.plusSeconds(45));
        clock.advance(19);
        engine.tick();
        assertThat(state().path("turnUserId").asText()).isEqualTo("202");
        // 굴린 뒤 만료되면 현재 주사위를 그대로 쓴다.
        clock.advance(1);
        engine.tick();
        assertThat(card(1).path("scores").path("CHOICE").asInt()).isEqualTo(20);
        // 지연된 타이머는 지난 차례를 원래 마감 기준으로 순서대로 처리한다.
        faces.addAll(List.of(2,3,4,5,6, 1,1,2,2,4));
        clock.advance(40);
        engine.tick();
        assertThat(card(0).path("scores").path("LARGE_STRAIGHT").asInt()).isEqualTo(30);
        // 1·1·2·2·4는 2칸과 4칸이 모두 4점이다. 같은 점수면 점수표 앞 칸을 고른다.
        assertThat(card(1).path("scores").path("TWOS").asInt()).isEqualTo(4);
        assertThat(card(1).path("scores").path("FOURS").isNull()).isTrue();
        assertThat(state().path("turnUserId").asText()).isEqualTo("101");
        assertThat(state().path("round").asInt()).isEqualTo(3);
        assertThat(Instant.parse(state().path("turnDeadline").asText())).isEqualTo(first.plusSeconds(105));
    }

    @Test
    void 기권자는차례에서빠지고_한명만남으면그사람이승리한다() {
        engine.create(GAME, "table", List.of(101L, 202L, 303L));
        roll(101, "a1", 0, List.of(), 1,2,3,4,5);
        engine.forfeit(new GameForfeitCommand(101, GAME, "leave-a"));
        assertThat(state().path("turnUserId").asText()).isEqualTo("202");
        assertThat(state().path("dice").isEmpty()).isTrue();
        assertThat(card(0).path("forfeited").asBoolean()).isTrue();
        assertThat(router.load(101).orElseThrow().phase().name()).isEqualTo("ELIMINATED");
        // 같은 참가자의 기권 재요청은 처음 확정한 결과를 다시 돌려준다.
        assertThat(engine.forfeit(new GameForfeitCommand(101, GAME, "leave-again")).duplicate()).isTrue();
        long version = version();
        reject(Rejection.NOT_ACTIVE, () -> act(101, "ghost", version, roll()));
        play(202, PERFECT.get(0));
        play(303, PERFECT.get(0));
        assertThat(state().path("turnUserId").asText()).isEqualTo("202");
        Instant at = clock.instant();
        engine.graceExpired(new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(), 303, GAME,
                at.minusSeconds(30), at, GameRecoveryGateway.Action.ELIMINATE));
        assertThat(state().path("status").asText()).isEqualTo("FINISHED");
        assertThat(state().path("endReason").asText()).isEqualTo("LAST_PLAYER_STANDING");
        assertThat(state().path("winnerUserIds").toString()).isEqualTo("[\"202\"]");
        GameFinished finished = events.stream().filter(GameFinished.class::isInstance).map(GameFinished.class::cast)
                .findFirst().orElseThrow();
        assertThat(finished.participants()).extracting(GameFinished.Participant::result)
                .containsExactly(GameFinished.Result.FORFEIT, GameFinished.Result.WIN, GameFinished.Result.FORFEIT);
        assertThat(finished.participants().get(0).leaveReason()).isNotNull();
    }

    @Test
    void 사인전은_좌석순으로돌고_중간기권자를건너뛰며_남은세명이완성하면끝난다() {
        engine.create(GAME, "table", List.of(101L, 202L, 303L, 404L));
        assertThat(state().path("players")).hasSize(4);
        play(101, PERFECT.get(0));
        assertThat(state().path("turnUserId").asText()).isEqualTo("202");
        play(202, PERFECT.get(0));
        play(303, PERFECT.get(0));
        assertThat(state().path("turnUserId").asText()).isEqualTo("404");
        play(404, PERFECT.get(0));
        assertThat(state().path("turnUserId").asText()).isEqualTo("101");
        assertThat(state().path("round").asInt()).isEqualTo(2);
        // 2라운드에 303이 기권하면 202 다음은 404다.
        play(101, PERFECT.get(1));
        engine.forfeit(new GameForfeitCommand(303, GAME, "leave-303"));
        play(202, PERFECT.get(1));
        assertThat(state().path("turnUserId").asText()).isEqualTo("404");
        play(404, PERFECT.get(1));
        for (int index = 2; index < 12; index++) {
            play(101, PERFECT.get(index));
            play(202, index == 4 ? turn("FIVES", 5,5,1,1,2) : PERFECT.get(index));
            play(404, index == 4 ? turn("FIVES", 5,5,5,5,2) : PERFECT.get(index));
        }
        JsonNode state = state();
        assertThat(state.path("status").asText()).isEqualTo("FINISHED");
        assertThat(state.path("endReason").asText()).isEqualTo("ALL_CATEGORIES_FILLED");
        assertThat(card(0).path("total").asLong()).isEqualTo(258);
        assertThat(card(1).path("total").asLong()).isEqualTo(218);
        assertThat(card(2).path("forfeited").asBoolean()).isTrue();
        assertThat(card(3).path("total").asLong()).isEqualTo(263);
        assertThat(state.path("winnerUserIds").toString()).isEqualTo("[\"404\"]");
        GameFinished finished = events.stream().filter(GameFinished.class::isInstance).map(GameFinished.class::cast)
                .findFirst().orElseThrow();
        assertThat(finished.participants()).extracting(GameFinished.Participant::result).containsExactly(
                GameFinished.Result.LOSE, GameFinished.Result.LOSE, GameFinished.Result.FORFEIT, GameFinished.Result.WIN);
        assertThat(router.load(303).orElseThrow().participantCount()).isEqualTo(4);
    }

    @Test
    void 생성과_관전역할을서버에서검사한다() {
        engine.create(GAME, "table", List.of(101L, 202L));
        engine.create(GAME, "table", List.of(101L, 202L));
        assertThatIllegalStateException().isThrownBy(() -> engine.create(GAME, "table", List.of(101L, 303L)));
        assertThatIllegalArgumentException().isThrownBy(() -> engine.create("solo", "table", List.of(303L)));
        assertThatIllegalArgumentException().isThrownBy(() -> engine.create("crowd", "table",
                List.of(1L, 2L, 3L, 4L, 5L)));
        assertThat(engine.load(505, GAME).orElseThrow().role().name()).isEqualTo("SPECTATOR");
        assertThat(engine.load(505, GAME).orElseThrow().privateState().isEmpty()).isTrue();
        assertThat(engine.load(505)).isEmpty();
        assertThat(state().path("categories")).hasSize(12);
        assertThat(state().path("players").get(0).path("scores").size()).isEqualTo(12);
        reject(Rejection.ACCESS_DENIED, () -> act(505, "viewer", 0, roll()));
    }

    private static Object[] turn(String category, int... values) { return new Object[] {category, values}; }

    private void play(long user, Object[] turn) {
        long version = version();
        roll(user, "roll-" + version, version, List.of(), (int[]) turn[1]);
        act(user, "score-" + version, version + 1, score((String) turn[0]));
    }

    private JsonNode state() { return engine.load(101, GAME).orElseThrow().publicState(); }
    private long version() { return engine.load(101, GAME).orElseThrow().version(); }
    private JsonNode card(int index) { return state().path("players").get(index); }
    private JsonNode roll(Integer... keep) { return mapper.valueToTree(Map.of("kind", "roll", "keepIds", List.of(keep))); }
    private JsonNode score(String category) { return mapper.valueToTree(Map.of("kind", "score", "category", category)); }

    private com.ssafy.ontop.game.action.GameActionResult act(long user, String id, long version, JsonNode input) {
        return router.apply(new GameActionCommand(user, GAME, id, version, input));
    }

    private void roll(long user, String id, long version, List<Integer> keep, int... values) {
        for (int value : values) { faces.add(value); }
        act(user, id, version, roll(keep.toArray(Integer[]::new)));
        assertThat(faces).isEmpty();
    }

    private void reject(Rejection reason, org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(Rejected.class,
                exception -> assertThat(exception.reason()).isEqualTo(reason));
    }

    static final class TestClock extends Clock {
        private Instant now = Instant.parse("2026-10-30T00:00:00Z");
        void advance(long seconds) { now = now.plusSeconds(seconds); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
    }
}
