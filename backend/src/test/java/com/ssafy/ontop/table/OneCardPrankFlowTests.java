package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/** JWT/소켓/실제 원카드 엔진 검증. 회원 조회·판돈 예약/정산만 테스트 대역이다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "ontop.game-start.enabled=true",
        "ontop.games.onecard.enabled=true", "ontop.games.onecard.pranks-enabled=true",
        "ontop.games.onecard.defense-enabled=true", "server.address=127.0.0.1",
        "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=원카드검증",
        "ontop.world.channels[0].capacity=10",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import({CommittedStartFlowTests.Fixture.class, OmokFlowTests.Fixture.class,
        MemberAuthenticationFixture.class, FrozenWorldFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class OneCardPrankFlowTests {
    private static final String GAME = "committed-test-game";
    private static final String TABLE = "table-" + UUID.nameUUIDFromBytes("one\0table-1".getBytes(StandardCharsets.UTF_8));
    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @Autowired private ObjectMapper mapper;
    @Autowired private OmokFlowTests.TestClock clock;
    @Autowired private WorldChannelRegistry positions;
    @Autowired private CommittedStartFlowTests.ReservationDouble reservation;
    @MockitoBean private WebSocketAccountLookup accounts;
    @MockitoBean(name = "oauthClock") private Clock oauthClock;
    private final List<ScenarioClient> clients = new ArrayList<>();

    @DynamicPropertySource static void location(DynamicPropertyRegistry registry) {
        registry.add("ontop.world.proximity.tables[" + TABLE + "].x", () -> 0);
        registry.add("ontop.world.proximity.tables[" + TABLE + "].z", () -> 0);
    }
    @BeforeEach void members() {
        when(oauthClock.instant()).thenAnswer(call -> clock.instant());
        for (long user : List.of(101L, 202L, 505L, 606L, 707L)) {
            when(accounts.findActive(user, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(
                    user, VerifiedWebSocketUser.Provider.SSAFY, TestLoginSessions.ID)));
        }
    }
    @org.junit.jupiter.api.AfterEach void close() throws Exception {
        for (var client : clients) { client.close(); }
    }

    @Test void 실제관전구독에서_방어_뒤집기_복구_중복_정보격리를_연속확인한다() throws Exception {
        ScenarioClient first = connect(101), second = connect(202), actor = connect(505), other = connect(606), outsider = connect(707);
        start(first, second);
        JsonNode before = first.request("GAME_STATE_CHECK", Map.of("gameId", GAME)).path("payload");
        String targetId = before.at("/publicState/turnUserId").asText();
        ScenarioClient target = targetId.equals("101") ? first : second;
        ScenarioClient wrongPlayer = target == first ? second : first;
        long turn = before.at("/publicState/turnCount").asLong();
        watch(actor); watch(other);
        var request = Map.of("gameId", GAME, "eventId", UUID.randomUUID().toString(), "targetUserId", targetId, "turnCount", turn);
        assertThat(outsider.request("ONECARD_PRANK_REACH_SEND", request).at("/payload/code").asText())
                .isEqualTo("ONECARD_PRANK_ACCESS_DENIED");
        assertThat(actor.request("ONECARD_HAND_FLIP_SEND", request).at("/payload/code").asText())
                .isEqualTo("ONECARD_DEFENSE_REQUIRED");
        JsonNode reached = actor.request("ONECARD_PRANK_REACH_SEND", request);
        assertThat(reached.path("type").asText()).as(reached.toString()).isEqualTo("ONECARD_PRANK_REACH_STARTED");
        assertThat(target.await(m -> m.path("type").asText().equals("ONECARD_PRANK_REACH_STARTED")).path("payload"))
                .isEqualTo(reached.path("payload"));
        String attempt = reached.at("/payload/attemptId").asText();
        var hit = Map.of("gameId", GAME, "eventId", UUID.randomUUID().toString(), "attemptId", attempt);
        assertThat(wrongPlayer.request("ONECARD_PRANK_HIT_SEND", hit).at("/payload/code").asText())
                .isEqualTo("ONECARD_PRANK_TOO_LATE");
        JsonNode blocked = target.request("ONECARD_PRANK_HIT_SEND", hit);
        assertThat(blocked.path("type").asText()).isEqualTo("ONECARD_PRANK_BLOCKED");
        assertThat(target.request("ONECARD_PRANK_HIT_SEND", hit).at("/payload/blockedUntil"))
                .isEqualTo(blocked.at("/payload/blockedUntil"));
        actor.await(m -> m.path("type").asText().equals("ONECARD_PRANK_BLOCKED"));
        actor.assertNoMessage(m -> m.path("type").asText().equals("ONECARD_HAND_FLIPPED"));

        JsonNode secondReach = other.request("ONECARD_PRANK_REACH_SEND", Map.of("gameId", GAME,
                "eventId", UUID.randomUUID().toString(), "targetUserId", targetId, "turnCount", turn));
        assertThat(secondReach.path("type").asText()).isEqualTo("ONECARD_PRANK_REACH_STARTED");
        target.await(m -> m.path("type").asText().equals("ONECARD_PRANK_REACH_STARTED"));
        clock.advanceSeconds(2);
        JsonNode flipped = target.await(m -> m.path("type").asText().equals("ONECARD_HAND_FLIPPED"));
        assertThat(flipped.path("payload").has("hand")).isFalse();
        JsonNode restored = target.request("ONECARD_HAND_RESTORE_SEND", Map.of("gameId", GAME,
                "eventId", UUID.randomUUID().toString(), "effectId", flipped.at("/payload/eventId").asText()));
        assertThat(restored.path("type").asText()).isEqualTo("ONECARD_HAND_RESTORED");
        JsonNode after = first.request("GAME_STATE_CHECK", Map.of("gameId", GAME)).path("payload");
        assertThat(after.path("version")).isEqualTo(before.path("version"));
        assertThat(after.path("publicState")).isEqualTo(before.path("publicState"));
        assertThat(after.path("privateState")).isEqualTo(before.path("privateState"));
        outsider.assertNoMessage(m -> m.path("type").asText().startsWith("ONECARD_"));
        wrongPlayer.assertNoMessage(m -> m.path("type").asText().startsWith("ONECARD_PRANK_"));
        Files.createDirectories(Path.of("build/reports"));
        Files.writeString(Path.of("build/reports/onecard-prank-wire.json"), mapper.writerWithDefaultPrettyPrinter()
                .writeValueAsString(Map.of("gameId", GAME, "targetUserId", targetId, "actorUserId", "505",
                        "turnCount", turn, "reach", reached, "blocked", blocked, "secondReach", secondReach,
                        "flipped", flipped, "restored", restored,
                        "runId", System.getenv().getOrDefault("ONTOP_GAME_ADDITIONS_RUN_ID", "standalone"))));
    }

    @Test void 관전해제와_턴변경은_진행중손을취소하며_해제후권한을거절한다() throws Exception {
        var first = connect(101); var second = connect(202); var actor = connect(505);
        start(first, second); watch(actor);
        var state = first.request("GAME_STATE_CHECK", Map.of("gameId", GAME)).path("payload");
        String targetId = state.at("/publicState/turnUserId").asText();
        var target = targetId.equals("101") ? first : second;
        var request = Map.of("gameId", GAME, "eventId", UUID.randomUUID().toString(), "targetUserId", targetId,
                "turnCount", state.at("/publicState/turnCount").asLong());
        actor.request("ONECARD_PRANK_REACH_SEND", request);
        target.await(m -> m.path("type").asText().equals("ONECARD_PRANK_REACH_STARTED"));
        actor.request("GAME_UNWATCH", Map.of());
        assertThat(target.await(m -> m.path("type").asText().equals("ONECARD_PRANK_REACH_RESOLVED"))
                .at("/payload/outcome").asText()).isEqualTo("CANCELLED");
        assertThat(actor.request("ONECARD_PRANK_REACH_SEND", request).at("/payload/code").asText())
                .isEqualTo("ONECARD_PRANK_ACCESS_DENIED");
        clock.advanceSeconds(2);
        target.assertNoMessage(m -> m.path("type").asText().equals("ONECARD_HAND_FLIPPED"));
    }

    private void start(ScenarioClient first, ScenarioClient second) throws Exception {
        first.request("TABLE_JOIN", Map.of("tableId", TABLE));
        second.request("TABLE_JOIN", Map.of("tableId", TABLE));
        first.request("GAME_SELECT", Map.of("gameCode", "ONE_CARD", "betAmountPerPlayer", 1));
        first.request("READY_SET", Map.of("ready", true));
        reservation.release.countDown();
        second.request("READY_SET", Map.of("ready", true));
        first.state("RESTORED"); second.state("RESTORED");
        first.request("GAME_STATE_CHECK", Map.of("gameId", GAME));
        second.request("GAME_STATE_CHECK", Map.of("gameId", GAME));
    }
    private void watch(ScenarioClient actor) throws Exception {
        assertThat(actor.request("GAME_WATCH", Map.of("gameId", GAME)).at("/payload/role").asText()).isEqualTo("SPECTATOR");
    }
    private ScenarioClient connect(long user) throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            var response = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/auth/websocket-ticket"))
                    .header("Authorization", "Bearer " + jwt.issue(user, TestLoginSessions.ID))
                    .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            var client = new ScenarioClient(port, Long.toString(user), mapper.readTree(response.body()).path("ticket").asText());
            clients.add(client); client.state("LOBBY");
            client.request("CHANNEL_JOIN", Map.of("channelId", "one"));
            positions.move(client.userId, new WorldChannelRegistry.Position(1, 0, .8, 0, 0));
            return client;
        }
    }
}
