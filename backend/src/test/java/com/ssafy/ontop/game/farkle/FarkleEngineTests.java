package com.ssafy.ontop.game.farkle;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.farkle.service.FarkleEngine;
import com.ssafy.ontop.game.farkle.service.FarkleGameFinished;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.state.GameStateChanged;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayDeque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.CountDownLatch;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class FarkleEngineTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final TestClock clock = new TestClock();
    private final List<Object> events = new CopyOnWriteArrayList<>();
    private final GameEngineRouter router = new GameEngineRouter();
    private final ArrayDeque<Integer> faces = new ArrayDeque<>();
    private final FarkleEngine engine = new FarkleEngine(mapper, clock, events::add, router,
            () -> faces.removeFirst(), () -> 0);

    FarkleEngineTests() { engine.create("dice", "table", List.of(101L,202L), 2000); }

    @Test
    void 최소50점저장과_버스트에서_총점을보존한다() {
        roll(101, "r1", 0, List.of(), 5,2,3,4,6,2);
        act(101, "b1", 1, "bank", List.of(0));
        assertThat(state().path("scores").get(0).asLong()).isEqualTo(50);
        roll(202, "r2", 2, List.of(), 1,2,3,4,6,2);
        roll(202, "r3", 3, List.of(0), 2,3,4,6,2);
        assertThat(state().path("lastEvent").asText()).isEqualTo("BUST");
        assertThat(state().path("turnScore").asLong()).isZero();
        assertThat(state().path("turnUserId").asText()).isEqualTo("101");
        assertThat(state().path("scores").get(0).asLong()).isEqualTo(50);
        assertThat(state().path("scores").get(1).asLong()).isZero();
    }

    @Test
    void 핫다이스와_목표즉시승리_종료알림은한번뿐이다() {
        roll(101, "r1", 0, List.of(), 1,2,3,4,5,6);
        roll(101, "r2", 1, List.of(0,1,2,3,4,5), 5,5,5,2,4,6);
        assertThat(state().path("hotDice").asBoolean()).isTrue();
        assertThat(state().path("turnScore").asLong()).isEqualTo(1500);
        act(101, "win", 2, "bank", List.of(0,1,2));
        assertThat(state().path("scores").get(0).asLong()).isEqualTo(2000);
        assertThat(state().path("winnerUserId").asText()).isEqualTo("101");
        assertThat(state().path("turnDeadline").isNull()).isTrue();
        act(101, "win", 2, "bank", List.of(0,1,2));
        reject(Rejection.INVALID_ACTION, () -> act(202, "late", 3, "roll", List.of()));
        assertThat(events.stream().filter(FarkleGameFinished.class::isInstance)).hasSize(1);
        assertThat(router.load(101).orElseThrow().phase().name()).isEqualTo("FINISHED");
        new OmokEngine(mapper, clock, events::add, router).create("next", "table", 101,202);
        assertThat(router.load(101).orElseThrow().gameId()).isEqualTo("next");
    }

    @Test
    void 이전굴림과_현재굴림을합쳐조합을만들지못한다() {
        roll(101, "r1", 0, List.of(), 1,2,3,4,6,2);
        roll(101, "r2", 1, List.of(0), 1,1,2,3,4);
        assertThat(state().path("turnScore").asInt()).isEqualTo(100);
        act(101, "bank", 2, "bank", List.of(1,2));
        assertThat(state().path("scores").get(0).asLong()).isEqualTo(300);
    }

    @Test
    void 잘못된선택과_조작필드_차례_버전은상태를바꾸지않는다() {
        roll(101, "r1", 0, List.of(), 3,3,3,1,5,2);
        JsonNode before = state();
        for (String input : List.of("{\"kind\":\"bank\",\"selectedIds\":[5]}",
                "{\"kind\":\"bank\",\"selectedIds\":[0,0,0]}",
                "{\"kind\":\"bank\",\"selectedIds\":[1.5]}",
                "{\"kind\":\"bank\",\"selectedIds\":[],\"score\":9999}",
                "{\"kind\":\"roll\",\"selectedIds\":[]}",
                "{\"kind\":\"bank\",\"selectedIds\":[6]}")) {
            reject(Rejection.INVALID_ACTION, () -> engine.apply(new GameActionCommand(101,"dice",input,1,mapper.readTree(input))));
        }
        reject(Rejection.NOT_YOUR_TURN, () -> act(202,"wrong",1,"bank",List.of(0,1,2)));
        reject(Rejection.STALE_VERSION, () -> act(101,"stale",0,"bank",List.of(0,1,2)));
        reject(Rejection.ACCESS_DENIED, () -> act(505,"viewer",1,"bank",List.of(0,1,2)));
        assertThat(state()).isEqualTo(before);
        act(101,"bank",1,"bank",List.of(0,1,2,3,4));
        assertThat(state().path("scores").get(0).asLong()).isEqualTo(450);
    }

    @Test
    void 재접속은마감을늘리지않고_30초에이번턴만잃고넘긴다() {
        String originalDeadline = state().path("turnDeadline").asText();
        clock.advance(10);
        roll(101,"r1",0,List.of(),1,2,3,4,6,2);
        clock.advance(10);
        roll(101,"r2",1,List.of(0),1,2,3,4,6);
        String deadline = state().path("turnDeadline").asText();
        assertThat(deadline).isEqualTo(originalDeadline);
        clock.advance(9);
        assertThat(router.load(101).orElseThrow().state().path("turnDeadline").asText()).isEqualTo(deadline);
        clock.advance(1);
        engine.tick();
        assertThat(state().path("lastEvent").asText()).isEqualTo("TURN_TIMEOUT");
        assertThat(state().path("status").asText()).isEqualTo("PLAYING");
        assertThat(state().path("turnUserId").asText()).isEqualTo("202");
        assertThat(state().path("turnScore").asLong()).isZero();
        assertThat(engine.load(101,"dice").orElseThrow().version()).isEqualTo(3);
        assertThat(events.stream().filter(FarkleGameFinished.class::isInstance)).isEmpty();
        engine.tick();
        assertThat(engine.load(101,"dice").orElseThrow().version()).isEqualTo(3);
        clock.advance(90);
        engine.tick();
        assertThat(engine.load(101,"dice").orElseThrow().version()).isEqualTo(6);
        assertThat(state().path("turnUserId").asText()).isEqualTo("101");
    }

    @Test
    void 마감정각입력은거절하고_중복굴림은난수를소모하지않는다() {
        roll(101,"r1",0,List.of(),1,2,3,4,5,6);
        JsonNode before = state();
        act(101,"r1",0,"roll",List.of());
        assertThat(state()).isEqualTo(before);
        reject(Rejection.ACTION_ID_CONFLICT, () -> act(101,"r1",0,"bank",List.of(0)));
        clock.advance(30);
        reject(Rejection.STALE_VERSION, () -> act(101,"late",1,"bank",List.of(0)));
        assertThat(state().path("scores").get(0).asLong()).isZero();
        assertThat(events.stream().filter(GameStateChanged.class::isInstance)).hasSize(2);
    }

    @Test
    void 동시동일굴림은한번만실행하고_끊김유예만료는한번기권한다() throws Exception {
        for (int value : new int[] {1,2,3,4,5,6}) { faces.add(value); }
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var futures = java.util.stream.IntStream.range(0,10).mapToObj(index -> pool.submit(() -> {
                start.await(); return act(101,"same",0,"roll",List.of());
            })).toList();
            start.countDown();
            for (var future : futures) { assertThat(future.get().version()).isEqualTo(1); }
        }
        assertThat(faces).isEmpty();
        Instant deadline = clock.instant().plusSeconds(30);
        var expiration = new GameRecoveryGateway.GraceExpiration(java.util.UUID.randomUUID(), 202, "dice",
                clock.instant(), deadline, GameRecoveryGateway.Action.FORFEIT);
        engine.graceExpired(expiration);
        assertThat(state().path("status").asText()).isEqualTo("PLAYING");
        clock.advance(30);
        engine.graceExpired(expiration);
        engine.graceExpired(expiration);
        assertThat(state().path("winnerUserId").asText()).isEqualTo("101");
        assertThat(events.stream().filter(FarkleGameFinished.class::isInstance)).hasSize(1);
    }

    @Test
    void 생성과_관전역할과_목표점수를서버에서검사한다() {
        engine.create("dice","table",List.of(101L,202L),2000);
        assertThatIllegalStateException().isThrownBy(() -> engine.create("dice","table",List.of(101L,202L),4000));
        assertThatIllegalStateException().isThrownBy(() -> engine.create("other","table",List.of(303L,404L),2000));
        assertThatIllegalArgumentException().isThrownBy(() -> engine.create("bad","other",List.of(303L,404L),3000));
        assertThat(engine.load(505,"dice").orElseThrow().privateState().isEmpty()).isTrue();
        assertThat(engine.load(505,"dice").orElseThrow().role().name()).isEqualTo("SPECTATOR");
        assertThat(engine.load(505)).isEmpty();
    }

    private JsonNode state() { return engine.load(101,"dice").orElseThrow().publicState(); }

    @Test
    void 허탕의_확정눈은_다음차례에서도_참가자와_관전자에게_동일하게_공개한다() {
        roll(101, "first", 0, List.of(), 1, 2, 3, 4, 6, 2);
        roll(101, "bust", 1, List.of(0), 2, 3, 4, 6, 2);

        JsonNode snapshot = state();
        JsonNode lastRoll = snapshot.path("lastRoll");
        assertThat(snapshot.path("dice")).isEmpty();
        assertThat(snapshot.path("lastEvent").asText()).isEqualTo("BUST");
        assertThat(lastRoll.path("rollId").asLong()).isEqualTo(2);
        assertThat(lastRoll.path("actorUserId").asText()).isEqualTo("101");
        assertThat(lastRoll.path("dice")).hasSize(6);
        assertThat(lastRoll.path("dice").get(0).path("held").asBoolean()).isTrue();
        assertThat(lastRoll.path("dice").get(1).path("value").asInt()).isEqualTo(2);
        assertThat(engine.load(505, "dice").orElseThrow().publicState()).isEqualTo(snapshot);
        assertThat(engine.load(505, "dice").orElseThrow().privateState()).isEmpty();
        assertThat(router.load(101).orElseThrow().state().path("lastRoll")).isEqualTo(lastRoll);

        act(101, "bust", 1, "roll", List.of(0));
        assertThat(state()).isEqualTo(snapshot);
        clock.advance(30);
        engine.tick();
        assertThat(state().path("lastRoll").isNull()).isTrue();
    }

    @Test
    void 저장과_종료는_이전굴림_연출을_비우고_다음굴림은_새로운눈으로_교체한다() {
        assertThat(state().path("lastRoll").isNull()).isTrue();
        roll(101, "first", 0, List.of(), 5, 2, 3, 4, 6, 2);
        assertThat(state().path("lastRoll").path("dice")).isEqualTo(state().path("dice"));
        act(101, "bank", 1, "bank", List.of(0));
        assertThat(state().path("lastRoll").isNull()).isTrue();
        roll(202, "next", 2, List.of(), 1, 2, 3, 4, 5, 6);
        assertThat(state().path("lastRoll").path("actorUserId").asText()).isEqualTo("202");
        engine.forfeit(new GameForfeitCommand(202, "dice", "leave"));
        assertThat(state().path("lastRoll").isNull()).isTrue();
    }
    private com.ssafy.ontop.game.action.GameActionResult act(long user, String id, long version, String kind, List<Integer> selected) {
        return router.apply(new GameActionCommand(user,"dice",id,version,
                mapper.valueToTree(Map.of("kind",kind,"selectedIds",selected))));
    }
    private void roll(long user, String id, long version, List<Integer> selected, int... values) {
        for (int value : values) { faces.add(value); }
        act(user,id,version,"roll",selected);
        assertThat(faces).isEmpty();
    }
    private void reject(Rejection reason, org.assertj.core.api.ThrowableAssert.ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(Rejected.class, exception -> assertThat(exception.reason()).isEqualTo(reason));
    }
    static final class TestClock extends Clock {
        private Instant now = Instant.parse("2026-10-21T00:00:00Z");
        void advance(long seconds) { now = now.plusSeconds(seconds); }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return Clock.fixed(now,zone); }
        @Override public Instant instant() { return now; }
    }
}
