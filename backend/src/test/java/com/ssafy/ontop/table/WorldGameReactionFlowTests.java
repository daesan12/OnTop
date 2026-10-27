package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;
import java.nio.charset.StandardCharsets;
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

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.games.omok.enabled=true",
        "ontop.game-start.enabled=true", "ontop.world.channels[0].channel-id=one",
        "ontop.world.channels[0].name=연출검증", "ontop.world.channels[0].capacity=4",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, OmokFlowTests.Fixture.class,
        FrozenWorldFixture.class, CommittedStartFlowTests.Fixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class WorldGameReactionFlowTests {
    private static final String TABLE = "table-" + UUID.nameUUIDFromBytes(
            "one\0table-1".getBytes(StandardCharsets.UTF_8));
    @LocalServerPort private int port;
    @Autowired private OmokEngine engine;
    @Autowired private OmokFlowTests.TestClock clock;
    @Autowired private WorldChannelRegistry positions;
    @Autowired private AccessJwtService jwt;
    @Autowired private ObjectMapper mapper;
    @Autowired private CommittedStartFlowTests.ReservationDouble reservation;

    @DynamicPropertySource
    static void location(DynamicPropertyRegistry properties) {
        properties.add("ontop.world.proximity.tables[" + TABLE + "].x", () -> 0);
        properties.add("ontop.world.proximity.tables[" + TABLE + "].z", () -> 0);
    }

    @Test
    void 실제엔진_종료사건을_참가자_관전자_비구독자_소켓에_같이보낸다() throws Exception {
        try (var first = connect("naver"); var second = connect("ssafy");
                var viewer = connect("spectator"); var nearby = connect("ticket")) {
            positions.move("505", new WorldChannelRegistry.Position(1, 1, .8, 0, 0));
            positions.move(nearby.userId, new WorldChannelRegistry.Position(1, 20, .8, 0, 0));
            first.request("TABLE_JOIN", Map.of("tableId", TABLE));
            first.request("GAME_SELECT", Map.of("gameCode", "OMOK", "betAmountPerPlayer", 1));
            second.request("TABLE_JOIN", Map.of("tableId", TABLE));
            ready(first); ready(second);
            reservation.release.countDown();
            first.await(message -> message.path("type").asText().equals("GAME_START_STATE")
                    && message.at("/payload/phase").asText().equals("PLAYING"));
            first.state("RESTORED"); second.state("RESTORED");
            assertThat(viewer.request("GAME_WATCH", Map.of("gameId", "committed-test-game"))
                    .path("type").asText()).isEqualTo("GAME_STATE");
            clock.advanceSeconds(30);
            engine.tick();
            JsonNode event = reaction(first);
            assertThat(reaction(second).path("payload")).isEqualTo(event.path("payload"));
            assertThat(reaction(viewer).path("payload")).isEqualTo(event.path("payload"));
            assertThat(reaction(nearby).path("payload")).isEqualTo(event.path("payload"));
            assertThat(event.at("/payload/kind").asText()).isEqualTo("DEFEAT");
            assertThat(event.at("/payload/motion").asText()).isEqualTo("table-flip");
            assertThat(event.at("/payload/userId").asText()).isEqualTo("101");
            assertThat(event.at("/payload/occurredAt").asText()).isEqualTo(clock.instant().toString());
            assertThat(event.path("payload").toString()).doesNotContain("privateState", "hand", "balance");
            System.out.println("[WORLD_GAME_REACTION] " + event);
        }
    }

    private ScenarioClient connect(String login) throws Exception {
        // 42는 기존 인증 fixture의 별도 회원이다. 비구독 주변 사용자는 직접 티켓으로 연결한다.
        ScenarioClient peer = login.equals("ticket")
                ? new ScenarioClient(port, "42", ticket())
                : new ScenarioClient(port, login);
        peer.state("LOBBY");
        assertThat(peer.request("CHANNEL_JOIN", Map.of("channelId", "one")).path("type").asText())
                .isEqualTo("CHANNEL_STATE");
        return peer;
    }

    private String ticket() throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            var response = http.send(HttpRequest.newBuilder(URI.create(
                    "http://127.0.0.1:" + port + "/api/v1/auth/websocket-ticket"))
                    .header("Authorization", "Bearer " + jwt.issue(42, TestLoginSessions.ID))
                    .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            return mapper.readTree(response.body()).path("ticket").asText();
        }
    }

    private void ready(ScenarioClient peer) throws Exception {
        JsonNode state = peer.request("TABLE_JOIN", Map.of("tableId", TABLE)).path("payload");
        peer.request("READY_SET", Map.of("ready", true, "expectedVersion", state.path("version").longValue(),
                "betAmountPerPlayer", state.path("betAmountPerPlayer").longValue()));
    }

    private JsonNode reaction(ScenarioClient peer) throws Exception {
        return peer.await(message -> message.path("type").asText().equals("WORLD_GAME_REACTION"));
    }

}
