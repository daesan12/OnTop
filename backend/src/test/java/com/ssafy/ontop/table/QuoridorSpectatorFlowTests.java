package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.demo.QuoridorParkApplication;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** 실제 인증·테이블 시작·엔진·관전 소켓 검증. 맵 이동·DB·지갑은 독립 검증 범위가 아니다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,frontend-test,quoridor-park", "ontop.websocket.authenticated=true",
        "ontop.game-start.enabled=true", "ontop.games.quoridor.enabled=true", "server.address=127.0.0.1",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=관전검증",
        "ontop.world.channels[0].capacity=8"
})
@Import({QuoridorParkApplication.Fixture.class, FrozenWorldFixture.class})
class QuoridorSpectatorFlowTests {
    private static final String TABLE = "table-" + UUID.nameUUIDFromBytes(
            "one\0table-1".getBytes(StandardCharsets.UTF_8));
    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @Autowired private ObjectMapper mapper;
    @Autowired private WorldChannelRegistry positions;

    @DynamicPropertySource
    static void locations(DynamicPropertyRegistry registry) {
        registry.add("ontop.world.proximity.tables[" + TABLE + "].x", () -> 0);
        registry.add("ontop.world.proximity.tables[" + TABLE + "].z", () -> 0);
    }

    @Test
    void 승인관전자만_훈수와_채팅을_공유하며_판을_바꾸지_않고_해제후_발신을_막는다() throws Exception {
        try (var first = connect(101); var second = connect(202); var viewer = connect(505);
                var otherViewer = connect(404); var outsider = connect(303)) {
            first.request("TABLE_JOIN", Map.of("tableId", TABLE));
            first.request("GAME_SELECT", Map.of("gameCode", "QUORIDOR", "betAmountPerPlayer", 1));
            second.request("TABLE_JOIN", Map.of("tableId", TABLE));
            first.request("TABLE_JOIN", Map.of("tableId", TABLE));
            first.request("READY_SET", Map.of("ready", true));
            second.request("READY_SET", Map.of("ready", true));
            String game = first.state("RESTORED").path("gameId").asText();
            second.state("RESTORED");
            JsonNode before = first.request("GAME_STATE_CHECK", Map.of("gameId", game)).path("payload");
            long version = before.path("version").asLong();

            assertThat(code(outsider.request("GAME_SPECTATOR_CHAT_SEND", chat(game))))
                    .isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
            assertThat(code(first.request("OMOK_SPECTATOR_PING_SEND", ping(game, version, 4, 4))))
                    .isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
            for (var observer : List.of(viewer, otherViewer)) {
                JsonNode watched = observer.request("GAME_WATCH", Map.of("gameId", game));
                assertThat(watched.path("type").asText()).as(watched.toString()).isEqualTo("GAME_STATE");
                assertThat(watched.at("/payload/role").asText()).isEqualTo("SPECTATOR");
                assertThat(watched.at("/payload/privateState").isEmpty()).isTrue();
            }
            assertThat(code(viewer.request("OMOK_SPECTATOR_PING_SEND", ping(game, version, 9, 0))))
                    .isEqualTo("QUORIDOR_PING_INVALID_POSITION");
            assertThat(code(viewer.request("OMOK_SPECTATOR_PING_SEND", ping(game, version + 1, 8, 8))))
                    .isEqualTo("OMOK_SPECTATOR_PING_STALE_VERSION");
            JsonNode recommendation = viewer.request("OMOK_SPECTATOR_PING_SEND", ping(game, version, 8, 8));
            assertThat(recommendation.path("type").asText()).isEqualTo("OMOK_SPECTATOR_PING");
            assertThat(recommendation.at("/payload/x").asInt()).isEqualTo(8);
            assertThat(recommendation.at("/payload/y").asInt()).isEqualTo(8);
            JsonNode conversation = viewer.request("GAME_SPECTATOR_CHAT_SEND", chat(game));
            assertThat(conversation.path("type").asText()).isEqualTo("GAME_SPECTATOR_CHAT_MESSAGE");
            String pingId = recommendation.at("/payload/eventId").asText();
            String chatId = conversation.at("/payload/eventId").asText();
            for (var receiver : List.of(first, second, otherViewer)) {
                assertThat(receiver.awaitSpectatorEvent(pingId).path("payload"))
                        .isEqualTo(recommendation.path("payload"));
                assertThat(receiver.awaitSpectatorEvent(chatId).path("payload"))
                        .isEqualTo(conversation.path("payload"));
            }
            assertThat(code(viewer.request("OMOK_SPECTATOR_PING_SEND", ping(game, version, 4, 4))))
                    .isEqualTo("OMOK_SPECTATOR_PING_TOO_FREQUENT");
            assertThat(code(viewer.request("GAME_SPECTATOR_CHAT_SEND", chat(game))))
                    .isEqualTo("GAME_SPECTATOR_CHAT_TOO_FREQUENT");
            JsonNode after = first.request("GAME_STATE_CHECK", Map.of("gameId", game)).path("payload");
            assertThat(after.path("version")).isEqualTo(before.path("version"));
            assertThat(after.path("publicState")).isEqualTo(before.path("publicState"));
            assertThat(outsider.spectatorEvents(pingId)).isEmpty();
            assertThat(outsider.spectatorEvents(chatId)).isEmpty();

            JsonNode playerChat = second.request("GAME_SPECTATOR_CHAT_SEND", chat(game));
            assertThat(playerChat.path("type").asText()).isEqualTo("GAME_SPECTATOR_CHAT_MESSAGE");
            assertThat(viewer.awaitSpectatorEvent(playerChat.at("/payload/eventId").asText()).path("payload"))
                    .isEqualTo(playerChat.path("payload"));
            viewer.request("GAME_UNWATCH", Map.of());
            assertThat(code(viewer.request("GAME_SPECTATOR_CHAT_SEND", chat(game))))
                    .isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
            assertThat(code(viewer.request("OMOK_SPECTATOR_PING_SEND", ping(game, version, 0, 0))))
                    .isEqualTo("GAME_SPECTATOR_ACCESS_DENIED");
        }
    }

    private ScenarioClient connect(long user) throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            var response = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/auth/websocket-ticket"))
                    .header("Authorization", "Bearer " + jwt.issue(user, TestLoginSessions.ID))
                    .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            var client = new ScenarioClient(port, Long.toString(user), mapper.readTree(response.body()).path("ticket").asText());
            client.state("LOBBY");
            client.request("CHANNEL_JOIN", Map.of("channelId", "one"));
            positions.move(Long.toString(user), new WorldChannelRegistry.Position(1, 0, .8, 0, 0));
            return client;
        }
    }

    private Map<String, Object> chat(String game) {
        return Map.of("gameId", game, "eventId", UUID.randomUUID().toString(), "text", "가운데 길을 막아봐요!");
    }

    private Map<String, Object> ping(String game, long version, int x, int y) {
        return Map.of("gameId", game, "eventId", UUID.randomUUID().toString(), "basedOnVersion", version, "x", x, "y", y);
    }

    private String code(JsonNode response) {
        assertThat(response.path("type").asText()).as(response.toString()).isEqualTo("ERROR");
        return response.at("/payload/code").asText();
    }
}
