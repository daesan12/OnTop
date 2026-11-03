package com.ssafy.ontop.game.omok;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.omok.service.OmokGameFinished;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class OmokUndoTests {
    final ObjectMapper mapper = new ObjectMapper();
    final TestClock clock = new TestClock();
    final List<Object> notices = new CopyOnWriteArrayList<>();
    final OmokEngine engine = new OmokEngine(mapper, clock, notices::add);
    int serial;
    OmokUndoTests() { engine.create("g", "t", 101, 202); }
    JsonNode state() { return engine.load(101, "g").orElseThrow().publicState(); }
    long version() { return engine.load(101, "g").orElseThrow().version(); }
    GameActionCommand command(long user, String id, long v, String input) throws Exception {
        return new GameActionCommand(user, "g", id, v, mapper.readTree(input));
    }
    GameActionCommand action(long user, String input) throws Exception { return command(user, "a" + serial++, version(), input); }
    void play(long user, int x, int y) throws Exception { engine.apply(action(user, "{\"x\":" + x + ",\"y\":" + y + "}")); }
    GameActionCommand request(long user) throws Exception {
        var request = action(user, "{\"kind\":\"undoRequest\"}"); engine.apply(request); return request;
    }
    GameActionCommand reply(long user, String request, boolean accept) throws Exception {
        return action(user, "{\"kind\":\"undoRespond\",\"requestId\":\"" + request + "\",\"accept\":" + accept + "}");
    }
    void pair() throws Exception { play(101, 0, 0); play(202, 0, 2); }
    void rejected(Rejection reason, Runnable job) {
        assertThatThrownBy(job::run).isInstanceOfSatisfying(Rejected.class, e -> assertThat(e.reason()).isEqualTo(reason));
    }
    @Test void 여러차례_무르기로_빈판까지_돌아가고_다시착수해도_횟수제한이없다() throws Exception {
        for (int x = 0; x < 4; x++) { play(101, x, 0); play(202, x, 2); }
        for (int left = 6; left >= 0; left -= 2) {
            var request = request(101); engine.apply(reply(202, request.actionId(), true));
            assertThat(state().path("moveCount").asInt()).isEqualTo(left);
            assertThat(state().path("turnUserId").asText()).isEqualTo("101");
        }
        assertThat(state().path("lastMove").isNull()).isTrue();
        for (JsonNode row : state().path("board")) for (JsonNode cell : row) assertThat(cell.asInt()).isZero();
        for (int i = 0; i < 3; i++) { pair(); var request = request(101); engine.apply(reply(202, request.actionId(), true)); }
        assertThat(state().path("moveCount").asInt()).isZero();
        assertThat(notices.stream().filter(OmokGameFinished.class::isInstance)).isEmpty();
    }
    @Test void 백이_무르면_흑첫돌을_남기고_백차례와_이전마지막돌을_복원한다() throws Exception {
        pair(); play(101, 1, 0);
        var request = request(202); engine.apply(reply(101, request.actionId(), true));
        assertThat(state().path("moveCount").asInt()).isEqualTo(1);
        assertThat(state().path("turnUserId").asText()).isEqualTo("202");
        assertThat(state().path("lastMove").path("x").asInt()).isZero();
        assertThat(state().path("lastMove").path("stone").asText()).isEqualTo("BLACK");
        assertThat(state().path("board").get(0).get(0).asInt()).isEqualTo(1);
    }
    @Test void 대기중_착수는_차단하고_거절해도_원래_착수마감을_유지한다() throws Exception {
        pair(); clock.advance(5000); var request = request(101);
        String deadline = state().path("turnDeadline").asText();
        clock.advance(4000);
        assertThat(engine.load(202).orElseThrow().state().path("undo")).isEqualTo(state().path("undo"));
        var move = action(101, "{\"x\":2,\"y\":2}"); rejected(Rejection.INVALID_ACTION, () -> engine.apply(move));
        engine.apply(reply(202, request.actionId(), false));
        assertThat(state().path("board").get(0).get(0).asInt()).isEqualTo(1);
        assertThat(state().path("undoDecision").path("status").asText()).isEqualTo("REJECTED");
        assertThat(state().path("turnDeadline").asText()).isEqualTo(deadline);
    }
    @Test void 승인대기중에도_시계는흐르고_승인도_원래마감을_연장하지않는다() throws Exception {
        pair(); clock.advance(5000); var request = request(101); clock.advance(9000);
        engine.apply(reply(202, request.actionId(), true));
        assertThat(state().path("turnDeadline").asText()).isEqualTo(clock.instant().plusSeconds(16).toString());
        clock.advance(16000); engine.tick();
        assertThat(state().path("endReason").asText()).isEqualTo("TURN_TIMEOUT");
    }
    @Test void 착수마감이_응답마감보다_빠르면_요청을정리하고_원래시각에_시간패한다() throws Exception {
        pair(); clock.advance(29000); request(101); var timeout = clock.instant().plusSeconds(1);
        assertThat(state().path("undo").path("deadline").asText()).isEqualTo(timeout.toString());
        clock.advance(12000); engine.tick();
        assertThat(state().path("endedAt").asText()).isEqualTo(timeout.toString());
        assertThat(state().path("moveCount").asInt()).isEqualTo(2);
        assertThat(notices.stream().filter(OmokGameFinished.class::isInstance)).hasSize(1);
    }
    @Test void 거절과재요청을_반복해도_시간패를_피할수없다() throws Exception {
        pair();
        for (int i = 0; i < 3; i++) {
            var request = request(101); clock.advance(9000); engine.apply(reply(202,request.actionId(),false));
        }
        request(101); clock.advance(3000); engine.tick();
        assertThat(state().path("endReason").asText()).isEqualTo("TURN_TIMEOUT");
    }
    @Test void 정확한10초부터_늦은승인은_거절하고_두돌을_보존한다() throws Exception {
        pair(); var request = request(101); var response = reply(202, request.actionId(), true);
        clock.advance(10000); rejected(Rejection.STALE_VERSION, () -> engine.apply(response));
        assertThat(state().path("undoDecision").path("status").asText()).isEqualTo("EXPIRED");
        assertThat(state().path("moveCount").asInt()).isEqualTo(2);
    }
    @Test void 최초한돌과_차례밖요청과_관전자요청은_거절한다() throws Exception {
        var empty = action(101, "{\"kind\":\"undoRequest\"}"); rejected(Rejection.INVALID_ACTION, () -> engine.apply(empty));
        play(101, 0, 0);
        var one = action(202, "{\"kind\":\"undoRequest\"}"); rejected(Rejection.INVALID_ACTION, () -> engine.apply(one));
        play(202, 0, 2);
        var other = action(202, "{\"kind\":\"undoRequest\"}"); rejected(Rejection.NOT_YOUR_TURN, () -> engine.apply(other));
        var viewer = action(505, "{\"kind\":\"undoRequest\"}"); rejected(Rejection.ACCESS_DENIED, () -> engine.apply(viewer));
    }
    @Test void 요청자스스로_수락하거나_과거요청을_수락하거나_추가필드를_보내면거절한다() throws Exception {
        pair(); var request = request(101);
        var self = reply(101, request.actionId(), true); rejected(Rejection.INVALID_ACTION, () -> engine.apply(self));
        var wrong = reply(202, "old", true); rejected(Rejection.INVALID_ACTION, () -> engine.apply(wrong));
        for (String json : List.of("{\"kind\":\"undoRespond\",\"requestId\":\"" + request.actionId() + "\",\"accept\":\"true\"}",
                "{\"kind\":\"undoRequest\",\"count\":10}")) {
            var malformed = action(202, json); assertThatThrownBy(() -> engine.apply(malformed)).isInstanceOf(Rejected.class);
        }
        assertThat(state().path("moveCount").asInt()).isEqualTo(2);
    }
    @Test void 재시도는_무르기와_이전착수를_재반영하지않고_다른내용은충돌이다() throws Exception {
        var first = action(101, "{\"x\":0,\"y\":0}"); engine.apply(first); play(202, 0, 2);
        var request = request(101); var response = reply(202, request.actionId(), true); var receipt = engine.apply(response);
        long after = version(); engine.apply(request); engine.apply(first);
        assertThat(engine.apply(response)).isEqualTo(receipt); assertThat(version()).isEqualTo(after);
        assertThat(state().path("moveCount").asInt()).isZero();
        var conflict = command(202, response.actionId(), response.expectedVersion(), response.input().deepCopy().toString().replace("true", "false"));
        rejected(Rejection.ACTION_ID_CONFLICT, () -> engine.apply(conflict));
    }
    @Test void 동시_수락과거절은_하나만_확정된다() throws Exception {
        pair(); var request = request(101); var accept = reply(202, request.actionId(), true); var decline = reply(202, request.actionId(), false);
        var go = new CountDownLatch(1);
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var a = pool.submit(() -> run(go, accept)); var b = pool.submit(() -> run(go, decline)); go.countDown();
            assertThat(List.of(a.get(), b.get())).containsExactlyInAnyOrder("OK", "STALE_VERSION");
        }
        assertThat(state().path("undo").isNull()).isTrue();
    }
    @Test void 대기중_기권은_즉시종료하고_늦은승인으로_결과를뒤집지않는다() throws Exception {
        pair(); var request = request(101); engine.forfeit(new GameForfeitCommand(101, "g", "leave"));
        var response = reply(202, request.actionId(), true); rejected(Rejection.INVALID_ACTION, () -> engine.apply(response));
        assertThat(state().path("winnerUserId").asText()).isEqualTo("202");
        assertThat(state().path("undo").isNull()).isTrue();
    }
    String run(CountDownLatch go, GameActionCommand input) throws Exception {
        go.await(); try { engine.apply(input); return "OK"; } catch (Rejected e) { return e.reason().name(); }
    }
    static final class TestClock extends Clock {
        Instant now = Instant.parse("2026-11-03T00:00:00Z");
        void advance(long millis) { now = now.plusMillis(millis); }
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
}
