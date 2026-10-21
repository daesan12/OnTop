package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s"
})
@Import(FullFlowTests.Fixture.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class LoginWebSocketFlowTests {

    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @Autowired FullFlowTests.Engine engine;
    @Autowired FullFlowTests.TestClock clock;
    @MockitoBean WebSocketAccountLookup accounts;
    @MockitoBean(name = "oauthClock") Clock oauthClock;
    private final ObjectMapper mapper = new ObjectMapper();

    @BeforeEach
    void accounts() {
        when(oauthClock.instant()).thenAnswer(invocation -> clock.instant());
        when(accounts.findActive(101)).thenReturn(Optional.of(new VerifiedWebSocketUser(101,
                VerifiedWebSocketUser.Provider.NAVER)));
        when(accounts.findActive(202)).thenReturn(Optional.of(new VerifiedWebSocketUser(202,
                VerifiedWebSocketUser.Provider.SSAFY)));
    }

    @ParameterizedTest
    @ValueSource(ints = {29, 30})
    void 실제JWT와_HTTP접속권으로_착석준비_중복차단_끊김복귀를검증한다(int seconds) throws Exception {
        try (ScenarioClient first = connect(101); ScenarioClient second = connect(202)) {
            assertThat(first.await(m -> m.path("type").asText().equals("CONNECTED"))
                    .path("payload").path("userId").asText()).isEqualTo("101");
            first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            second.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            first.request("GAME_SELECT", Map.of("gameCode", "DICE", "targetScore", 4000));
            first.request("READY_SET", Map.of("ready", true));
            JsonNode ready = second.request("READY_SET", Map.of("ready", true)).path("payload");
            assertThat(ready.path("allReady").asBoolean()).isTrue();
            engine.activate(ready);
            first.request("GAME_RECONNECT_CHECK", Map.of());
            second.request("GAME_RECONNECT_CHECK", Map.of());
            first.state("RESTORED");
            second.state("RESTORED");
            try (ScenarioClient duplicate = connect(101)) {
                assertThat(duplicate.awaitClose()).isEqualTo(1008);
            }
            engine.loads.clear();
            first.stopPong();
            assertThat(first.awaitClose()).isEqualTo(1001);
            assertThat(engine.loads.poll(5, TimeUnit.SECONDS)).isEqualTo(101L);
            clock.now = clock.now.plusSeconds(seconds);
            engine.version = 8;
            try (ScenarioClient returned = connect(101)) {
                returned.await(m -> m.path("type").asText().equals("CONNECTED"));
                JsonNode state = returned.state(seconds == 29 ? "RESTORED" : "EXPIRED");
                if (seconds == 29) {
                    assertThat(state.path("gameId").asText()).isEqualTo("scenario-game-1");
                    assertThat(state.path("version").asLong()).isEqualTo(8);
                    assertThat(state.path("state").path("viewerId").asLong()).isEqualTo(101);
                    assertThat(state.path("state").path("turnDeadline").asText()).isEqualTo(engine.turnDeadline);
                } else {
                    assertThat(state.path("state").isNull()).isTrue();
                    assertThat(engine.expirations.poll(5, TimeUnit.SECONDS)).isNotNull();
                }
            }
        }
        System.out.println("[PASS] 실제 AccessJwtService 서명/검증 → HTTP 접속권 → RawWS → 착석/준비/중복차단/heartbeat/"
                + seconds + "초 재접속. 계정 조회·경기 생성은 대역, 외부OAuth/MySQL/정산 아님.");
    }

    @Test
    void 위조토큰과_온보딩토큰은_접속권을발급하지않는다() throws Exception {
        for (String token : new String[]{"forged", "ob_test", jwt.issue(101) + "x"}) {
            assertThat(issue(token).statusCode()).isEqualTo(401);
        }
        when(accounts.findActive(101)).thenReturn(Optional.empty());
        assertThat(issue(jwt.issue(101)).statusCode()).isEqualTo(401);
    }

    @Test
    void 실제Upgrade에서_재사용과_중복쿼리와_출처변경을차단한다() throws Exception {
        String ticket = mapper.readTree(issue(jwt.issue(101)).body()).path("ticket").asText();
        try (var connected = new ScenarioClient(port, "101", ticket)) {
            connected.await(m -> m.path("type").asText().equals("CONNECTED"));
            assertThatThrownBy(() -> new ScenarioClient(port, "101", ticket))
                    .isInstanceOf(AssertionError.class).hasMessageContaining("401");
        }
        String duplicate = mapper.readTree(issue(jwt.issue(101)).body()).path("ticket").asText();
        assertThatThrownBy(() -> new ScenarioClient(port, "101", duplicate + "&ticket=" + duplicate))
                .isInstanceOf(AssertionError.class).hasMessageContaining("401");
        try (HttpClient client = HttpClient.newHttpClient()) {
            var badOrigin = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/auth/websocket-ticket")).header("Authorization", "Bearer " + jwt.issue(101))
                    .header("Origin", "https://untrusted.invalid").POST(HttpRequest.BodyPublishers.noBody()).build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(badOrigin.statusCode()).isEqualTo(403);
            var preflight = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/auth/websocket-ticket")).header("Origin", "http://localhost:8080")
                    .header("Access-Control-Request-Method", "POST")
                    .header("Access-Control-Request-Headers", "Authorization")
                    .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(preflight.statusCode()).isEqualTo(204);
            assertThat(preflight.headers().firstValue("Access-Control-Allow-Headers")).contains("Authorization");
            var browserTicket = client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/auth/websocket-ticket")).header("Authorization", "Bearer " + jwt.issue(101))
                    .header("Origin", "http://localhost:8080").POST(HttpRequest.BodyPublishers.noBody()).build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(browserTicket.statusCode()).isEqualTo(200);
            // 테스트 TCP 포트와 외부 Host/Origin을 분리해 동일 출처 프록시 조건을 재현한다.
            String originTicket = mapper.readTree(browserTicket.body()).path("ticket").asText();
            try (var socket = new ScenarioClient(port, "101", originTicket, "http://localhost:8080")) {
                assertThat(socket.await(m -> m.path("type").asText().equals("CONNECTED"))
                        .path("payload").path("userId").asText()).isEqualTo("101");
            }
            String mismatched = mapper.readTree(client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"
                    + port + "/api/v1/auth/websocket-ticket")).header("Authorization", "Bearer " + jwt.issue(101))
                    .header("Origin", "http://localhost:8080").POST(HttpRequest.BodyPublishers.noBody()).build(),
                    HttpResponse.BodyHandlers.ofString()).body()).path("ticket").asText();
            assertThatThrownBy(() -> new ScenarioClient(port, "101", mismatched))
                    .isInstanceOf(AssertionError.class).hasMessageContaining("401");
        }
    }

    private ScenarioClient connect(long userId) throws Exception {
        var response = issue(jwt.issue(userId));
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        String ticket = mapper.readTree(response.body()).path("ticket").asText();
        return new ScenarioClient(port, Long.toString(userId), ticket);
    }

    private HttpResponse<String> issue(String token) throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/auth/websocket-ticket")).header("Authorization", "Bearer " + token)
                    .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
        }
    }
}
