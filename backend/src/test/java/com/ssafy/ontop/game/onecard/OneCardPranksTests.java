package com.ssafy.ontop.game.onecard;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.onecard.domain.ForfeitHandPolicy;
import com.ssafy.ontop.game.onecard.domain.OneCardMatch.Snapshot;
import com.ssafy.ontop.game.onecard.service.OneCardEngine;
import com.ssafy.ontop.game.onecard.service.OneCardPranks;
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
import static org.assertj.core.api.Assertions.*;

class OneCardPranksTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final TestClock clock = new TestClock();
    private final OneCardPranks pranks = new OneCardPranks();
    private final OneCardEngine engine = new OneCardEngine(mapper, clock, ignored -> {}, new GameEngineRouter(),
            cards -> {}, bound -> 0, ForfeitHandPolicy.REMOVE);
    OneCardPranksTests() { engine.create("one", "table", List.of(101L, 202L)); }
    private Snapshot state() { return engine.withPrankState("one", (s, now) -> s); }
    private OneCardPranks.Reply reach(long user) {
        return pranks.reach(state(), user, UUID.randomUUID().toString(), state().turnUserId(),
                state().turnCount(), clock.millis(), false);
    }
    private List<OneCardPranks.Notice> advance() {
        return engine.withPrankState("one", (s, now) -> pranks.advance("one", s, now, (a, t) -> true));
    }
    private void nextTurn() {
        var state = state();
        engine.apply(new GameActionCommand(state.turnUserId(), "one", UUID.randomUUID().toString(),
                state.version(), mapper.createObjectNode().put("kind", "draw")));
    }

    @Test void 방어는_해당관전자만차단하고_다른관전자시도는_유지한다() {
        var first = reach(505);
        reach(606);
        String attempt = first.acknowledgement().payload().get("attemptId").toString();
        long version = state().version();
        var hit = pranks.hit(state(), 101, UUID.randomUUID().toString(), attempt, clock.millis());
        assertThat(hit.notices()).extracting(OneCardPranks.Notice::type)
                .containsExactly("ONECARD_PRANK_BLOCKED", "ONECARD_PRANK_REACH_RESOLVED");
        assertThat((long) hit.acknowledgement().payload().get("blockedUntil")).isEqualTo(clock.millis() + 3000);
        assertThatThrownBy(() -> reach(505)).hasMessageContaining("원카드");
        clock.add(1400);
        assertThat(advance()).extracting(OneCardPranks.Notice::type)
                .containsExactly("ONECARD_HAND_FLIPPED", "ONECARD_PRANK_REACH_RESOLVED");
        assertThat(state().version()).isEqualTo(version);
    }

    @Test void 마감시_한번만뒤집고_늦은방어를거절하며_손패내용은전송하지않는다() {
        var start = reach(505);
        String attempt = start.acknowledgement().payload().get("attemptId").toString();
        clock.add(1400);
        var notices = advance();
        assertThat(notices).hasSize(2);
        assertThat(notices.getFirst().payload().keySet())
                .containsExactlyInAnyOrder("gameId", "eventId", "targetUserId", "turnCount", "count", "serverNow");
        assertThat(notices.getFirst().payload().get("count")).isEqualTo(2);
        assertThatThrownBy(() -> pranks.hit(state(), 101, UUID.randomUUID().toString(), attempt, clock.millis()))
                .isInstanceOf(OneCardPranks.Rejected.class).extracting(e -> ((OneCardPranks.Rejected)e).code())
                .isEqualTo("ONECARD_PRANK_TOO_LATE");
        assertThat(advance()).isEmpty();
    }

    @Test void 턴변경과_권한상실은_미완료시도를취소한다() {
        reach(505);
        nextTurn();
        assertThat(advance()).singleElement().satisfies(n -> assertThat(n.payload().get("outcome")).isEqualTo("CANCELLED"));
        reach(505);
        assertThat(pranks.advance("one", state(), clock.millis(), (a, t) -> false)).singleElement()
                .satisfies(n -> assertThat(n.payload().get("outcome")).isEqualTo("CANCELLED"));
    }

    @Test void 요청재확인은_시간을연장하거나_다시방송하지않는다() {
        String event = UUID.randomUUID().toString();
        var snapshot = state();
        var first = pranks.reach(snapshot, 505, event, 101, snapshot.turnCount(), clock.millis(), false);
        clock.add(200);
        var duplicate = pranks.reach(snapshot, 505, event, 101, snapshot.turnCount(), clock.millis(), false);
        assertThat(duplicate.notices()).isEmpty();
        assertThat(duplicate.acknowledgement().payload().get("attemptId"))
                .isEqualTo(first.acknowledgement().payload().get("attemptId"));
        assertThat(duplicate.acknowledgement().payload().get("resolveAt"))
                .isEqualTo(first.acknowledgement().payload().get("resolveAt"));
        assertThat(duplicate.acknowledgement().payload().get("serverNow")).isEqualTo(clock.millis());
        assertThatThrownBy(() -> pranks.reach(snapshot, 505, event, 202, snapshot.turnCount(), clock.millis(), false))
                .isInstanceOf(OneCardPranks.Rejected.class);
    }

    @Test void 복구중복은_면역시간을늘리지않고_현재턴사용도_복구하지않는다() {
        var start = reach(505);
        clock.add(1400);
        var effect = advance().getFirst().payload().get("eventId").toString();
        String event = UUID.randomUUID().toString();
        var restored = pranks.restore(state(), 101, event, effect, clock.millis());
        clock.add(100);
        var duplicate = pranks.restore(state(), 101, event, effect, clock.millis());
        assertThat(duplicate.acknowledgement().payload().get("immuneUntil"))
                .isEqualTo(restored.acknowledgement().payload().get("immuneUntil"));
        assertThat(duplicate.notices()).isEmpty();
        clock.add(3000);
        assertThatThrownBy(() -> reach(505)).isInstanceOf(OneCardPranks.Rejected.class);
        assertThat(start.acknowledgement().payload().get("resolveAt")).isNotNull();
    }

    @Test void 최대동시시도와_방어자권한을_검사한다() {
        var first = reach(505);
        reach(606); reach(707); reach(808);
        assertThatThrownBy(() -> reach(909)).isInstanceOf(OneCardPranks.Rejected.class);
        assertThatThrownBy(() -> pranks.hit(state(), 202, UUID.randomUUID().toString(),
                first.acknowledgement().payload().get("attemptId").toString(), clock.millis()))
                .isInstanceOf(OneCardPranks.Rejected.class);
    }

    @Test void 방어와마감이경합해도_차단과뒤집기가_같이확정되지않는다() throws Exception {
        for (int iteration = 0; iteration < 20; iteration++) {
            var isolated = new OneCardPranks();
            var start = isolated.reach(state(), 505, UUID.randomUUID().toString(), state().turnUserId(),
                    state().turnCount(), clock.millis(), false);
            String attempt = start.acknowledgement().payload().get("attemptId").toString();
            var notices = new CopyOnWriteArrayList<OneCardPranks.Notice>();
            var gate = new CountDownLatch(1);
            try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
                var hit = workers.submit(() -> { gate.await(); engine.withPrankState("one", (s, now) -> {
                    try { notices.addAll(isolated.hit(s, s.turnUserId(), UUID.randomUUID().toString(), attempt, now).notices()); }
                    catch (OneCardPranks.Rejected expected) { }
                    return null;
                }); return null; });
                var timeout = workers.submit(() -> { gate.await(); synchronized (engine) {
                    clock.add(1400);
                    notices.addAll(engine.withPrankState("one", (s, now) -> isolated.advance("one", s, now, (a,t) -> true)));
                } return null; });
                gate.countDown(); hit.get(); timeout.get();
            }
            assertThat(notices.stream().filter(n -> n.type().equals("ONECARD_HAND_FLIPPED") || n.type().equals("ONECARD_PRANK_BLOCKED")))
                    .hasSize(1);
        }
    }

    static class TestClock extends Clock {
        private Instant time = Instant.parse("2026-10-28T00:00:00Z");
        synchronized void add(long millis) { time = time.plusMillis(millis); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public synchronized Instant instant() { return time; }
    }
}
