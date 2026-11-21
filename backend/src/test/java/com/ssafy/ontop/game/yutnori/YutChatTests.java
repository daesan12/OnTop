package com.ssafy.ontop.game.yutnori;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.yutnori.domain.YutMatch;
import com.ssafy.ontop.game.yutnori.service.YutEngine;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Random;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class YutChatTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final AtomicLong now = new AtomicLong(10_000);
    private final Clock clock = new Clock() {
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(now.get()); }
    };
    private final GameEngineRouter router = new GameEngineRouter();
    private final YutEngine engine = new YutEngine(mapper, clock, new Random(2), router,
            event -> { }, user -> { }, (user, channel) -> true);

    private String game(boolean start) {
        String id = engine.create(101, "channel-1", "chat", "대화", "청1",
                new YutMatch.Rules(false, false, false)).path("gameId").asText();
        engine.join(202, "channel-1", id, "홍1");
        engine.join(303, "channel-1", id, "청2");
        engine.join(404, "channel-1", id, "홍2");
        if (start) {
            for (long user : List.of(101L, 202L, 303L, 404L)) {
                engine.lobby(user, id, mapper.createObjectNode().put("type", "READY").put("ready", true));
            }
            engine.start(101, id);
            engine.watch(505, "channel-1", id);
        }
        return id;
    }

    @Test
    void 팀대화는_동료의_개인상태에만_포함하고_상대와_관전및_공개기록에는_노출하지_않는다() {
        String id = game(true);
        engine.chat(101, id, "TEAM", "청팀비밀");
        engine.chat(202, id, "TEAM", "홍팀비밀");
        engine.chat(303, id, "ALL", "전체인사");

        for (long user : List.of(101L, 303L)) {
            var view = router.load(user, id).orElseThrow();
            assertThat(view.privateState().toString()).contains("청팀비밀").doesNotContain("홍팀비밀");
            assertThat(router.load(user).orElseThrow().state().path("privateState").toString()).contains("청팀비밀");
        }
        for (long user : List.of(202L, 404L)) {
            assertThat(engine.member(user, id).path("privateState").toString()).contains("홍팀비밀").doesNotContain("청팀비밀");
        }
        var watcher = router.load(505, id).orElseThrow();
        assertThat(watcher.privateState().isEmpty()).isTrue();
        assertThat(watcher.publicState().path("chat").toString()).contains("전체인사");
        assertThat(watcher.publicState().toString()).doesNotContain("청팀비밀", "홍팀비밀");
        assertThat(engine.rooms(505, "channel-1").toString()).doesNotContain("청팀비밀", "홍팀비밀");
    }

    @Test
    void 관전자와_외부인및_퇴장자는_팀대화를_보낼수_없다() {
        String id = game(true);
        assertThatThrownBy(() -> engine.chat(505, id, "TEAM", "위장")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> engine.chat(606, id, "ALL", "외부")).isInstanceOf(IllegalArgumentException.class);
        engine.chat(505, id, "ALL", "관전인사");
        engine.forfeit(new GameForfeitCommand(101, id, "leave"));
        engine.leave(101, id);

        assertThatThrownBy(() -> engine.chat(101, id, "TEAM", "퇴장후")).isInstanceOf(IllegalArgumentException.class);
        assertThat(engine.member(101, id).path("privateState").isEmpty()).isTrue();
        assertThat(engine.member(202, id).path("publicState").path("chat").toString()).contains("관전인사");
    }

    @Test
    void 팀이_변경될수_있는_대기방은_팀대화를_허용하지_않는다() {
        String id = game(false);
        assertThatThrownBy(() -> engine.chat(101, id, "TEAM", "시작전비밀")).isInstanceOf(IllegalArgumentException.class);
        engine.chat(101, id, "ALL", "준비인사");
        assertThat(engine.member(202, id).path("publicState").path("chat").toString()).contains("준비인사");
    }

    @Test
    void 채팅의_공개범위와_길이_전송빈도및_보관량을_제한한다() {
        String id = game(true);
        assertThatThrownBy(() -> engine.chat(101, id, "PRIVATE", "잘못된범위")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> engine.chat(101, id, "ALL", " ")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> engine.chat(101, id, "ALL", "가".repeat(101))).isInstanceOf(IllegalArgumentException.class);
        engine.chat(101, id, "ALL", "첫메시지");
        assertThatThrownBy(() -> engine.chat(101, id, "TEAM", "너무빠름")).isInstanceOf(IllegalArgumentException.class);
        for (int index = 0; index < 65; index++) {
            now.addAndGet(1_000);
            engine.chat(101, id, "ALL", "전체" + index);
        }
        for (int index = 0; index < 45; index++) {
            now.addAndGet(1_000);
            engine.chat(101, id, "TEAM", "팀" + index);
        }
        var state = engine.member(101, id);
        assertThat(state.path("publicState").path("chat")).hasSize(60);
        assertThat(state.path("privateState").path("teamChat")).hasSize(40);
        assertThat(state.path("publicState").path("log").toString()).doesNotContain("전체64", "팀44");
    }
}
