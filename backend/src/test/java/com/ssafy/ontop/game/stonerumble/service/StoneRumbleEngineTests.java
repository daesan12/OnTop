package com.ssafy.ontop.game.stonerumble.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.result.GameFinished;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StoneRumbleEngineTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final MutableClock clock = new MutableClock();
    private final List<Object> events = new ArrayList<>();
    private final StoneRumbleEngine engine = new StoneRumbleEngine(mapper, clock, events::add, new GameEngineRouter());

    @Test
    void 여덟명은_같은_경기를_복구하고_일곱명_기권뒤_마지막_한명이_승리한다() throws Exception {
        List<Long> players = List.of(101L, 202L, 303L, 404L, 505L, 606L, 707L, 808L);
        engine.create("eight", "arena", players);

        for (long user : players) {
            assertThat(engine.load(user).orElseThrow().participantCount()).isEqualTo(8);
            assertThat(engine.load(user, "eight").orElseThrow().privateState()).isEmpty();
        }
        // 기존 공통 소켓의 64KiB 프레임 검증 도구에서도 공개 상태를 확인할 수 있다.
        assertThat(mapper.writeValueAsBytes(engine.load(808, "eight").orElseThrow()).length).isLessThan(60000);
        for (long user : players.subList(0, 7)) {
            engine.forfeit(new GameForfeitCommand(user, "eight", "leave-" + user));
        }

        assertThat(engine.load(808, "eight").orElseThrow().publicState().path("winnerUserIds").get(0).asText())
                .isEqualTo("808");
        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
    }

    @Test
    void 기존_라우터_등록은_네명_제한을_유지한다() {
        var router = new GameEngineRouter();
        List<Long> players = List.of(101L, 202L, 303L, 404L, 505L, 606L, 707L, 808L);

        assertThatThrownBy(() -> router.register(engine, "eight", "arena", players))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> router.register(engine, "nine", "arena", players, 9))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 동일_생성은_멱등이고_다른_참가자나_테이블은_거절한다() {
        engine.create("game-1", "table-1", List.of(101L, 202L));
        engine.create("game-1", "table-1", List.of(101L, 202L));

        assertThat(events).hasSize(1);
        assertThatThrownBy(() -> engine.create("game-1", "table-2", List.of(101L, 202L)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 중복_액션은_원래_결과를_돌려주고_변조와_낡은_기믹_입력을_막는다() {
        engine.create("game-1", "table-1", List.of(101L, 202L));
        readyPlayers("game-1", List.of(101L, 202L));
        clock.now = 3000;
        engine.tick();
        long version = engine.load(101, "game-1").orElseThrow().version();
        var command = control("action-1", version, 1, 0);
        var result = engine.apply(command);

        assertThat(engine.apply(command)).isEqualTo(result);
        assertThatThrownBy(() -> engine.apply(control("action-1", version, 1, 1)))
                .isInstanceOf(GameActionGateway.Rejected.class).hasMessage("ACTION_ID_CONFLICT");
        assertThatThrownBy(() -> engine.apply(control("action-2", 0, 2, 0)))
                .hasMessage("STALE_VERSION");
        clock.now = 3600;
        engine.tick();
        ObjectNode staleJump = control("action-3", version, 3, 0).input().deepCopy();
        staleJump.put("jump", true);
        assertThatThrownBy(() -> engine.apply(new GameActionCommand(101, "game-1", "action-3", version, staleJump)))
                .hasMessage("STALE_VERSION");
        long future = engine.load(101, "game-1").orElseThrow().version() + 1;
        assertThatThrownBy(() -> engine.apply(control("future", future, 4, 1))).hasMessage("STALE_VERSION");
        assertThatThrownBy(() -> engine.apply(control("old-sequence", version, 1, -1))).hasMessage("INVALID_ACTION");
    }

    @Test
    void 팔인_경기에서_상태가_늦어도_일곱째와_여덟째의_첫_이동이_반영된다() {
        var players = List.of(101L, 202L, 303L, 404L, 505L, 606L, 707L, 808L);
        engine.create("game-1", "table-1", players);
        readyPlayers("game-1", players);
        clock.now = 4200;
        engine.tick();
        long delayedVersion = engine.load(707, "game-1").orElseThrow().version();

        clock.now = 4900;
        engine.tick();
        var before = engine.load(101, "game-1").orElseThrow().publicState().path("players");
        engine.apply(new GameActionCommand(707, "game-1", "first-707", delayedVersion,
                control("first-707", delayedVersion, 1, 1).input()));
        engine.apply(new GameActionCommand(808, "game-1", "first-808", delayedVersion,
                control("first-808", delayedVersion, 1, -1).input()));
        clock.now = 5020;
        engine.tick();
        var after = engine.load(101, "game-1").orElseThrow().publicState().path("players");

        assertThat(after.get(6).path("x").asDouble()).isGreaterThan(before.get(6).path("x").asDouble());
        assertThat(after.get(7).path("x").asDouble()).isLessThan(before.get(7).path("x").asDouble());
    }

    @Test
    void 관전자에게는_공개상태만_주며_행동을_거절하고_복구가_시간을_되돌리지_않는다() {
        engine.create("game-1", "table-1", List.of(101L, 202L));
        readyPlayers("game-1", List.of(101L, 202L));
        clock.now = 3000;
        engine.tick();
        var state = engine.load(505, "game-1").orElseThrow();

        assertThat(state.role().name()).isEqualTo("SPECTATOR");
        assertThat(state.privateState()).isEmpty();
        assertThatThrownBy(() -> engine.apply(new GameActionCommand(505, "game-1", "bad", state.version(),
                mapper.createObjectNode()))).hasMessage("ACCESS_DENIED");
        assertThat(engine.load(101).orElseThrow().state().path("publicState").path("startsAt").asLong())
                .isEqualTo(4200);
    }

    @Test
    void 기권과_종료_이벤트는_한번만_발행한다() {
        engine.create("game-1", "table-1", List.of(101L, 202L));
        readyPlayers("game-1", List.of(101L, 202L));
        clock.now = 3000;
        engine.tick();
        var command = new GameForfeitCommand(202, "game-1", "forfeit-1");

        var result = engine.forfeit(command);
        assertThat(engine.forfeit(command).version()).isEqualTo(result.version());
        assertThat(engine.forfeit(command).duplicate()).isTrue();
        engine.tick();

        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
        assertThat(engine.load(101, "game-1").orElseThrow().publicState().path("winnerUserIds").get(0).asText())
                .isEqualTo("101");
    }

    @Test
    void 슬라이딩_액션은_중복_재요청에_한번만_적용하고_문자열_변조는_거절한다() {
        engine.create("game-1", "table-1", List.of(101L, 202L));
        readyPlayers("game-1", List.of(101L, 202L));
        clock.now = 3000;
        engine.tick();
        var state = engine.load(101, "game-1").orElseThrow();
        var input = mapper.createObjectNode().put("kind", "control").put("seq", 1).put("x", 0).put("z", 0)
                .put("aimX", 1).put("aimZ", 0).put("jump", false).put("fire", false).put("slide", true);
        var command = new GameActionCommand(101, "game-1", "slide-1", state.version(), input);
        var result = engine.apply(command);
        assertThat(engine.apply(command)).isEqualTo(result);
        clock.now = 3300;
        engine.tick();
        var after = engine.load(101, "game-1").orElseThrow();
        assertThat(after.publicState().path("players").get(0).path("x").asDouble())
                .isCloseTo(-2.6, org.assertj.core.data.Offset.offset(0.000001));
        assertThatThrownBy(() -> engine.apply(new GameActionCommand(101, "game-1", "slide-2", after.version(),
                input.deepCopy().put("seq", 2).put("slide", "true")))).hasMessage("INVALID_ACTION");
    }

    private void readyPlayers(String game, List<Long> users) {
        for (long user : users) {
            engine.apply(new GameActionCommand(user, game, "ready-" + user, engine.load(user, game).orElseThrow().version(),
                    mapper.createObjectNode().put("kind", "scene_ready").put("ready", true)));
        }
    }

    @Test
    void 한_수신자의_공개상태_변경은_다른_참가자와_관전자에게_전파되지_않는다() {
        engine.create("isolated", "table", List.of(101L, 202L));
        var first = engine.load(101, "isolated").orElseThrow();
        var original = first.publicState().deepCopy();

        ((ObjectNode) first.publicState()).put("gameCode", "ALTERED");
        ((ObjectNode) first.publicState().path("players").get(0)).put("x", 999);
        ((ObjectNode) first.privateState()).put("secret", "only-first");

        var other = engine.load(202, "isolated").orElseThrow();
        var spectator = engine.load(505, "isolated").orElseThrow();
        assertThat(other.publicState()).isEqualTo(original);
        assertThat(spectator.publicState()).isEqualTo(original);
        assertThat(other.privateState()).isEmpty();
        assertThat(spectator.privateState()).isEmpty();
        assertThat(spectator.role().name()).isEqualTo("SPECTATOR");
    }

    @Test
    void 방송_간격_이내의_틱도_최신_이동_상태를_반환한다() {
        engine.create("game-1", "table", List.of(101L, 202L));
        readyPlayers("game-1", List.of(101L, 202L));
        clock.now = 4200;
        engine.tick();
        long version = engine.load(101, "game-1").orElseThrow().version();
        engine.apply(control("walk", version, 1, 1));
        var before = engine.load(101, "game-1").orElseThrow();

        clock.now = 4220;
        engine.tick();
        var after = engine.load(101, "game-1").orElseThrow();

        assertThat(after.version()).isEqualTo(before.version());
        assertThat(after.publicState().path("serverTime").asLong()).isEqualTo(4220);
        assertThat(after.publicState().path("players").get(0).path("x").asDouble())
                .isGreaterThan(before.publicState().path("players").get(0).path("x").asDouble());
    }

    @Test
    void 팔인_경기에서_오래된_공개_상태의_첫_로딩_보고를_모두_받아_시작한다() {
        var players = List.of(101L, 202L, 303L, 404L, 505L, 606L, 707L, 808L);
        engine.create("loading", "table", players);
        long initialVersion = engine.load(101, "loading").orElseThrow().version();
        var ready = mapper.createObjectNode().put("kind", "scene_ready").put("ready", true);
        clock.now = 600;
        engine.tick();

        for (long user : players) {
            engine.apply(new GameActionCommand(user, "loading", "first-" + user, initialVersion, ready));
        }

        var dropping = engine.load(101, "loading").orElseThrow().publicState();
        assertThat(dropping.path("readyUserIds").size()).isEqualTo(8);
        assertThat(dropping.path("phase").asText()).isEqualTo("DROPPING");
        clock.now = dropping.path("startsAt").asLong();
        engine.tick();
        assertThat(engine.load(101, "loading").orElseThrow().publicState().path("phase").asText())
                .isEqualTo("RUNNING");
    }

    @Test
    void 같은_참가자의_오래된_로딩_보고가_최신_취소를_덮어쓰지_않는다() {
        engine.create("loading", "table", List.of(101L, 202L));
        long initialVersion = engine.load(101, "loading").orElseThrow().version();
        var ready = mapper.createObjectNode().put("kind", "scene_ready").put("ready", true);
        clock.now = 600;
        engine.tick();
        long currentVersion = engine.load(101, "loading").orElseThrow().version();
        engine.apply(new GameActionCommand(101, "loading", "cancel", currentVersion,
                ready.deepCopy().put("ready", false)));

        assertThatThrownBy(() -> engine.apply(new GameActionCommand(101, "loading", "late", initialVersion, ready)))
                .hasMessage("STALE_VERSION");
        engine.apply(new GameActionCommand(202, "loading", "other-ready", initialVersion, ready));
        var loading = engine.load(101, "loading").orElseThrow().publicState();
        assertThat(loading.path("phase").asText()).isEqualTo("LOADING");
        assertThat(loading.path("readyUserIds").size()).isEqualTo(1);
    }

    @Test
    void 본인_로딩보고만_허용하고_중복보고와_재접속은_낙하시각을_되돌리지_않는다() {
        engine.create("loading", "table", List.of(101L, 202L));
        clock.now = 20_000;
        engine.tick();
        var input = mapper.createObjectNode().put("kind", "scene_ready").put("ready", true);
        long version = engine.load(101, "loading").orElseThrow().version();
        assertThatThrownBy(() -> engine.apply(new GameActionCommand(999, "loading", "intruder", version, input)))
                .hasMessage("ACCESS_DENIED");
        var first = new GameActionCommand(101, "loading", "ready-101", version, input);
        var receipt = engine.apply(first);
        assertThat(engine.load(101, "loading").orElseThrow().publicState().path("phase").asText()).isEqualTo("LOADING");
        clock.now = 25_000;
        engine.tick();
        engine.apply(new GameActionCommand(202, "loading", "ready-202", engine.load(202, "loading").orElseThrow().version(), input));
        assertThat(engine.apply(first)).isEqualTo(receipt);
        assertThat(engine.load(101).orElseThrow().state().path("publicState").path("landsAt").asLong()).isEqualTo(26_200);
        assertThatThrownBy(() -> engine.apply(new GameActionCommand(101, "loading", "ready-101", version,
                mapper.createObjectNode().put("kind", "scene_ready").put("ready", false))))
                .hasMessage("ACTION_ID_CONFLICT");
    }

    private GameActionCommand control(String action, long version, long seq, int x) {
        var input = mapper.createObjectNode().put("kind", "control").put("seq", seq).put("x", x).put("z", 0)
                .put("aimX", 1).put("aimZ", 0).put("jump", false).put("fire", false);
        return new GameActionCommand(101, "game-1", action, version, input);
    }

    private static final class MutableClock extends Clock {
        long now;
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(now); }
    }
}
