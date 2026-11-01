package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.halligalli.service.HalliGalliEngine;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import static org.assertj.core.api.Assertions.*;

/** 실제 소켓으로 할리갈리 공개·관전·경기 채팅·지난 종 거절·재접속 상태를 검증한다. 인증·시작은 테스트 대역이다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.games.halligalli.enabled=true",
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s",
        "ontop.world.channels[0].channel-id=halli", "ontop.world.channels[0].name=할리갈리테스트", "ontop.world.channels[0].capacity=3"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, OmokFlowTests.Fixture.class})
@DirtiesContext
class HalliGalliFlowTests {
    private static final String TABLE = "table-" + UUID.nameUUIDFromBytes("halli\0table-1".getBytes(StandardCharsets.UTF_8));
    @LocalServerPort private int port;
    @Autowired private HalliGalliEngine engine;

    @DynamicPropertySource
    static void locations(DynamicPropertyRegistry properties) {
        var spawn = com.ssafy.ontop.world.movement.ParkScene.load().spawn(0);
        properties.add("ontop.world.proximity.tables[" + TABLE + "].x", () -> spawn.x);
        properties.add("ontop.world.proximity.tables[" + TABLE + "].z", () -> spawn.z);
    }

    @Test
    void 실제소켓에서공개_관전_경기채팅_지난종거절_재접속상태를연결한다() throws Exception {
        engine.create("halli", TABLE, List.of(101L, 202L));
        try (ScenarioClient first = connect("naver", "RESTORED"); ScenarioClient second = connect("ssafy", "RESTORED");
                ScenarioClient viewer = connect("spectator", "LOBBY")) {
            viewer.request("CHANNEL_JOIN", Map.of("channelId", "halli"));
            viewer.request("WORLD_MOVE", Map.of("seq", 1, "dx", 0, "dz", 0, "run", false));
            var watch = viewer.request("GAME_WATCH", Map.of("gameId", "halli")).path("payload");
            assertThat(watch.path("publicState").path("gameCode").asText()).isEqualTo("HALLI_GALLI");
            assertThat(watch.path("privateState").isEmpty()).isTrue();
            assertThat(watch.path("publicState").path("turnUserId").asText()).isEqualTo("101");

            assertThat(first.request("GAME_ACTION_SEND", action("f1", 0, Map.of("kind", "flip"))).path("type").asText())
                    .isEqualTo("GAME_ACTION_RESULT");
            var flipped = viewer.await(message -> version(message, 1)).path("payload").path("publicState");
            assertThat(flipped.path("bellWindowId").asLong()).isEqualTo(1);
            assertThat(flipped.path("players").get(0).path("faceUpCount").asInt()).isEqualTo(1);
            second.request("GAME_ACTION_SEND", action("f2", 1, Map.of("kind", "flip")));
            assertThat(viewer.await(message -> version(message, 2)).path("payload").path("publicState")
                    .path("bellWindowId").asLong()).isEqualTo(2);

            // 지난 창의 종은 벌칙 없이 거절되고 상태 버전도 바뀌지 않는다.
            assertThat(code(first.request("GAME_ACTION_SEND", action("late", 2, Map.of("kind", "ring", "bellWindowId", 1)))))
                    .isEqualTo("GAME_ACTION_STALE_VERSION");
            assertThat(first.request("GAME_STATE_CHECK", Map.of("gameId", "halli")).path("payload").path("version").asLong())
                    .isEqualTo(2);

            // 할리갈리도 공통 경기 채팅 허용 목록에 있다. 참가자 채팅은 실제 착석·시작 흐름이 필요해 이 대역에서는 다루지 않는다.
            String viewerChat = UUID.randomUUID().toString();
            assertThat(viewer.request("GAME_SPECTATOR_CHAT_SEND", Map.of("gameId", "halli", "eventId", viewerChat,
                    "text", "종 쳐요")).path("type").asText()).isEqualTo("GAME_SPECTATOR_CHAT_MESSAGE");
            first.awaitSpectatorEvent(viewerChat);
            second.awaitSpectatorEvent(viewerChat);
            // 핑은 오목·주사위 장부 전용 계약이라 할리갈리에서는 계속 거절한다.
            assertThat(code(viewer.request("OMOK_SPECTATOR_PING_SEND", Map.of("gameId", "halli",
                    "eventId", UUID.randomUUID().toString(), "basedOnVersion", 2, "x", 7, "y", 7))))
                    .isEqualTo("GAME_SPECTATOR_UNSUPPORTED_GAME");

            var before = first.request("GAME_STATE_CHECK", Map.of("gameId", "halli")).path("payload");
            first.stopPong();
            assertThat(first.awaitClose()).isEqualTo(1001);
            try (ScenarioClient returned = new ScenarioClient(port, "naver")) {
                var restored = returned.state("RESTORED");
                assertThat(restored.at("/state/publicState/gameCode").asText()).isEqualTo("HALLI_GALLI");
                assertThat(restored.at("/state/privateState").isEmpty()).isTrue();
                assertThat(restored.at("/state/publicState/players")).isEqualTo(before.path("publicState").path("players"));
                assertThat(restored.at("/state/publicState/flipDeadline")).isEqualTo(before.path("publicState").path("flipDeadline"));
            }
        }
    }

    private Map<String, Object> action(String id, long version, Map<String, Object> input) {
        return Map.of("gameId", "halli", "actionId", id, "expectedVersion", version, "input", input);
    }

    private String code(JsonNode message) { return message.path("payload").path("code").asText(); }

    private ScenarioClient connect(String login, String status) throws Exception {
        var client = new ScenarioClient(port, login);
        client.state(status);
        return client;
    }

    private boolean version(JsonNode message, long value) {
        return message.path("type").asText().equals("GAME_STATE") && message.path("payload").path("version").asLong() == value;
    }
}
