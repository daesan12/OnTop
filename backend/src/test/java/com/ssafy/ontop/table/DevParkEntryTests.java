package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.user.domain.LoginProvider;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doAnswer;

/** Reproduces the deployed dev profile without enabling local demo endpoints or authentication bypasses. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"server.address=127.0.0.1",
                "ontop.games.alkkagi.enabled=true",
                "ontop.auth.allowed-origins=https://dev.on-top.world",
                "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="})
@ActiveProfiles("dev")
class DevParkEntryTests {
    private static final long USER_ID = 42;
    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @Autowired ObjectMapper mapper;
    @MockitoBean ActiveMemberLookup members;
    @MockitoSpyBean GameEngineRouter engines;

    @BeforeEach
    void activeMember() {
        when(members.findActive(USER_ID, TestLoginSessions.ID)).thenReturn(Optional.of(
                new AuthenticatedUser(USER_ID, LoginProvider.SSAFY, TestLoginSessions.ID)));
    }

    @Test
    void authenticatedMemberCanListChannelsAndTablesAndEnterThePark() throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            var channels = get(http, "/api/v1/channels", true);
            assertThat(channels.statusCode()).isEqualTo(200);
            assertThat(channels.headers().firstValue("Cache-Control")).contains("no-store");
            assertThat(channels.headers().firstValue("Access-Control-Allow-Origin"))
                    .contains("https://dev.on-top.world");
            JsonNode items = mapper.readTree(channels.body()).path("items");
            assertThat(items).isNotEmpty();
            String channel = items.get(0).path("channelId").asText();
            var tables = get(http, "/api/v1/tables?channelId=" + channel, true);
            assertThat(tables.statusCode()).isEqualTo(200);
            assertThat(mapper.readTree(tables.body()).path("tables")).hasSize(16);

            var ticket = http.send(request("/api/v1/auth/websocket-ticket", true)
                    .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(ticket.statusCode()).isEqualTo(200);
            var recoveryStarted = new CountDownLatch(1);
            var allowRecovery = new CountDownLatch(1);
            // 느린 CI에서도 복구 조회와 채널 입장의 순서를 고정하고, 실제 권한 게이트는 유지한다.
            doAnswer(invocation -> {
                recoveryStarted.countDown();
                if (!allowRecovery.await(5, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("테스트 복구 조회 해제 누락");
                }
                return invocation.callRealMethod();
            }).when(engines).load(USER_ID);
            try (var socket = new ScenarioClient(port, Long.toString(USER_ID),
                    mapper.readTree(ticket.body()).path("ticket").asText(), "https://dev.on-top.world",
                    "127.0.0.1:" + port)) {
                try {
                    assertThat(recoveryStarted.await(5, TimeUnit.SECONDS)).isTrue();
                    var pending = socket.request("CHANNEL_JOIN", Map.of("channelId", channel));
                    assertThat(pending.path("type").asText()).isEqualTo("ERROR");
                    assertThat(pending.path("payload").path("code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
                } finally {
                    allowRecovery.countDown();
                }
                socket.state("LOBBY");
                var joined = socket.request("CHANNEL_JOIN", Map.of("channelId", channel));
                assertThat(joined.path("type").asText()).isEqualTo("CHANNEL_STATE");
                assertThat(joined.path("payload").path("channelId").asText()).isEqualTo(channel);
                var current = mapper.readTree(get(http, "/api/v1/channels", true).body()).path("items");
                assertThat(current.get(0).path("currentUsers").asInt()).isEqualTo(1);
            }
        }
    }

    @Test
    void anonymousAndForgedRequestsRemainUnauthorized() throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            for (String path : new String[]{"/api/v1/channels", "/api/v1/tables?channelId=channel-1"}) {
                assertThat(get(http, path, false).statusCode()).isEqualTo(401);
                var forged = http.send(request(path, false).header("Authorization", "Bearer invalid")
                        .GET().build(), HttpResponse.BodyHandlers.ofString());
                assertThat(forged.statusCode()).isEqualTo(401);
            }
        }
    }

    @Test
    void devQueriesKeepTheCommonCorsPolicy() throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            for (String path : new String[]{"/api/v1/channels", "/api/v1/tables?channelId=channel-1"}) {
                var preflight = http.send(request(path, false)
                        .header("Access-Control-Request-Method", "GET")
                        .header("Access-Control-Request-Headers", "Authorization")
                        .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build(),
                        HttpResponse.BodyHandlers.ofString());
                assertThat(preflight.statusCode()).isBetween(200, 299);
                assertThat(preflight.headers().firstValue("Access-Control-Allow-Origin"))
                        .contains("https://dev.on-top.world");
                var denied = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                        .header("Origin", "https://not-allowed.example").GET().build(),
                        HttpResponse.BodyHandlers.ofString());
                assertThat(denied.statusCode()).isEqualTo(403);
                assertThat(denied.headers().firstValue("Access-Control-Allow-Origin")).isEmpty();
            }
        }
    }

    @Test
    void localDemoPagesAreNotEnabledByTheDevProfile() throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            assertThat(get(http, "/dev/tables", false).statusCode()).isEqualTo(404);
            assertThat(get(http, "/dev/world-config", false).statusCode()).isEqualTo(404);
        }
    }

    private HttpResponse<String> get(HttpClient http, String path, boolean authenticated) throws Exception {
        return http.send(request(path, authenticated).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpRequest.Builder request(String path, boolean authenticated) {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .header("Origin", "https://dev.on-top.world");
        if (authenticated) request.header("Authorization", "Bearer "
                + jwt.issue(USER_ID, TestLoginSessions.ID));
        return request;
    }
}
