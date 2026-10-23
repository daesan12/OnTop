package com.ssafy.ontop.minigame;

import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.minigame.dto.MinigameStatusResponse;
import com.ssafy.ontop.minigame.service.MinigameService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture.class)
class MinigameHttpTests {
    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @MockitoBean WebSocketAccountLookup accounts;
    @MockitoBean MinigameService minigames;
    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void account() {
        when(accounts.findActive(101, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(101,
                VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
    }

    @Test
    void 네API는미인증요청을거절한다() throws Exception {
        for (String path : new String[]{"", "/901", "/901/complete", "/901/abandon"}) {
            assertThat(request(path, path.equals("/901") ? null : "{}", null, null).statusCode()).isEqualTo(401);
        }
        verifyNoInteractions(minigames);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"score\":3}", "{\"rewardAmount\":2}", "{\"userId\":202}", "[]", "null", "{"})
    void 완료와포기는점수와사용자위조필드를거절한다(String body) throws Exception {
        for (String suffix : new String[]{"complete", "abandon"}) {
            assertThat(request("/901/" + suffix, body, jwt.issue(101, TestLoginSessions.ID), null).statusCode())
                    .isEqualTo(400);
        }
        verifyNoInteractions(minigames);
    }

    @Test
    void 시작은종류와멱등키를검사한다() throws Exception {
        String token = jwt.issue(101, TestLoginSessions.ID);
        assertThat(request("", "{\"minigameType\":\"BUNGEOPPANG\"}", token, null).statusCode()).isEqualTo(400);
        assertThat(request("", "{\"minigameType\":\"OTHER\"}", token, "one").statusCode()).isEqualTo(400);
        assertThat(request("", "{\"minigameType\":\"BUNGEOPPANG\",\"userId\":202}", token, "one").statusCode())
                .isEqualTo(400);
        verifyNoInteractions(minigames);
    }

    @Test
    void 상태조회는JWT본인ID를사용하고캐시하지않는다() throws Exception {
        when(minigames.load(101, 901)).thenReturn(new MinigameStatusResponse("901", "PLAYING", null, 0,
                Instant.parse("2026-10-23T00:00:00Z"), null));
        var result = request("/901", null, jwt.issue(101, TestLoginSessions.ID), null);
        assertThat(result.statusCode()).isEqualTo(200);
        assertThat(result.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store");
        assertThat(result.body()).contains("\"score\":null", "\"endedAt\":null");
    }

    @Test
    void 시작멱등키프리플라이트는허용출처와헤더만받는다() throws Exception {
        var allowed = preflight("http://localhost:8080", "authorization,content-type,idempotency-key");
        assertThat(allowed.statusCode()).isEqualTo(204);
        assertThat(allowed.headers().firstValue("Access-Control-Allow-Headers").orElseThrow().toLowerCase())
                .contains("idempotency-key");
        assertThat(preflight("https://evil.example", "authorization").statusCode()).isEqualTo(403);
        assertThat(preflight("http://localhost:8080", "x-forged-header").statusCode()).isEqualTo(403);
        verifyNoInteractions(minigames);
    }

    private HttpResponse<String> preflight(String origin, String headers) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/minigames/sessions"))
                .header("Origin", origin).header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", headers).method("OPTIONS", HttpRequest.BodyPublishers.noBody());
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> request(String suffix, String body, String token, String key) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/minigames/sessions" + suffix));
        if (token != null) { builder.header("Authorization", "Bearer " + token); }
        if (key != null) { builder.header("Idempotency-Key", key); }
        if (body != null) { builder.header("Content-Type", "application/json"); }
        builder.method(body == null ? "GET" : "POST", body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body));
        return http.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
