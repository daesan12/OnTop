package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.demo.QuoridorParkApplication;
import com.ssafy.ontop.table.service.TableHub;
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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** 실제 JWT·소켓·엔진·로비 연결. 결과 저장/지갑은 로컬 대역이며 실제 잔액 검증과 구분한다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,frontend-test,quoridor-park", "ontop.websocket.authenticated=true",
        "ontop.game-start.enabled=true", "ontop.games.quoridor.enabled=true", "server.address=127.0.0.1",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=기권검증",
        "ontop.world.channels[0].capacity=8"
})
@Import({QuoridorParkApplication.Fixture.class, FrozenWorldFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class QuoridorForfeitFlowTests {
    private static final String TABLE = "table-" + UUID.nameUUIDFromBytes(
            "one\0table-1".getBytes(StandardCharsets.UTF_8));
    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @Autowired private ObjectMapper mapper;
    @Autowired private WorldChannelRegistry positions;
    @Autowired private TableHub hub;

    @DynamicPropertySource
    static void locations(DynamicPropertyRegistry registry) {
        registry.add("ontop.world.proximity.tables[" + TABLE + "].x", () -> 0);
        registry.add("ontop.world.proximity.tables[" + TABLE + "].z", () -> 0);
    }

    @ParameterizedTest
    @ValueSource(ints = {2, 4})
    void 기권자는_즉시_이동하고_최후_한명일때_종료정산_대기실과_다음판으로_복귀한다(int count) throws Exception {
        List<ScenarioClient> players = new ArrayList<>();
        try (var viewer = connect(505)) {
            for (int i = 1; i <= count; i++) {
                players.add(connect(i * 101L));
            }
            String game = start(players);
            viewer.request("TABLE_WATCH", Map.of("tableId", TABLE));
            assertThat(viewer.request("GAME_WATCH", Map.of("gameId", game)).path("type").asText())
                    .isEqualTo("GAME_STATE");

            for (int i = 0; i < count - 1; i++) {
                var quitter = players.get(i);
                var request = Map.of("gameId", game, "actionId", "leave-" + i);
                assertThat(quitter.request("GAME_FORFEIT", request).path("type").asText())
                        .isEqualTo("GAME_FORFEIT_RESULT");
                quitter.state("LOBBY");
                assertThat(quitter.request("GAME_FORFEIT", request).at("/payload/duplicate").asBoolean()).isTrue();
                quitter.state("LOBBY");
                assertThat(quitter.request("WORLD_MOVE", Map.of("seq", 1, "dx", 1, "dz", 0,
                        "run", false, "jump", false)).path("type").asText()).isEqualTo("WORLD_STATE");
                if (i < count - 2) {
                    assertThat(hub.listTables("one").tables().stream().filter(t -> t.tableId().equals(TABLE))
                            .findFirst().orElseThrow().status()).isEqualTo("PLAYING");
                    assertThat(players.getLast().request("GAME_STATE_CHECK", Map.of("gameId", game))
                            .at("/payload/publicState/status").asText()).isEqualTo("PLAYING");
                }
            }
            var winner = players.getLast();
            winner.await(message -> message.path("type").asText().equals("GAME_START_STATE")
                    && message.at("/payload/phase").asText().equals("WAITING"));
            assertThat(hub.listTables("one").tables().stream().filter(t -> t.tableId().equals(TABLE))
                    .findFirst().orElseThrow().status()).isEqualTo("WAITING");
            for (int i = 0; i < count; i++) {
                var result = players.get(i).request("GAME_RESULT_CHECK", Map.of("gameSessionId", game));
                assertThat(result.path("type").asText()).isEqualTo("GAME_RESULT");
                assertThat(result.at("/payload/settlementStatus").asText()).isEqualTo("SETTLED");
                assertThat(result.at("/payload/participants").size()).isEqualTo(count);
                assertThat(result.at("/payload/participants/" + i + "/result").asText())
                        .isEqualTo(i == count - 1 ? "WIN" : "FORFEIT");
            }
            assertThat(viewer.request("GAME_RESULT_CHECK", Map.of("gameSessionId", game))
                    .at("/payload/code").asText()).isEqualTo("GAME_RESULT_ACCESS_DENIED");
            assertThat(viewer.request("GAME_STATE_CHECK", Map.of("gameId", game))
                    .at("/payload/publicState/status").asText()).isEqualTo("FINISHED");
            viewer.request("GAME_UNWATCH", Map.of());
            assertThat(winner.request("TABLE_LEAVE", Map.of()).path("type").asText()).isEqualTo("TABLE_LEFT");
            assertThat(winner.request("WORLD_MOVE", Map.of("seq", 1, "dx", 1, "dz", 0,
                    "run", false, "jump", false)).path("type").asText()).isEqualTo("WORLD_STATE");

            String next = start(players);

            assertThat(next).isNotEqualTo(game);
            assertThat(players.getFirst().request("GAME_FORFEIT", Map.of("gameId", game, "actionId", "leave-0"))
                    .at("/payload/code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
            assertThat(winner.request("GAME_STATE_CHECK", Map.of("gameId", next))
                    .at("/payload/publicState/status").asText()).isEqualTo("PLAYING");
        } finally {
            for (var player : players) { player.close(); }
        }
    }

    private String start(List<ScenarioClient> players) throws Exception {
        for (int i = 0; i < players.size(); i++) {
            assertThat(players.get(i).request("TABLE_JOIN", Map.of("tableId", TABLE)).path("type").asText())
                    .isEqualTo("TABLE_STATE");
            if (i == 0) {
                assertThat(players.get(i).request("GAME_SELECT", Map.of("gameCode", "QUORIDOR",
                        "betAmountPerPlayer", 7)).path("type").asText()).isEqualTo("TABLE_STATE");
            }
        }
        for (var player : players) {
            player.request("TABLE_JOIN", Map.of("tableId", TABLE));
            player.request("READY_SET", Map.of("ready", true));
        }
        String game = players.getFirst().state("RESTORED").path("gameId").asText();
        for (var player : players.subList(1, players.size())) { player.state("RESTORED"); }
        return game;
    }

    private ScenarioClient connect(long user) throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            var response = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/auth/websocket-ticket"))
                    .header("Authorization", "Bearer " + jwt.issue(user, TestLoginSessions.ID))
                    .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            var client = new ScenarioClient(port, Long.toString(user), mapper.readTree(response.body())
                    .path("ticket").asText());
            client.state("LOBBY");
            client.request("CHANNEL_JOIN", Map.of("channelId", "one"));
            positions.move(Long.toString(user), new WorldChannelRegistry.Position(1, 0, .8, 0, 0));
            return client;
        }
    }
}
