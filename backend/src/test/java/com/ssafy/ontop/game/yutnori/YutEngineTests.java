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
        int events = notices.size();
        assertThat(router.apply(command)).isEqualTo(first);
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
}
