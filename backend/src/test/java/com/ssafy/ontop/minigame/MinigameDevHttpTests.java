package com.ssafy.ontop.minigame;

import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.minigame.dto.BungeoppangStatusResponse;
import com.ssafy.ontop.minigame.service.MinigameService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=dev", "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture.class)
class MinigameDevHttpTests {
    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @MockitoBean WebSocketAccountLookup accounts;
    @MockitoBean MinigameService minigames;
    private final HttpClient http = HttpClient.newHttpClient();

    @Test
    void dev의_브라우저_조회도_회원인증을_거친다() throws Exception {
        when(accounts.findActive(101, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(
                101, VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
        when(minigames.status(101)).thenReturn(new BungeoppangStatusResponse(0, 100, true, List.of(), "v2"));
        var response = http.send(HttpRequest.newBuilder(uri("/api/v1/minigames/sessions"))
                .header("Origin", "https://dev.on-top.world")
                .header("Authorization", "Bearer " + jwt.issue(101, TestLoginSessions.ID)).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("\"dailyCap\":100");
        assertThat(response.headers().firstValue("Access-Control-Allow-Origin")).contains("https://dev.on-top.world");
        var denied = http.send(HttpRequest.newBuilder(uri("/api/v1/minigames/sessions")).GET().build(),
                HttpResponse.BodyHandlers.ofString());
        assertThat(denied.statusCode()).isEqualTo(401);
    }

    @Test
    void 미니게임만_멱등헤더를_허용하고_다른출처와_추가헤더는_차단한다() throws Exception {
        var allowed = preflight("/api/v1/minigames/sessions", "https://dev.on-top.world", "POST",
                "authorization,content-type,idempotency-key");
        assertThat(allowed.statusCode()).isEqualTo(204);
        assertThat(allowed.headers().firstValue("Access-Control-Allow-Headers").orElseThrow().toLowerCase())
                .contains("idempotency-key");
        assertThat(preflight("/api/v1/minigames/sessions", "https://evil.example", "POST", "authorization")
                .statusCode()).isEqualTo(403);
        assertThat(preflight("/api/v1/minigames/sessions", "https://dev.on-top.world", "POST", "x-forged")
                .statusCode()).isEqualTo(403);
        assertThat(preflight("/api/v1/minigames/sessions", "https://dev.on-top.world", "DELETE", "authorization")
                .statusCode()).isEqualTo(403);
        assertThat(preflight("/api/v1/users/me", "https://dev.on-top.world", "POST", "idempotency-key")
                .statusCode()).isEqualTo(403);
    }

    private HttpResponse<String> preflight(String path, String origin, String method, String headers) throws Exception {
        return http.send(HttpRequest.newBuilder(uri(path)).header("Origin", origin)
                .header("Access-Control-Request-Method", method).header("Access-Control-Request-Headers", headers)
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) { return URI.create("http://127.0.0.1:" + port + path); }
}
