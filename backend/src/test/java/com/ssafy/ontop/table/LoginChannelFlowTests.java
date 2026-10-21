package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
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
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=검증 채널",
        "ontop.world.channels[0].capacity=1"
})
class LoginChannelFlowTests {

    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @MockitoBean WebSocketAccountLookup accounts;
    @MockitoBean(name = "oauthClock") Clock clock;
    private final ObjectMapper mapper = new ObjectMapper();
    private final Instant now = Instant.parse("2026-10-21T00:00:00Z");

    @BeforeEach
    void setup() {
        when(clock.instant()).thenReturn(now);
        when(accounts.findActive(101)).thenReturn(Optional.of(new VerifiedWebSocketUser(101,
                VerifiedWebSocketUser.Provider.NAVER)));
    }

    @Test
    void JWT조회_접속권발급_광장입장_만석조회_퇴장을한흐름으로검증한다() throws Exception {
        String token = jwt.issue(101);
        var before = send("GET", "/api/v1/channels", "Authorization", "Bearer " + token);
        assertThat(before.statusCode()).isEqualTo(200);
        assertThat(before.headers().firstValue("Cache-Control")).contains("no-store");
        var channel = mapper.readTree(before.body()).path("items").get(0);
        assertThat(channel.path("currentUsers").asInt()).isZero();
        assertThat(channel.path("joinable").asBoolean()).isTrue();
        assertThat(before.body()).doesNotContain("userId", token);
        var ticket = send("POST", "/api/v1/auth/websocket-ticket", "Authorization", "Bearer " + token);
        assertThat(ticket.statusCode()).isEqualTo(200);
        try (var socket = new ScenarioClient(port, "101", mapper.readTree(ticket.body()).path("ticket").asText())) {
            socket.await(message -> message.path("type").asText().equals("CONNECTED"));
            socket.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            var occupied = mapper.readTree(send("GET", "/api/v1/channels", "Authorization", "Bearer " + token)
                    .body()).path("items").get(0);
            assertThat(occupied.path("currentUsers").asInt()).isEqualTo(1);
            assertThat(occupied.path("joinable").asBoolean()).isFalse();
            socket.request("CHANNEL_LEAVE", Map.of());
            var left = mapper.readTree(send("GET", "/api/v1/channels", "Authorization", "Bearer " + token)
                    .body()).path("items").get(0);
            assertThat(left.path("currentUsers").asInt()).isZero();
        }
    }

    @Test
    void 미인증_위조_온보딩_접속권_중복헤더로목록을조회할수없다() throws Exception {
        assertThat(send("GET", "/api/v1/channels?userId=101", "X-User-Id", "101").statusCode()).isEqualTo(401);
        for (String token : new String[]{"forged", "ob_test", "wst_test", jwt.issue(101) + "x"}) {
            var response = send("GET", "/api/v1/channels", "Authorization", "Bearer " + token);
            assertThat(response.statusCode()).isEqualTo(401);
            assertThat(mapper.readTree(response.body()).path("code").asText()).isEqualTo("UNAUTHENTICATED");
            assertThat(mapper.readTree(response.body()).path("details").isNull()).isTrue();
        }
        assertThat(send("GET", "/api/v1/channels", "Authorization", "Bearer " + jwt.issue(101),
                "Authorization", "Bearer " + jwt.issue(101)).statusCode()).isEqualTo(401);
    }

    @Test
    void 만료와탈퇴는401_계정조회장애는503이며내부오류를노출하지않는다() throws Exception {
        String token = jwt.issue(101);
        when(clock.instant()).thenReturn(now.plusSeconds(1800));
        assertThat(send("GET", "/api/v1/channels", "Authorization", "Bearer " + token).statusCode()).isEqualTo(401);
        when(clock.instant()).thenReturn(now);
        when(accounts.findActive(101)).thenReturn(Optional.empty());
        assertThat(send("GET", "/api/v1/channels", "Authorization", "Bearer " + token).statusCode()).isEqualTo(401);
        when(accounts.findActive(101)).thenThrow(new IllegalStateException("private-storage-detail"));
        var failure = send("GET", "/api/v1/channels", "Authorization", "Bearer " + token);
        assertThat(failure.statusCode()).isEqualTo(503);
        assertThat(failure.body()).doesNotContain("private-storage-detail", token);
    }

    @Test
    void 허용Origin_GET프리플라이트와오류CORS를지원하고다른출처는거절한다() throws Exception {
        var preflight = send("OPTIONS", "/api/v1/channels", "Origin", "http://localhost:8080",
                "Access-Control-Request-Method", "GET", "Access-Control-Request-Headers", "authorization");
        assertThat(preflight.statusCode()).isEqualTo(204);
        assertThat(preflight.headers().firstValue("Access-Control-Allow-Origin")).contains("http://localhost:8080");
        var unauthenticated = send("GET", "/api/v1/channels", "Origin", "http://localhost:8080");
        assertThat(unauthenticated.statusCode()).isEqualTo(401);
        assertThat(unauthenticated.headers().firstValue("Access-Control-Allow-Origin")).contains("http://localhost:8080");
        assertThat(send("GET", "/api/v1/channels", "Origin", "https://untrusted.invalid",
                "Authorization", "Bearer " + jwt.issue(101)).statusCode()).isEqualTo(403);
        assertThat(send("OPTIONS", "/api/v1/channels", "Origin", "http://localhost:8080",
                "Access-Control-Request-Method", "POST").statusCode()).isEqualTo(403);
        assertThat(send("OPTIONS", "/api/v1/channels", "Origin", "http://localhost:8080",
                "Access-Control-Request-Method", "GET", "Access-Control-Request-Headers", "X-User-Id")
                .statusCode()).isEqualTo(403);
        assertThat(send("GET", "/api/v1/channels", "Origin", "http://localhost:8080",
                "Authorization", "Bearer " + jwt.issue(101)).statusCode()).isEqualTo(200);
    }

    private HttpResponse<String> send(String method, String path, String... headers) throws Exception {
        try (var client = HttpClient.newHttpClient()) {
            return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                    .headers(headers).method(method, HttpRequest.BodyPublishers.noBody()).build(),
                    HttpResponse.BodyHandlers.ofString());
        }
    }
}
