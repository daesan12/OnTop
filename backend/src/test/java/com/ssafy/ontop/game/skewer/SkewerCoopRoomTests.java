package com.ssafy.ontop.game.skewer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopEngine;
import com.ssafy.ontop.game.skewer.coop.service.SkewerCoopFinished;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Map;
import java.util.Random;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class SkewerCoopRoomTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final GameEngineRouter router = new GameEngineRouter();
    private final ArrayList<SkewerCoopFinished> results = new ArrayList<>();
    private final SkewerCoopEngine engine = new SkewerCoopEngine(mapper, Clock.systemUTC(), router,
            event -> { }, user -> { }, (user, channel) -> true, new Random(18), 240, results::add);

    @Test
    void 가게이름과_방장닉네임만_공개하고_비밀번호와_해시는_노출하지_않는다() {
        var created = engine.create(101, "park", "first", "달빛 꼬치집", "공원친구", "secret123");
        var listed = engine.rooms(202, "park");
        assertThat(listed.at("/rooms/0/roomName").asText()).isEqualTo("달빛 꼬치집");
        assertThat(listed.at("/rooms/0/hostNickname").asText()).isEqualTo("공원친구");
        assertThat(listed.at("/rooms/0/locked").asBoolean()).isTrue();
        assertThat(listed.toString()).doesNotContain("secret123", "password", "$2");
        assertThat(created.toString()).doesNotContain("secret123", "password", "$2");
        assertThat(engine.rooms(202, "other").path("rooms")).isEmpty();
    }

    @Test
    void 잠긴방은_비밀번호를_검증하고_재접속은_다시_요구하지_않는다() {
        String id = engine.create(101, "park", "first", "우리 가게", "방장", "abcd").path("gameId").asText();
        assertThatThrownBy(() -> engine.join(202, "park", id)).hasMessageContaining("비밀번호가 맞지");
        assertThatThrownBy(() -> engine.join(202, "park", id, "wrong")).hasMessageContaining("비밀번호가 맞지");
        assertThat(engine.rooms(202, "park").at("/rooms/0/players").asInt()).isEqualTo(1);
        engine.join(202, "park", id, "abcd");
        assertThat(engine.join(202, "park", id).path("registered").asBoolean()).isTrue();
        assertThatThrownBy(() -> engine.join(303, "park", id, "abcd")).isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 비밀번호_연속시도를_제한하고_다른_사용자는_차단하지_않는다() {
        String id = engine.create(101, "park", "first", "우리 가게", "방장", "abcd").path("gameId").asText();
        for (int i = 0; i < 5; i++) {
            assertThatThrownBy(() -> engine.join(202, "park", id, "wrong")).hasMessageContaining("비밀번호가 맞지");
        }
        assertThatThrownBy(() -> engine.join(202, "park", id, "abcd")).hasMessageContaining("30초");
        assertThat(engine.join(303, "park", id, "abcd").path("registered").asBoolean()).isTrue();
    }

    @Test
    void 역할선택중_퇴장은_정산없이_방을_닫고_두명_모두_새방에_입장할수있다() {
        String id = engine.create(101, "park", "first").path("gameId").asText();
        engine.join(202, "park", id);
        act(101, id, Map.of("type", "ROLE", "role", "chef"));
        engine.leaveWaiting(202, id);
        engine.leaveWaiting(202, id);
        engine.tick();
        engine.persistTerminalResults();
        assertThat(results).isEmpty();
        assertThat(engine.rooms(101, "park").at("/mine/publicState/endReason").asText()).isEqualTo("SKEWER_CANCELLED");
        assertThat(engine.rooms(202, "park").path("rooms")).isEmpty();
        String next = engine.create(202, "park", "second").path("gameId").asText();
        assertThat(engine.join(101, "park", next).path("registered").asBoolean()).isTrue();
    }

    @Test
    void 준비완료후_카운트다운에서는_대기방_취소를_거절한다() {
        String id = engine.create(101, "park", "first").path("gameId").asText();
        engine.join(202, "park", id);
        act(101, id, Map.of("type", "ROLE", "role", "chef"));
        act(202, id, Map.of("type", "ROLE", "role", "server"));
        act(101, id, Map.of("type", "READY", "ready", true));
        act(202, id, Map.of("type", "READY", "ready", true));
        assertThatThrownBy(() -> engine.leaveWaiting(101, id)).hasMessageContaining("기권");
        assertThat(engine.load(101, id).orElseThrow().publicState().path("phase").asText()).isEqualTo("COUNTDOWN");
    }

    @Test
    void 빈이름과_과도한_길이와_잘못된_비밀번호를_거절한다() {
        for (String name : new String[] {" ", "a".repeat(25), "줄\n바꿈"}) {
            assertThatThrownBy(() -> engine.create(101, "park", "key", name, "방장", ""))
                    .isInstanceOf(IllegalArgumentException.class);
        }
        assertThatThrownBy(() -> engine.create(101, "park", "key", "가게", "방장", "123"))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private void act(long user, String id, Map<String, Object> input) {
        long version = engine.load(user, id).orElseThrow().publicState().path("actionVersion").asLong();
        engine.apply(new GameActionCommand(user, id, UUID.randomUUID().toString(), version, mapper.valueToTree(input)));
    }
}
