package com.ssafy.ontop.game.onecard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.onecard.domain.OneCard;
import com.ssafy.ontop.game.onecard.service.OneCardEngine;
import com.ssafy.ontop.game.onecard.service.OneCardGameFinished;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class OneCardEngineTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-21T00:00:00Z"),ZoneOffset.UTC);
    private final List<Object> events = new CopyOnWriteArrayList<>();
    private final GameEngineRouter router = new GameEngineRouter();
    private final List<String> opening = List.of("hearts-K","spades-K","diamonds-K","clubs-K","clubs-J","clubs-Q","clubs-7");
    private final OneCardEngine engine = new OneCardEngine(mapper,clock,events::add,router,cards -> {
        if (cards.size() == 54) {
            cards.clear(); cards.addAll(OneCardMatchTests.orderedDeck(List.of(101L,202L),Map.of(101L,opening)));
        } else { java.util.Collections.reverse(cards); }
    },bound -> 0,com.ssafy.ontop.game.onecard.domain.ForfeitHandPolicy.RECYCLE);

    OneCardEngineTests() { engine.create("one","table",List.of(101L,202L)); }

    @Test
    void 손패는본인에게만전송하고_관전자와공개상태에는없다() {
        var one = engine.load(101,"one").orElseThrow();
        var two = engine.load(202,"one").orElseThrow();
        var viewer = engine.load(505,"one").orElseThrow();
        assertThat(one.publicState()).isEqualTo(two.publicState()).isEqualTo(viewer.publicState());
        assertThat(one.publicState().has("hand")).isFalse();
        assertThat(one.publicState().has("deck")).isFalse();
        assertThat(viewer.privateState().isEmpty()).isTrue();
        assertThat(one.privateState().path("hand").size()).isEqualTo(7);
        assertThat(two.privateState().path("hand").size()).isEqualTo(7);
        assertThat(one.privateState().path("hand")).isNotEqualTo(two.privateState().path("hand"));
        assertThat(router.load(101).orElseThrow().state().path("privateState")).isEqualTo(one.privateState());
        assertThat(router.load(505)).isEmpty();
        ((com.fasterxml.jackson.databind.node.ObjectNode) one.privateState()).removeAll();
        assertThat(engine.load(101,"one").orElseThrow().privateState().path("hand").size()).isEqualTo(7);
    }

    @Test
    void 마지막특수카드로승리하면_종료는한번이며_다음경기를허용한다() {
        for (String card : opening) { action(101,card,engine.load(101,"one").orElseThrow().version(),Map.of("kind","play","cardId",card)); }
        var end = engine.load(202,"one").orElseThrow();
        assertThat(end.publicState().path("status").asText()).isEqualTo("FINISHED");
        assertThat(end.publicState().path("winnerUserIds").get(0).asText()).isEqualTo("101");
        action(101,"clubs-7",6,Map.of("kind","play","cardId","clubs-7"));
        assertThat(events.stream().filter(OneCardGameFinished.class::isInstance)).hasSize(1);
        assertThatThrownBy(() -> action(202,"late",7,Map.of("kind","draw"))).isInstanceOf(Rejected.class);
        assertThat(router.load(202).orElseThrow().phase().name()).isEqualTo("FINISHED");
        engine.create("next","table",List.of(101L,202L));
        assertThat(router.load(202).orElseThrow().gameId()).isEqualTo("next");
    }

    @Test
    void 동시선언과신고는_먼저처리한한행동만반영한다() throws Exception {
        for (String card : opening.subList(0,6)) { action(101,card,engine.load(101,"one").orElseThrow().version(),Map.of("kind","play","cardId",card)); }
        CountDownLatch gate = new CountDownLatch(1);
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var declaration = pool.submit(() -> { gate.await(); return attempt(101,"declare",Map.of("kind","declare-one")); });
            var report = pool.submit(() -> { gate.await(); return attempt(202,"catch",Map.of("kind","catch-one","targetUserId","101")); });
            gate.countDown();
            assertThat((declaration.get() ? 1 : 0)+(report.get() ? 1 : 0)).isEqualTo(1);
        }
        assertThat(engine.load(101,"one").orElseThrow().version()).isEqualTo(7);
        int size = engine.load(101,"one").orElseThrow().privateState().path("hand").size();
        assertThat(size).isIn(1,3);
    }

    @Test
    void 기권은서버유예만료명령으로만처리하고_중복종료하지않는다() {
        var expiration = new GameRecoveryGateway.GraceExpiration(java.util.UUID.randomUUID(),202,"one",
                clock.instant().minusSeconds(30),clock.instant(),GameRecoveryGateway.Action.FORFEIT);
        engine.graceExpired(expiration); engine.graceExpired(expiration);
        assertThat(events.stream().filter(OneCardGameFinished.class::isInstance)).hasSize(1);
        assertThat(engine.load(101,"one").orElseThrow().publicState().path("winnerUserIds").get(0).asText()).isEqualTo("101");
    }

    @Test
    void 초기배분실패는공개전재시도하고_반복실패도경기점유를남기지않는다() {
        var calls=new java.util.concurrent.atomic.AtomicInteger();
        java.util.function.Consumer<List<OneCard>> impossible=cards -> {
            cards.sort(java.util.Comparator.comparing(card -> !card.initial()));
        };
        var retryRouter=new GameEngineRouter();
        var retried=new OneCardEngine(mapper,clock,events::add,retryRouter,cards -> {
            if (cards.size()==54 && calls.incrementAndGet()==1) { impossible.accept(cards); }
        },bound -> 0,com.ssafy.ontop.game.onecard.domain.ForfeitHandPolicy.REMOVE);
        retried.create("retry","retry-table",List.of(301L,302L,303L,304L));
        assertThat(calls).hasValue(2);
        assertThat(retried.load(301,"retry").orElseThrow().privateState().path("hand").size()).isEqualTo(7);
        var failedRouter=new GameEngineRouter();
        var failed=new OneCardEngine(mapper,clock,events::add,failedRouter,impossible,bound -> 0,
                com.ssafy.ontop.game.onecard.domain.ForfeitHandPolicy.REMOVE);
        assertThatIllegalStateException().isThrownBy(() -> failed.create("failed","failed-table",List.of(401L,402L,403L,404L)));
        assertThat(failedRouter.load(401)).isEmpty();
    }

    private boolean attempt(long user,String id,Map<String,Object> input) {
        try { action(user,id,6,input); return true; } catch (Rejected rejected) { return false; }
    }
    private void action(long user,String id,long version,Map<String,Object> input) {
        router.apply(new GameActionCommand(user,"one",id,version,mapper.valueToTree(input)));
    }
}
