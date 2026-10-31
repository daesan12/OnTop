package com.ssafy.ontop.game.omok;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.omok.service.OmokGameFinished;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OmokEngineTests {
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"WIN", "TIMEOUT", "FORFEIT", "GRACE"})
    void 동전추첨_경기가_끝나면_연출정보를_정리하고_종료결과는_복구한다(String ending) throws Exception {
        var tossed = new OmokEngine(mapper, clock, events::add,
                new com.ssafy.ontop.game.engine.GameEngineRouter(), () -> false);
        tossed.createWithCoinToss("toss-clean", "other", 303, 404);
        assertThat(tossed.load(303, "toss-clean").orElseThrow().publicState().has("coinTossEndsAt")).isTrue();
        switch (ending) {
            case "WIN" -> {
                clock.advanceMillis(2500);
                for (int index = 0; index < 9; index++) {
                    boolean black = index % 2 == 0;
                    tossed.apply(new GameActionCommand(black ? 303 : 404, "toss-clean", "move-" + index,
                            index, mapper.readTree("{\"x\":" + index / 2 + ",\"y\":" + (black ? 0 : 2) + "}")));
                }
            }
            case "TIMEOUT" -> { clock.advanceMillis(32500); tossed.tick(); }
            case "FORFEIT" -> tossed.forfeit(new com.ssafy.ontop.game.action.GameForfeitCommand(
                    303, "toss-clean", "leave"));
            case "GRACE" -> tossed.graceExpired(new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(),
                    303, "toss-clean", clock.instant(), clock.instant(), GameRecoveryGateway.Action.FORFEIT));
            default -> throw new IllegalArgumentException(ending);
        }
        tossed.tick();
        var recovered = tossed.load(303).orElseThrow();
        assertThat(recovered.phase()).isEqualTo(GameRecoverySnapshot.Phase.FINISHED);
        assertThat(recovered.state().has("coinTossEndsAt")).isFalse();
        assertThat(recovered.state().path("blackUserId").asLong()).isEqualTo(303);
        assertThat(events.stream().filter(OmokGameFinished.class::isInstance)).hasSize(1);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(booleans = {false, true})
    void 동전추첨은_한번만하고_공개후에만_흑돌이_착수하며_재접속도_같은결과다(boolean reverse) throws Exception {
        var flips = new java.util.concurrent.atomic.AtomicInteger();
        var engine = new OmokEngine(mapper, clock, events::add, new com.ssafy.ontop.game.engine.GameEngineRouter(),
                () -> { flips.incrementAndGet(); return reverse; });
        engine.createWithCoinToss("toss", "other", 303, 404);
        var before = engine.load(303, "toss").orElseThrow().publicState();
        long black = before.path("blackUserId").asLong();
        assertThat(black).isEqualTo(reverse ? 404 : 303);
        assertThat(before.path("whiteUserId").asLong()).isEqualTo(black == 303 ? 404 : 303);
        assertThat(before.path("coinTossEndsAt").asText()).isEqualTo(clock.instant().plusMillis(2500).toString());
        engine.createWithCoinToss("toss", "other", 404, 303);
        assertThat(flips).hasValue(1);
        assertThat(engine.load(404, "toss").orElseThrow().publicState()).isEqualTo(before);
        var action = new GameActionCommand(black, "toss", "coin-first", 0, mapper.readTree("{\"x\":7,\"y\":7}"));
        assertThatThrownBy(() -> engine.apply(action)).isInstanceOfSatisfying(Rejected.class,
                error -> assertThat(error.reason()).isEqualTo(Rejection.INVALID_ACTION));
        clock.advanceMillis(2500);
        engine.apply(action);
        assertThat(engine.load(black, "toss").orElseThrow().publicState().path("moveCount").asInt()).isEqualTo(1);
        assertThatThrownBy(() -> engine.createWithCoinToss("toss", "other", 303, 505))
                .isInstanceOf(IllegalStateException.class);
    }
    private final ObjectMapper mapper = new ObjectMapper();
    private final TestClock clock = new TestClock();
    private final List<Object> events = new CopyOnWriteArrayList<>();
    private final OmokEngine engine = new OmokEngine(mapper, clock, events::add);

    OmokEngineTests() {
        engine.create("game", "table", 101, 202);
    }

    @Test
    void 흑선공부터_실제착수와_다섯돌_승리까지_진행한다() throws Exception {
        assertThat(state().path("turnUserId").asText()).isEqualTo("101");
        for (int index = 0; index < 4; index++) {
            play(101, "b" + index, index * 2, index, 0);
            play(202, "w" + index, index * 2 + 1, index, 2);
        }
        play(101, "win", 8, 4, 0);
        assertThat(state().path("winnerUserId").asText()).isEqualTo("101");
        assertThat(state().path("endReason").asText()).isEqualTo("FIVE_IN_ROW");
        assertThat(state().path("turnDeadline").isNull()).isTrue();
        assertThat(engine.load(101).orElseThrow().phase()).isEqualTo(GameRecoverySnapshot.Phase.FINISHED);
        reject(Rejection.INVALID_ACTION, () -> play(202, "late", 9, 5, 5));
        assertThat(events.stream().filter(OmokGameFinished.class::isInstance)).hasSize(1);
    }

    @Test
    void 점유된칸과_잘못된차례와_버전은_변경없이_거절한다() throws Exception {
        reject(Rejection.NOT_YOUR_TURN, () -> play(202, "wrong", 0, 0, 0));
        play(101, "first", 0, 0, 0);
        reject(Rejection.STALE_VERSION, () -> play(202, "stale", 0, 1, 0));
        reject(Rejection.INVALID_ACTION, () -> play(202, "occupied", 1, 0, 0));
        assertThat(state().path("moveCount").asInt()).isEqualTo(1);
    }

    @Test
    void 입력의_좌표와_추가필드와_사용자권한을_검사한다() {
        for (String input : List.of("{}", "{\"x\":15,\"y\":0}", "{\"x\":0.5,\"y\":0}",
                "{\"x\":0,\"y\":null}", "{\"x\":0,\"y\":0,\"winner\":101}",
                "{\"x\":9223372036854775808,\"y\":0}")) {
            reject(Rejection.INVALID_ACTION, () -> engine.apply(
                    new GameActionCommand(101, "game", input, 0, mapper.readTree(input))));
        }
        reject(Rejection.ACCESS_DENIED, () -> play(505, "spectator", 0, 0, 0));
        assertThat(state().path("moveCount").asInt()).isZero();
    }

    @Test
    void 동일행동은_재반영하지않고_다른내용이면_충돌이다() throws Exception {
        var first = play(101, "one", 0, 0, 0);
        play(202, "two", 1, 1, 0);
        assertThat(play(101, "one", 0, 0, 0)).isEqualTo(first);
        reject(Rejection.ACTION_ID_CONFLICT, () -> play(101, "one", 0, 2, 0));
        reject(Rejection.ACTION_ID_CONFLICT, () -> play(101, "one", 2, 0, 0));
        assertThat(state().path("moveCount").asInt()).isEqualTo(2);
    }

    @Test
    void 동일버전의_동시착수는_하나만_반영한다() throws Exception {
        CountDownLatch go = new CountDownLatch(1);
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = workers.submit(() -> concurrentPlay(go, "a", 0));
            var second = workers.submit(() -> concurrentPlay(go, "b", 1));
            go.countDown();
            assertThat(List.of(first.get(), second.get())).containsExactlyInAnyOrder("OK", "STALE_VERSION");
        }
        assertThat(state().path("moveCount").asInt()).isEqualTo(1);
    }

    @Test
    void 마감직전착수는_허용하고_새턴은_30초를_받는다() throws Exception {
        clock.advanceMillis(29_999);
        play(101, "just-in-time", 0, 0, 0);
        assertThat(state().path("turnDeadline").asText()).isEqualTo(clock.instant().plusSeconds(30).toString());
        clock.advanceMillis(29_999);
        assertThat(state().path("status").asText()).isEqualTo("PLAYING");
    }

    @Test
    void 정확한30초마감부터_시간패이며_틱과_조회로_중복종료하지않는다() throws Exception {
        clock.advanceMillis(30_000);
        reject(Rejection.INVALID_ACTION, () -> play(101, "too-late", 0, 0, 0));
        engine.tick();
        assertThat(state().path("winnerUserId").asText()).isEqualTo("202");
        assertThat(state().path("endReason").asText()).isEqualTo("TURN_TIMEOUT");
        assertThat(events.stream().filter(OmokGameFinished.class::isInstance)).hasSize(1);
        assertThat(state().path("moveCount").asInt()).isZero();
    }

    @Test
    void 조회나_재접속복구로_턴마감을_연장하지않는다() {
        String deadline = state().path("turnDeadline").asText();
        clock.advanceMillis(29_000);
        assertThat(engine.load(101).orElseThrow().state().path("turnDeadline").asText()).isEqualTo(deadline);
        clock.advanceMillis(1_000);
        assertThat(engine.load(101).orElseThrow().phase()).isEqualTo(GameRecoverySnapshot.Phase.FINISHED);
    }

    @Test
    void 재생성은_경기를초기화하지않고_다른참가자와_중복참가는_거절한다() throws Exception {
        play(101, "a", 0, 0, 0);
        engine.create("game", "table", 101, 202);
        assertThat(state().path("moveCount").asInt()).isEqualTo(1);
        assertThatIllegalStateException().isThrownBy(() -> engine.create("game", "table", 202, 101));
        assertThatIllegalStateException().isThrownBy(() -> engine.create("other", "table2", 101, 303));
        assertThatIllegalStateException().isThrownBy(() -> engine.create("other", "table", 303, 404));
    }

    @Test
    void 알림수신자의_예외가_확정된착수를_실패로바꾸지않는다() throws Exception {
        OmokEngine failing = new OmokEngine(mapper, clock, notice -> { throw new IllegalStateException(); });
        failing.create("game", "table", 101, 202);
        assertThat(failing.apply(command(101, "a", 0, 0, 0)).version()).isEqualTo(1);
        assertThat(failing.load(101, "game").orElseThrow().version()).isEqualTo(1);
    }

    @Test
    void 관전자에게_비공개정보와_내부테이블키를_노출하지않는다() {
        var view = engine.load(505, "game").orElseThrow();
        assertThat(view.privateState().isEmpty()).isTrue();
        assertThat(view.tableId()).isEqualTo("table");
        assertThat(mapper.valueToTree(view).has("tableId")).isFalse();
        assertThat(engine.load(505)).isEmpty();
    }

    @Test
    void 종료된경기의_재접속만료이벤트는_승패를_바꾸지않는다() {
        clock.advanceMillis(31_000);
        engine.tick();
        engine.graceExpired(new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(), 202, "game",
                clock.instant().minusSeconds(30), clock.instant(), GameRecoveryGateway.Action.FORFEIT));
        assertThat(state().path("winnerUserId").asText()).isEqualTo("202");
        assertThat(events.stream().filter(OmokGameFinished.class::isInstance)).hasSize(1);
    }

    @Test
    void 금수거절은_버전과_판과_마감을_보존하고_같은차례의_다른착수가_가능하다() {
        int[][] points = {{6,7},{8,7},{7,6},{7,8}};
        for (int i=0;i<points.length;i++) {
            play(101,"b"+i,i*2,points[i][0],points[i][1]);
            play(202,"w"+i,i*2+1,i*2,0);
        }
        var before = engine.load(101,"game").orElseThrow();
        int eventCount = events.size();
        clock.advanceMillis(1000);
        reject(Rejection.FORBIDDEN_MOVE, () -> play(101,"forbidden",8,7,7));
        assertThat(engine.load(101,"game").orElseThrow()).isEqualTo(before);
        assertThat(events).hasSize(eventCount);
        play(101,"retry-other",8,0,14);
        assertThat(state().path("moveCount").asInt()).isEqualTo(9);
        assertThat(state().path("turnUserId").asText()).isEqualTo("202");
    }

    private String concurrentPlay(CountDownLatch go, String id, int x) throws Exception {
        go.await();
        try {
            play(101, id, 0, x, 0);
            return "OK";
        } catch (Rejected exception) {
            return exception.reason().name();
        }
    }

    private com.ssafy.ontop.game.action.GameActionResult play(long user, String id, long version, int x, int y) {
        return engine.apply(command(user, id, version, x, y));
    }

    private GameActionCommand command(long user, String id, long version, int x, int y) {
        return new GameActionCommand(user, "game", id, version, mapper.createObjectNode().put("x", x).put("y", y));
    }

    private JsonNode state() {
        return engine.load(101, "game").orElseThrow().publicState();
    }

    private void reject(Rejection reason, org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(Rejected.class,
                exception -> assertThat(exception.reason()).isEqualTo(reason));
    }

    static final class TestClock extends Clock {
        private Instant now = Instant.parse("2026-10-21T00:00:00Z");
        void advanceMillis(long millis) { now = now.plusMillis(millis); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
        @Override public Instant instant() { return now; }
    }
}
