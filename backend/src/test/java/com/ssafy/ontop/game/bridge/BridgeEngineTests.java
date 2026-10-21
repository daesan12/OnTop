package com.ssafy.ontop.game.bridge;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.bridge.service.BridgeEngine;
import com.ssafy.ontop.game.bridge.service.BridgeGameFinished;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class BridgeEngineTests {
    private final ObjectMapper mapper=new ObjectMapper();
    private final TestClock clock=new TestClock();
    private final List<Object> events=new CopyOnWriteArrayList<>();
    private final GameEngineRouter router=new GameEngineRouter();
    private final BridgeEngine engine=new BridgeEngine(mapper,clock,events::add,router,() -> 0,bound -> 0);

    BridgeEngineTests() { engine.create("bridge","table",List.of(101L,202L,303L)); }

    @Test
    void 개인눈과복구는본인만_공개JSON에는속성자체가없고_모두믿어도숨긴다() {
        action(101,"roll",Map.of("kind","roll"));
        var owner=engine.load(101,"bridge").orElseThrow();
        assertThat(owner.privateState().path("die").asText()).isEqualTo("X");
        assertThat(router.load(101).orElseThrow().state().path("privateState")).isEqualTo(owner.privateState());
        assertThat(engine.load(202,"bridge").orElseThrow().privateState().isEmpty()).isTrue();
        assertThat(engine.load(505,"bridge").orElseThrow().privateState().isEmpty()).isTrue();
        assertThat(owner.publicState().toString()).doesNotContain("actualFace","\"die\"","\"face\"");
        var deadline=owner.publicState().path("turnDeadline");
        assertThat(router.load(101).orElseThrow().state().path("publicState").path("turnDeadline")).isEqualTo(deadline);
        action(101,"declare",Map.of("kind","declare","value",4));
        action(202,"trust-1",Map.of("kind","trust")); action(303,"trust-2",Map.of("kind","trust"));
        var publicState=engine.load(505,"bridge").orElseThrow().publicState();
        assertThat(publicState.path("resolution").path("challenged").asBoolean()).isFalse();
        assertThat(publicState.path("resolution").has("actualFace")).isFalse();
        assertThat(engine.load(101,"bridge").orElseThrow().privateState().isEmpty()).isTrue();
        ((com.fasterxml.jackson.databind.node.ObjectNode)publicState).removeAll();
        assertThat(engine.load(505,"bridge").orElseThrow().publicState().path("players").size()).isEqualTo(3);
    }

    @Test
    void 다우트가있을때만X를공개하며_중복판정은한번만한다() {
        action(101,"roll",Map.of("kind","roll")); action(101,"claim",Map.of("kind","declare","value",4));
        var input=mapper.valueToTree(Map.of("kind","doubt"));
        var command=new GameActionCommand(202,"bridge","doubt",2,input);
        var result=router.apply(command); router.apply(command);
        var publicState=engine.load(505,"bridge").orElseThrow().publicState();
        assertThat(publicState.path("resolution").path("actualFace").asText()).isEqualTo("X");
        assertThat(publicState.path("resolution").path("wasBluff").asBoolean()).isTrue();
        assertThat(engine.load(101,"bridge").orElseThrow().version()).isEqualTo(result.version());
        assertThat(publicState.path("resolution").path("operations").size()).isEqualTo(3);
    }

    @Test
    void 동시믿기와다우트중한행동만현재단계에확정한다() throws Exception {
        action(101,"roll",Map.of("kind","roll")); action(101,"claim",Map.of("kind","declare","value",4));
        CountDownLatch gate=new CountDownLatch(1);
        try (var pool=Executors.newVirtualThreadPerTaskExecutor()) {
            var trust=pool.submit(() -> { gate.await(); return attempt("trust"); });
            var doubt=pool.submit(() -> { gate.await(); return attempt("doubt"); });
            gate.countDown();
            assertThat((trust.get() ? 1 : 0)+(doubt.get() ? 1 : 0)).isEqualTo(1);
        }
        assertThat(engine.load(101,"bridge").orElseThrow().version()).isEqualTo(3);
    }

    @Test
    void 재접속유예만료는현재선언완료후기권하며_종료발행과점유해제는한번이다() {
        engine.create("bridge","table",List.of(101L,202L,303L));
        action(101,"roll",Map.of("kind","roll")); action(101,"claim",Map.of("kind","declare","value",4));
        var at=clock.instant();
        for (long user : List.of(202L,303L)) {
            var command=new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(),user,"bridge",at.minusSeconds(30),at,
                    GameRecoveryGateway.Action.ELIMINATE);
            engine.graceExpired(command); engine.graceExpired(command);
        }
        var state=engine.load(101,"bridge").orElseThrow().publicState();
        assertThat(state.path("status").asText()).isEqualTo("FINISHED");
        assertThat(state.path("winnerUserIds").get(0).asText()).isEqualTo("101");
        assertThat(state.path("resolution").has("actualFace")).isFalse();
        assertThat(events.stream().filter(BridgeGameFinished.class::isInstance)).hasSize(1);
        engine.create("next","table",List.of(101L,202L));
        assertThat(router.load(101).orElseThrow().gameId()).isEqualTo("next");
    }

    @Test
    void 자연세골인승리는한번만발행하고_종료후늦은행동과기권은결과를바꾸지않는다() {
        engine.create("duel","duel-table",List.of(401L,402L));
        int sequence=0;
        while (engine.load(401,"duel").orElseThrow().publicState().path("status").asText().equals("PLAYING")) {
            var state=engine.load(401,"duel").orElseThrow();
            long actor=Long.parseLong(state.publicState().path("turnUserId").asText());
            for (var input : List.of(Map.<String,Object>of("kind","roll"),Map.<String,Object>of("kind","declare","value",4))) {
                router.apply(new GameActionCommand(actor,"duel","step-"+(++sequence),engine.load(actor,"duel").orElseThrow().version(),mapper.valueToTree(input)));
            }
            long judge=actor==401 ? 402 : 401;
            var trust=new GameActionCommand(judge,"duel","step-"+(++sequence),engine.load(judge,"duel").orElseThrow().version(),mapper.valueToTree(Map.of("kind","trust")));
            router.apply(trust); router.apply(trust);
            clock.advance(2); engine.tick();
            assertThat(sequence).isLessThan(100);
        }
        var ended=engine.load(401,"duel").orElseThrow();
        assertThat(ended.publicState().path("endReason").asText()).isEqualTo("THREE_GOALS");
        assertThat(ended.publicState().path("winnerUserIds").get(0).asText()).isEqualTo("401");
        assertThat(events.stream().filter(BridgeGameFinished.class::isInstance)).hasSize(1);
        assertThatThrownBy(() -> router.apply(new GameActionCommand(401,"duel","late",ended.version(),mapper.valueToTree(Map.of("kind","roll")))))
                .isInstanceOf(Rejected.class);
        var at=clock.instant();
        engine.graceExpired(new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(),401,"duel",at.minusSeconds(30),at,GameRecoveryGateway.Action.FORFEIT));
        assertThat(engine.load(401,"duel").orElseThrow().publicState()).isEqualTo(ended.publicState());
        engine.create("new-duel","duel-table",List.of(401L,402L));
        assertThat(router.load(401).orElseThrow().gameId()).isEqualTo("new-duel");
    }

    @Test
    void 시간이만료되면입력없이상태갱신하고_복구로연장하지않는다() {
        clock.advance(30); engine.tick();
        var state=router.load(101).orElseThrow();
        assertThat(state.state().path("publicState").path("turnUserId").asText()).isEqualTo("202");
        assertThat(state.version()).isEqualTo(1);
        assertThat(state.state().path("privateState").isEmpty()).isTrue();
        assertThat(events).hasSize(1);
        engine.tick(); assertThat(events).hasSize(1);
    }

    private boolean attempt(String kind) {
        try { router.apply(new GameActionCommand(202,"bridge",kind,2,mapper.valueToTree(Map.of("kind",kind)))); return true; }
        catch (Rejected exception) { return false; }
    }
    private void action(long user,String id,Map<String,Object> input) {
        router.apply(new GameActionCommand(user,"bridge",id,engine.load(user,"bridge").orElseThrow().version(),mapper.valueToTree(input)));
    }
    static final class TestClock extends Clock {
        private Instant at=Instant.parse("2026-10-21T00:00:00Z");
        void advance(long seconds) { at=at.plusSeconds(seconds); }
        @Override public Instant instant() { return at; }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
    }
}
