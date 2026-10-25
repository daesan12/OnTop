package com.ssafy.ontop.shop;

import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.when;

/** DB 미활성 dev에서도 404 대신 인증/설정 오류를 반환한다. 회원 조회만 대역이다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=dev", "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(MemberAuthenticationFixture.class)
class ShopDevHttpTests {
    @Autowired AccessJwtService jwt;
    @MockitoBean WebSocketAccountLookup accounts;
    @LocalServerPort int port;
    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void account() {
        when(accounts.findActive(101, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(
                101, VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
    }

    @Test
    void 네경로의_회원인증과_미설정오류를_유지한다() throws Exception {
        String[][] requests = {{"GET", "/api/v1/shop/items", ""},
                {"GET", "/api/v1/users/me/items", ""},
                {"POST", "/api/v1/shop/purchases", "{\"itemId\":1,\"quantity\":1}"},
                {"PATCH", "/api/v1/users/me/equipment", "{\"userItemId\":1}"}};
        for (var request : requests) {
            assertThat(send(request, null).statusCode()).isEqualTo(401);
            assertThat(send(request, "forged").statusCode()).isEqualTo(401);
            var disabled = send(request, jwt.issue(101, TestLoginSessions.ID));
            assertThat(disabled.statusCode()).isEqualTo(503);
            assertThat(disabled.body()).contains("SHOP_NOT_CONFIGURED");
            assertThat(disabled.headers().firstValue("Access-Control-Allow-Origin"))
                    .contains("https://dev.on-top.world");
        }
    }

    @Test
    void 구매와장착_사전요청만_허용된출처와헤더로_통과한다() throws Exception {
        assertThat(preflight("/api/v1/shop/purchases", "https://dev.on-top.world", "POST",
                "authorization,content-type,idempotency-key").statusCode()).isEqualTo(204);
        assertThat(preflight("/api/v1/users/me/equipment", "https://dev.on-top.world", "PATCH",
                "authorization,content-type").statusCode()).isEqualTo(204);
        assertThat(preflight("/api/v1/shop/purchases", "https://evil.example", "POST",
                "authorization").statusCode()).isEqualTo(403);
        assertThat(preflight("/api/v1/shop/purchases", "https://dev.on-top.world", "POST",
                "x-forged").statusCode()).isEqualTo(403);
        assertThat(preflight("/api/v1/shop/purchases", "https://dev.on-top.world", "DELETE",
                "authorization").statusCode()).isEqualTo(403);
    }

    private HttpResponse<String> send(String[] request, String token) throws Exception {
        var builder = HttpRequest.newBuilder(uri(request[1])).header("Origin", "https://dev.on-top.world")
                .header("Content-Type", "application/json").header("Idempotency-Key", "dev-request");
        if (token != null) {
            builder.header("Authorization", "Bearer " + token);
        }
        return http.send(builder.method(request[0], HttpRequest.BodyPublishers.ofString(request[2])).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private HttpResponse<String> preflight(String path, String origin, String method, String headers)
            throws Exception {
        return http.send(HttpRequest.newBuilder(uri(path)).header("Origin", origin)
                .header("Access-Control-Request-Method", method).header("Access-Control-Request-Headers", headers)
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }
}
