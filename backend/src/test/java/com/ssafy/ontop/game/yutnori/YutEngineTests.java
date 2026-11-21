package com.ssafy.ontop.game.yutnori;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.yutnori.domain.YutMatch;
import com.ssafy.ontop.game.yutnori.service.YutEngine;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class YutEngineTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final GameEngineRouter router = new GameEngineRouter();
    private final List<Object> notices = new ArrayList<>();
    private final YutEngine engine = new YutEngine(mapper, Clock.fixed(Instant.ofEpochMilli(10_000), ZoneOffset.UTC),
            new Random(2), router, notices::add, user -> { }, (user, channel) -> true);
    private final YutMatch.Rules rules = new YutMatch.Rules(false, false, false);

    @Test
    void 같은_방생성은_멱등이고_다른_내용의_같은키는_거절한다() {
        String id = engine.create(101, "channel-1", "same", "방", "청", rules).path("gameId").asText();
        assertThat(engine.create(101, "channel-1", "same", "방", "청", rules).path("gameId").asText()).isEqualTo(id);
        assertThatThrownBy(() -> engine.create(101, "channel-1", "same", "다른방", "청", rules))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 네명_정원과_채널_경계를_지킨다() {
        String id = engine.create(101, "channel-1", "four", "방", "청", rules).path("gameId").asText();
        engine.join(202, "channel-1", id, "홍");
        engine.join(303, "channel-1", id, "동료");
        engine.join(404, "channel-1", id, "친구");
        assertThatThrownBy(() -> engine.join(505, "channel-1", id, "다섯째")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> engine.join(606, "channel-2", id, "다른공원")).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 공통_라우터로_시작하고_동일_행동은_한번만_적용한다() {
        String id = started();
        var state = engine.member(101, id);
        long turn = state.path("publicState").path("turnUser").asLong();
        var command = new GameActionCommand(turn, id, "throw", state.path("version").asLong(),
                mapper.createObjectNode().put("type", "THROW"));
        var first = router.apply(command);
        var thrown = engine.member(101, id).path("publicState").path("lastThrow");
        assertThat(thrown.path("id").asInt()).isEqualTo(1);
        assertThat(thrown.path("userId").asText()).isEqualTo(Long.toString(turn));
        var spectator = engine.watch(505, "channel-1", id);
        assertThat(spectator.path("publicState").path("lastThrow")).isEqualTo(thrown);
        int events = notices.size();
        assertThat(router.apply(command)).isEqualTo(first);
        assertThat(engine.member(202, id).path("publicState").path("lastThrow")).isEqualTo(thrown);
        assertThat(notices).hasSize(events);
        assertThatThrownBy(() -> router.apply(new GameActionCommand(turn, id, "throw", command.expectedVersion(),
                mapper.createObjectNode().put("type", "MOVE")))).isInstanceOf(GameActionGateway.Rejected.class);
        assertThatThrownBy(() -> router.apply(new GameActionCommand(turn, id, "stale", command.expectedVersion(),
                mapper.createObjectNode().put("type", "THROW")))).isInstanceOf(GameActionGateway.Rejected.class);
    }

    @Test
    void 관전자는_공개상태만_받고_게임입력을_보낼수_없다() {
        String id = started();
        engine.watch(505, "channel-1", id);
        assertThat(router.load(505, id).orElseThrow().privateState().isEmpty()).isTrue();
        assertThat(router.load(606, id)).isEmpty();
        assertThatThrownBy(() -> router.apply(new GameActionCommand(505, id, "bad", 0,
                mapper.createObjectNode().put("type", "THROW")))).isInstanceOf(GameActionGateway.Rejected.class);
    }

    @Test
    void 기권과_재접속_종료조회는_멱등이며_나간후에도_복구계약을_보존한다() {
        String id = started();
        var command = new GameForfeitCommand(101, id, "forfeit");
        var first = router.forfeit(command);
        var second = router.forfeit(command);
        assertThat(second.duplicate()).isTrue();
        assertThat(second.version()).isEqualTo(first.version());
        engine.leave(101, id);
        assertThat(router.load(101).orElseThrow().phase().name()).isEqualTo("FINISHED");
    }

    private String started() {
        String id = engine.create(101, "channel-1", "start", "방", "청", rules).path("gameId").asText();
        engine.join(202, "channel-1", id, "홍");
        for (long user : List.of(101L, 202L)) {
            engine.lobby(user, id, mapper.createObjectNode().put("type", "READY").put("ready", true));
        }
        engine.start(101, id);
        return id;
    }

    @Test
    void 상태_이벤트는_엔진_잠금을_해제한_뒤_발행한다() {
        var reference = new AtomicReference<YutEngine>();
        var eventTypes = new ArrayList<String>();
        var isolated = new YutEngine(mapper, Clock.systemUTC(), new Random(2), new GameEngineRouter(), event -> {
            assertThat(Thread.holdsLock(reference.get())).isFalse();
            eventTypes.add(event.getClass().getSimpleName());
        }, user -> assertThat(Thread.holdsLock(reference.get())).isFalse(), (user, channel) -> true);
        reference.set(isolated);
        String id = isolated.create(101, "channel-1", "events", "방", "청", rules).path("gameId").asText();
        isolated.join(202, "channel-1", id, "홍");
        isolated.dispatch();
        assertThat(eventTypes).contains("GameStateChanged");
        for (long user : List.of(101L, 202L)) {
            isolated.lobby(user, id, mapper.createObjectNode().put("type", "READY").put("ready", true));
        }
        isolated.start(101, id);
        isolated.forfeit(new GameForfeitCommand(101, id, "end"));
        isolated.dispatch();
        assertThat(eventTypes).contains("YutFinished");
    }
    @Test
    void 다팀_탈락자는_복구후_새경기에_들어가고_기존경기는_남은팀이_계속한다() {
        String id = engine.create(101, "channel-1", "four-teams", "방", "청", rules, 4, 1).path("gameId").asText();
        for (long user : List.of(202L, 303L, 404L)) engine.join(user, "channel-1", id, "참가");
        for (long user : List.of(101L, 202L, 303L, 404L)) {
            engine.lobby(user, id, mapper.createObjectNode().put("type", "READY").put("ready", true));
        }
        engine.start(101, id);
        router.forfeit(new GameForfeitCommand(101, id, "out"));
        assertThat(router.load(101).orElseThrow().phase().name()).isEqualTo("ELIMINATED");
        assertThat(engine.member(202, id).path("publicState").path("phase").asText()).isEqualTo("PLAYING");
        assertThat(engine.member(202, id).path("publicState").path("eliminatedTeams").get(0).asInt()).isZero();
        assertThatThrownBy(() -> router.apply(new GameActionCommand(101, id, "eliminated", engine.member(101, id).path("version").asLong(),
                mapper.createObjectNode().put("type", "THROW")))).isInstanceOf(GameActionGateway.Rejected.class);
        engine.leave(101, id);
        String next = engine.create(101, "channel-1", "next", "새방", "청", rules, 2, 2).path("gameId").asText();
        engine.join(505, "channel-1", next, "친구");
        for (long user : List.of(101L, 505L)) engine.lobby(user, next, mapper.createObjectNode().put("type", "READY").put("ready", true));
        engine.start(101, next);
        router.forfeit(new GameForfeitCommand(202, id, "second-out"));
        assertThat(engine.member(303, id).path("publicState").path("phase").asText()).isEqualTo("PLAYING");
        router.forfeit(new GameForfeitCommand(303, id, "third-out"));
        assertThat(engine.member(404, id).path("publicState").path("winner").asInt()).isEqualTo(3);
        assertThat(router.load(101).orElseThrow().gameId()).isEqualTo(next);
        engine.dispatch();
        assertThat(notices.stream().filter(event -> event instanceof com.ssafy.ontop.game.yutnori.service.YutFinished).count()).isEqualTo(1);
    }

    @Test
    void 팀과_말수는_범위를_검사하고_같은생성키의_설정변경을_거절한다() {
        engine.create(101, "channel-1", "config", "방", "청", rules, 3, 2);
        assertThatThrownBy(() -> engine.create(101, "channel-1", "config", "방", "청", rules, 4, 2)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> engine.create(202, "channel-1", "bad", "방", "홍", rules, 5, 2)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> engine.create(202, "channel-1", "bad", "방", "홍", rules, 2, 0)).isInstanceOf(IllegalArgumentException.class);
        String id = engine.member(101, engine.rooms(101, "channel-1").path("mine").path("gameId").asText()).path("gameId").asText();
        engine.join(202, "channel-1", id, "홍");
        for (long user : List.of(101L, 202L)) engine.lobby(user, id, mapper.createObjectNode().put("type", "READY").put("ready", true));
        assertThatThrownBy(() -> engine.start(101, id)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 차례시간과_연결유예가_만료되어도_남은_다팀경기는_진행한다() {
        var time = new java.util.concurrent.atomic.AtomicLong(10_000);
        Clock advancing = new Clock() {
            @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return Instant.ofEpochMilli(time.get()); }
        };
        var timed = new YutEngine(mapper, advancing, new Random(2), router, notices::add, user -> { }, (user, channel) -> true);
        String id = timed.create(101, "channel-1", "timer", "방", "청", rules, 3, 1).path("gameId").asText();
        for (long user : List.of(202L, 303L)) timed.join(user, "channel-1", id, "참가");
        for (long user : List.of(101L, 202L, 303L)) timed.lobby(user, id, mapper.createObjectNode().put("type", "READY").put("ready", true));
        timed.start(101, id);
        var before = timed.member(101, id).path("publicState");
        long expired = before.path("turnUser").asLong();
        time.set(before.path("deadline").asLong());
        assertThat(timed.tick()).isEmpty();
        assertThat(router.load(expired).orElseThrow().phase().name()).isEqualTo("ELIMINATED");
        var after = timed.member(101, id).path("publicState");
        assertThat(after.path("phase").asText()).isEqualTo("PLAYING");
        assertThat(after.path("deadline").asLong()).isEqualTo(time.get() + 90_000);
        long disconnected = after.path("turnUser").asLong();
        var expiration = new com.ssafy.ontop.game.reconnect.GameRecoveryGateway.GraceExpiration(
                java.util.UUID.randomUUID(), disconnected, id, advancing.instant().minusSeconds(30), advancing.instant(),
                com.ssafy.ontop.game.reconnect.GameRecoveryGateway.Action.FORFEIT);
        router.graceExpired(expiration);
        long version = timed.member(101, id).path("version").asLong();
        router.graceExpired(expiration);
        assertThat(timed.member(101, id).path("version").asLong()).isEqualTo(version);
        assertThat(timed.member(101, id).path("publicState").path("phase").asText()).isEqualTo("FINISHED");
        timed.dispatch();
    }

}
