package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.websocket.heartbeat.interval=100ms", "ontop.websocket.heartbeat.timeout=800ms",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=광장 A",
        "ontop.world.channels[0].capacity=3",
        "ontop.world.channels[1].channel-id=channel-2", "ontop.world.channels[1].name=광장 B",
        "ontop.world.channels[1].capacity=3"
})
@org.springframework.context.annotation.Import(com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture.class)
class LoginTableFlowTests {
    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @MockitoBean WebSocketAccountLookup accounts;
    @MockitoBean(name = "oauthClock") Clock clock;
    private final ObjectMapper mapper = new ObjectMapper();
    private final Instant now = Instant.parse("2026-10-21T00:00:00Z");

    @BeforeEach
    void setup() {
        when(clock.instant()).thenReturn(now);
        for (long id : new long[]{101, 202}) {
            when(accounts.findActive(id, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(id,
                    VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
        }
    }

    @Test
    void 로그인조회부터_채널격리_착석준비_무응답정리까지_목록에반영한다() throws Exception {
        var before = list("channel-1");
        String tableId = before.get(0).path("tableId").asText();
        assertThat(before.size()).isEqualTo(2);
        assertThat(tableId).startsWith("table-");
        assertThat(list("channel-1")).isEqualTo(before); // 읽기로 좌석/버전이 변하지 않는다.
        assertThat(list("channel-2").get(0).path("tableId").asText()).isNotEqualTo(tableId);
        try (var first = connect(101); var second = connect(202)) {
            first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            second.request("CHANNEL_JOIN", Map.of("channelId", "channel-2"));
            assertThat(second.request("TABLE_JOIN", Map.of("tableId", tableId))
                    .path("payload").path("code").asText()).isEqualTo("TABLE_CHANNEL_MISMATCH");
            first.request("TABLE_JOIN", Map.of("tableId", tableId));
            first.request("GAME_SELECT", Map.of("betAmountPerPlayer", 1, "gameCode", "OMOK"));
            first.request("READY_SET", Map.of("ready", true));
            assertThat(list("channel-1").get(0).path("occupiedSeats").asInt()).isEqualTo(1);
            second.request("CHANNEL_LEAVE", Map.of());
            second.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            second.request("TABLE_JOIN", Map.of("tableId", tableId));
            assertThat(list("channel-1").get(0).path("readyCount").asInt()).isZero();
            first.request("READY_SET", Map.of("ready", true));
            second.request("READY_SET", Map.of("ready", true));
            var ready = list("channel-1").get(0);
            assertThat(ready.path("allReady").asBoolean()).isTrue();
            assertThat(ready.path("availableSeats").asInt()).isZero();
            assertThat(ready.path("joinable").asBoolean()).isFalse();
            assertThat(ready.path("status").asText()).isEqualTo("WAITING"); // 시작 옵션은 별도.
            assertThat(ready.path("gameCode").asText()).isEqualTo("OMOK");
            assertThat(list("channel-2").get(0).path("occupiedSeats").asInt()).isZero();
            second.stopPong();
            assertThat(second.awaitClose()).isEqualTo(1001);
            var left = list("channel-1").get(0);
            assertThat(left.path("occupiedSeats").asInt()).isEqualTo(1);
            assertThat(left.path("readyCount").asInt()).isZero();
            assertThat(left.path("joinable").asBoolean()).isTrue();
            first.request("TABLE_LEAVE", Map.of());
            assertThat(list("channel-1")).isEqualTo(before);
        }
    }

    @Test
    void 미인증과_위조_다른토큰_중복헤더는_공개목록도거절한다() throws Exception {
        assertError(send("GET", "/api/v1/tables?channelId=channel-1&userId=101", "X-User-Id", "101"),
                401, "UNAUTHENTICATED");
        for (String token : new String[]{"forged", "ob_test", "wst_test", jwt.issue(101, TestLoginSessions.ID) + "x"}) {
            assertError(send("GET", "/api/v1/tables?channelId=channel-1", "Authorization", "Bearer " + token),
                    401, "UNAUTHENTICATED");
        }
        assertError(send("GET", "/api/v1/tables?channelId=channel-1", "Authorization", "Bearer " + jwt.issue(101, TestLoginSessions.ID),
                "Authorization", "Bearer " + jwt.issue(101, TestLoginSessions.ID)), 401, "UNAUTHENTICATED");
    }

    @Test
    void 만료와비활성은401_계정장애는503이며_내부정보를노출하지않는다() throws Exception {
        String token = jwt.issue(101, TestLoginSessions.ID);
        when(clock.instant()).thenReturn(now.plusSeconds(1800));
        assertError(query(token, "channel-1"), 401, "UNAUTHENTICATED");
        when(clock.instant()).thenReturn(now);
        when(accounts.findActive(101, TestLoginSessions.ID)).thenReturn(Optional.empty());
        assertError(query(token, "channel-1"), 401, "UNAUTHENTICATED");
        when(accounts.findActive(101, TestLoginSessions.ID)).thenThrow(new IllegalStateException("private-account-storage"));
        var failure = query(token, "channel-1");
        assertError(failure, 503, "SERVICE_UNAVAILABLE");
        assertThat(failure.body()).doesNotContain("private-account-storage", token);
    }

    @Test
    void 인증후_채널오류와_CORS프리플라이트를_명세대로응답한다() throws Exception {
        String origin = "http://localhost:8080";
        var preflight = send("OPTIONS", "/api/v1/tables", "Origin", origin,
                "Access-Control-Request-Method", "GET", "Access-Control-Request-Headers", "authorization");
        assertThat(preflight.statusCode()).isEqualTo(204);
        assertThat(preflight.headers().firstValue("Access-Control-Allow-Headers")).contains("Authorization");
        assertThat(preflight.headers().firstValue("Cache-Control")).contains("no-store");
        var unauthenticated = send("GET", "/api/v1/tables", "Origin", origin);
        assertError(unauthenticated, 401, "UNAUTHENTICATED");
        assertThat(unauthenticated.headers().firstValue("Access-Control-Allow-Origin")).contains(origin);
        var missing = send("GET", "/api/v1/tables", "Origin", origin, "Authorization", "Bearer " + jwt.issue(101, TestLoginSessions.ID));
        assertError(missing, 400, "CHANNEL_REQUIRED");
        assertThat(missing.headers().firstValue("Access-Control-Allow-Origin")).contains(origin);
        assertError(query(jwt.issue(101, TestLoginSessions.ID), "missing"), 404, "CHANNEL_NOT_FOUND");
        assertError(send("GET", "/api/v1/tables?channelId=channel-1", "Origin", "https://untrusted.invalid",
                "Authorization", "Bearer " + jwt.issue(101, TestLoginSessions.ID)), 403, "FORBIDDEN");
        assertError(send("OPTIONS", "/api/v1/tables", "Origin", origin,
                "Access-Control-Request-Method", "POST"), 403, "FORBIDDEN");
    }

    private JsonNode list(String channel) throws Exception {
        var response = query(jwt.issue(101, TestLoginSessions.ID), channel);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.body()).doesNotContain("userId", "seats", "gameSessionId", "startAttemptId", "ticket");
        return mapper.readTree(response.body()).path("tables");
    }

    private void assertError(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(mapper.readTree(response.body()).path("code").asText()).isEqualTo(code);
        assertThat(mapper.readTree(response.body()).path("details").isNull()).isTrue();
    }

    private ScenarioClient connect(long id) throws Exception {
        var response = send("POST", "/api/v1/auth/websocket-ticket", "Authorization", "Bearer " + jwt.issue(id, TestLoginSessions.ID));
        assertThat(response.statusCode()).isEqualTo(200);
        var socket = new ScenarioClient(port, Long.toString(id), mapper.readTree(response.body()).path("ticket").asText());
        socket.await(message -> message.path("type").asText().equals("CONNECTED"));
        return socket;
    }

    private HttpResponse<String> query(String token, String channel) throws Exception {
        return send("GET", "/api/v1/tables?channelId=" + channel, "Authorization", "Bearer " + token);
    }

    private HttpResponse<String> send(String method, String path, String... headers) throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                    .method(method, HttpRequest.BodyPublishers.noBody());
            for (int i = 0; i < headers.length; i += 2) { request.header(headers[i], headers[i + 1]); }
            return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
        }
    }
}
