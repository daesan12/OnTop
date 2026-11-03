package com.ssafy.ontop.game.omok;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.result.GameFinished;
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

class OmokDrawTests {
    final ObjectMapper mapper = new ObjectMapper();
    final TestClock clock = new TestClock();
    final List<Object> notices = new CopyOnWriteArrayList<>();
    final OmokEngine engine = new OmokEngine(mapper, clock, notices::add);
    int serial;
    OmokDrawTests() { engine.create("g", "t", 101, 202); }
    JsonNode state() { return engine.load(101, "g").orElseThrow().publicState(); }
    long version() { return engine.load(101, "g").orElseThrow().version(); }
    GameActionCommand action(long user, String input) throws Exception {
        return new GameActionCommand(user,"g","a"+serial++,version(),mapper.readTree(input));
    }
    GameActionCommand request(long user) throws Exception {
        var command=action(user,"{\"kind\":\"drawRequest\"}");engine.apply(command);return command;
    }
    GameActionCommand reply(long user,String id,boolean accept) throws Exception {
        return action(user,"{\"kind\":\"drawRespond\",\"requestId\":\""+id+"\",\"accept\":"+accept+"}");
    }
    void play(long user,int x,int y) throws Exception { engine.apply(action(user,"{\"x\":"+x+",\"y\":"+y+"}")); }
    void rejected(Rejection expected, Runnable operation) {
        assertThatThrownBy(operation::run).isInstanceOfSatisfying(Rejected.class,e->assertThat(e.reason()).isEqualTo(expected));
    }
    @Test void 내턴에요청하고_상대동의로만_양측무승부가_한번확정된다() throws Exception {
        play(101,0,0);play(202,0,2);var before=state().deepCopy();var request=request(101);
        var response=reply(202,request.actionId(),true);engine.apply(response);long endedVersion=version();engine.apply(response);
        assertThat(state().path("status").asText()).isEqualTo("FINISHED");
        assertThat(state().path("endReason").asText()).isEqualTo("AGREED_DRAW");
        assertThat(state().path("winnerUserId").isNull()).isTrue();assertThat(state().path("turnDeadline").isNull()).isTrue();
        assertThat(state().path("board")).isEqualTo(before.path("board"));assertThat(version()).isEqualTo(endedVersion);
        var events=notices.stream().filter(GameFinished.class::isInstance).map(GameFinished.class::cast).toList();
        assertThat(events).hasSize(1);assertThat(events.getFirst().participants()).allSatisfy(p->assertThat(p.result()).isEqualTo(GameFinished.Result.DRAW));
        assertThat(state().path("drawDecision").path("status").asText()).isEqualTo("ACCEPTED");
    }
    @Test void 거절해도각자1회를사용하며_상대의요청기회는별도다() throws Exception {
        var request=request(101);engine.apply(reply(202,request.actionId(),false));
        var second=action(101,"{\"kind\":\"drawRequest\"}");rejected(Rejection.INVALID_ACTION,()->engine.apply(second));
        assertThat(state().path("drawRequestsUsed").toString()).isEqualTo("[\"101\"]");
        play(101,0,0);var white=request(202);engine.apply(reply(101,white.actionId(),false));
        assertThat(state().path("drawRequestsUsed").toString()).isEqualTo("[\"101\",\"202\"]");
        assertThat(state().path("status").asText()).isEqualTo("PLAYING");
    }
    @Test void 요청은최대10초이고_만료해도원래착수시계와요청사용기록은유지한다() throws Exception {
        String deadline=state().path("turnDeadline").asText();clock.advance(5000);var request=request(101);
        assertThat(state().path("draw").path("deadline").asText()).isEqualTo(clock.instant().plusSeconds(10).toString());
        clock.advance(9000);assertThat(engine.load(202).orElseThrow().state().path("draw")).isEqualTo(state().path("draw"));
        assertThat(state().path("turnDeadline").asText()).isEqualTo(deadline);clock.advance(1000);engine.tick();
        assertThat(state().path("draw").isNull()).isTrue();assertThat(state().path("drawDecision").path("status").asText()).isEqualTo("EXPIRED");
        assertThat(state().path("turnDeadline").asText()).isEqualTo(deadline);
        var late=reply(202,request.actionId(),true);rejected(Rejection.INVALID_ACTION,()->engine.apply(late));
        var repeated=action(101,"{\"kind\":\"drawRequest\"}");rejected(Rejection.INVALID_ACTION,()->engine.apply(repeated));
    }
    @Test void 착수마감이먼저오면응답기한도줄고_동시만료는시간패다() throws Exception {
        String deadline=state().path("turnDeadline").asText();clock.advance(25000);var request=request(101);
        assertThat(state().path("draw").path("deadline").asText()).isEqualTo(deadline);
        var accept=reply(202,request.actionId(),true);clock.advance(5000);
        rejected(Rejection.INVALID_ACTION,()->engine.apply(accept));
        assertThat(state().path("endReason").asText()).isEqualTo("TURN_TIMEOUT");
        assertThat(state().path("winnerUserId").asText()).isEqualTo("202");assertThat(state().path("endedAt").asText()).isEqualTo(deadline);
    }
    @Test void 관전자_차례밖_잘못된필드_자기승인_다른요청은거절하고횟수를소비하지않는다() throws Exception {
        var viewer=action(505,"{\"kind\":\"drawRequest\"}");rejected(Rejection.ACCESS_DENIED,()->engine.apply(viewer));
        var wrongTurn=action(202,"{\"kind\":\"drawRequest\"}");rejected(Rejection.NOT_YOUR_TURN,()->engine.apply(wrongTurn));
        var invalid=action(101,"{\"kind\":\"drawRequest\",\"extra\":true}");rejected(Rejection.INVALID_ACTION,()->engine.apply(invalid));
        assertThat(state().path("drawRequestsUsed").isEmpty()).isTrue();var request=request(101);
        var self=reply(101,request.actionId(),true);rejected(Rejection.INVALID_ACTION,()->engine.apply(self));
        var stranger=reply(505,request.actionId(),true);rejected(Rejection.ACCESS_DENIED,()->engine.apply(stranger));
        var old=reply(202,"old",true);rejected(Rejection.INVALID_ACTION,()->engine.apply(old));
        var bad=action(202,"{\"kind\":\"drawRespond\",\"requestId\":\""+request.actionId()+"\",\"accept\":\"true\"}");
        rejected(Rejection.INVALID_ACTION,()->engine.apply(bad));assertThat(state().path("status").asText()).isEqualTo("PLAYING");
    }
    @Test void 대기중에는착수와무르기를겹칠수없다() throws Exception {
        play(101,0,0);play(202,0,2);var request=request(101);
        var move=action(101,"{\"x\":1,\"y\":0}");rejected(Rejection.INVALID_ACTION,()->engine.apply(move));
        var undo=action(101,"{\"kind\":\"undoRequest\"}");rejected(Rejection.INVALID_ACTION,()->engine.apply(undo));
        engine.apply(reply(202,request.actionId(),false));engine.apply(action(101,"{\"kind\":\"undoRequest\"}"));
        var draw=action(101,"{\"kind\":\"drawRequest\"}");rejected(Rejection.INVALID_ACTION,()->engine.apply(draw));
    }
    @Test void 무르기나복구로무승부요청횟수를초기화하지않는다() throws Exception {
        play(101,0,0);play(202,0,2);var draw=request(101);engine.apply(reply(202,draw.actionId(),false));
        var undo=action(101,"{\"kind\":\"undoRequest\"}");engine.apply(undo);
        engine.apply(action(202,"{\"kind\":\"undoRespond\",\"requestId\":\""+undo.actionId()+"\",\"accept\":true}"));
        assertThat(state().path("moveCount").asInt()).isZero();
        assertThat(engine.load(101).orElseThrow().state().path("drawRequestsUsed").toString()).isEqualTo("[\"101\"]");
        var again=action(101,"{\"kind\":\"drawRequest\"}");rejected(Rejection.INVALID_ACTION,()->engine.apply(again));
    }
    @Test void 동일요청재확인은멱등이며다른내용으로같은아이디를쓸수없다() throws Exception {
        var request=request(101);engine.apply(request);assertThat(version()).isEqualTo(1);
        var conflict=new GameActionCommand(101,"g",request.actionId(),request.expectedVersion(),mapper.readTree("{\"kind\":\"undoRequest\"}"));
        rejected(Rejection.ACTION_ID_CONFLICT,()->engine.apply(conflict));
        engine.apply(reply(202,request.actionId(),false));engine.apply(request);assertThat(state().path("draw").isNull()).isTrue();
        assertThat(state().path("drawRequestsUsed")).hasSize(1);
    }
    @Test void 수락과거절동시요청은한쪽만적용된다() throws Exception {
        var request=request(101);var accept=reply(202,request.actionId(),true);var decline=reply(202,request.actionId(),false);
        var gate=new CountDownLatch(1);
        try(var pool=Executors.newVirtualThreadPerTaskExecutor()) {
            var a=pool.submit(()->run(gate,accept));var b=pool.submit(()->run(gate,decline));gate.countDown();
            var results=List.of(a.get(),b.get());assertThat(results.stream().filter("OK"::equals).count()).isEqualTo(1);
            assertThat(results).allMatch(s->List.of("OK","INVALID_ACTION","STALE_VERSION").contains(s));
        }
        assertThat(state().path("draw").isNull()).isTrue();assertThat(version()).isEqualTo(2);
    }
    @Test void 대기중기권은종료되고_새경기는각자요청기회가새로생긴다() throws Exception {
        var request=request(101);engine.forfeit(new GameForfeitCommand(101,"g","quit"));
        var late=reply(202,request.actionId(),true);rejected(Rejection.INVALID_ACTION,()->engine.apply(late));
        assertThat(state().path("endReason").asText()).isEqualTo("EXPLICIT_LEAVE");engine.create("next","t",101,202);
        assertThat(engine.load(101,"next").orElseThrow().publicState().path("drawRequestsUsed").isEmpty()).isTrue();
    }
    String run(CountDownLatch gate,GameActionCommand action) throws Exception {
        gate.await();try{engine.apply(action);return "OK";}catch(Rejected e){return e.reason().name();}
    }
    static final class TestClock extends Clock {
        Instant now=Instant.parse("2026-11-03T00:00:00Z");
        void advance(long millis){now=now.plusMillis(millis);}
        public ZoneId getZone(){return ZoneOffset.UTC;}
        public Clock withZone(ZoneId zone){return this;}
        public Instant instant(){return now;}
    }
}
