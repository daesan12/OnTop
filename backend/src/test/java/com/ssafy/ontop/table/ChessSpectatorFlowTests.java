package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.game.chess.ChessParkApplication;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
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

/** 실제 인증·테이블·체스 엔진·소켓을 사용하며 DB·지갑은 메모리 대역이다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,frontend-test,chess-park", "ontop.websocket.authenticated=true",
        "ontop.game-start.enabled=true", "ontop.games.chess.enabled=true", "server.address=127.0.0.1",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=체스관전검증",
        "ontop.world.channels[0].capacity=8"
})
@Import({ChessParkApplication.Fixture.class, FrozenWorldFixture.class})
class ChessSpectatorFlowTests {
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
    void 체스판_밖의_핑은_방송과_빈도제한_등록_없이_거절하고_경계_칸은_공유한다() throws Exception {
        try (var first = connect(101); var second = connect(202); var viewer = connect(505)) {
            first.request("TABLE_JOIN", Map.of("tableId", TABLE));
            first.request("GAME_SELECT", Map.of("gameCode", "CHESS", "betAmountPerPlayer", 0));
            second.request("TABLE_JOIN", Map.of("tableId", TABLE));
            first.request("TABLE_JOIN", Map.of("tableId", TABLE));
            first.request("READY_SET", Map.of("ready", true));
            second.request("READY_SET", Map.of("ready", true));
            String game = first.state("RESTORED").path("gameId").asText();
            second.state("RESTORED");
            JsonNode before = first.request("GAME_STATE_CHECK", Map.of("gameId", game)).path("payload");
            long version = before.path("version").asLong();
            assertThat(viewer.request("GAME_WATCH", Map.of("gameId", game)).path("type").asText())
                    .isEqualTo("GAME_STATE");

            var rejectedIds = new ArrayList<String>();
            for (var square : List.of(new int[] {8, 0}, new int[] {0, 8}, new int[] {14, 14})) {
                String eventId = UUID.randomUUID().toString();
                rejectedIds.add(eventId);
                JsonNode response = viewer.request("OMOK_SPECTATOR_PING_SEND",
                        ping(game, eventId, version, square[0], square[1]));
                assertThat(response.path("type").asText()).isEqualTo("ERROR");
                assertThat(response.at("/payload/code").asText()).isEqualTo("GAME_SPECTATOR_INVALID_TARGET");
            }

            // 거절된 핑이 accept까지 진행했다면 이 정상 요청은 빈도 제한으로 실패한다.
            String validId = UUID.randomUUID().toString();
            JsonNode accepted = viewer.request("OMOK_SPECTATOR_PING_SEND", ping(game, validId, version, 7, 7));
            assertThat(accepted.path("type").asText()).isEqualTo("OMOK_SPECTATOR_PING");
            assertThat(accepted.at("/payload/x").asInt()).isEqualTo(7);
            assertThat(accepted.at("/payload/y").asInt()).isEqualTo(7);
            for (var player : List.of(first, second)) {
                assertThat(player.awaitSpectatorEvent(validId).path("payload")).isEqualTo(accepted.path("payload"));
            }
            for (var receiver : List.of(first, second, viewer)) {
                for (String rejectedId : rejectedIds) {
                    assertThat(receiver.spectatorEvents(rejectedId)).isEmpty();
                }
            }
            JsonNode after = first.request("GAME_STATE_CHECK", Map.of("gameId", game)).path("payload");
            assertThat(after.path("version")).isEqualTo(before.path("version"));
            assertThat(after.at("/publicState/board")).isEqualTo(before.at("/publicState/board"));
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

    private Map<String, Object> ping(String game, String event, long version, int x, int y) {
        return Map.of("gameId", game, "eventId", event, "basedOnVersion", version, "x", x, "y", y);
    }
}
