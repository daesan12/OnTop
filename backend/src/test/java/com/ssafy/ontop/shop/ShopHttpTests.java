package com.ssafy.ontop.shop;

import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class ShopHttpTests {
    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @MockitoBean WebSocketAccountLookup accounts;
    @MockitoBean ShopService shop;
    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void setup() {
        when(accounts.findActive(101)).thenReturn(Optional.of(new VerifiedWebSocketUser(101,
                VerifiedWebSocketUser.Provider.NAVER)));
        when(shop.catalog()).thenReturn(new ShopModels.ItemList(List.of()));
        when(shop.inventory(101)).thenReturn(new ShopModels.Inventory(List.of()));
    }

    @Test
    void 네경로는미인증을거절하고정상JWT만본인으로전달한다() throws Exception {
        for (String path : List.of("/api/v1/shop/items", "/api/v1/users/me/items",
                "/api/v1/shop/purchases", "/api/v1/users/me/equipment")) {
            assertThat(send("GET", path, null, null).statusCode()).isEqualTo(401);
        }
        assertThat(send("GET", "/api/v1/users/me/items", null, jwt.issue(101)).statusCode()).isEqualTo(200);
        assertThat(send("GET", "/api/v1/shop/items", null, jwt.issue(101)).body()).isEqualTo("{\"items\":[]}");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "{\"itemId\":1,\"quantity\":0}", "{\"itemId\":1,\"quantity\":1.5}",
            "{\"itemId\":\"1\",\"quantity\":1}", "{\"itemId\":1,\"quantity\":2147483648}",
            "{\"itemId\":1,\"quantity\":1,\"price\":0}", "{\"itemId\":1,\"quantity\":1,\"userId\":202}",
            "{\"itemId\":1}", "[]", "{"
    })
    void 구매의금액사용자위조와잘못된수량을차단한다(String body) throws Exception {
        var response = send("POST", "/api/v1/shop/purchases", body, jwt.issue(101), "Idempotency-Key", "valid-key");
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("INVALID_REQUEST");
        verifyNoInteractions(shop);
    }

    @Test
    void 중복방지키는필수이고중복헤더와잘못된문자를거절한다() throws Exception {
        String body = "{\"itemId\":1,\"quantity\":1}";
        assertThat(send("POST", "/api/v1/shop/purchases", body, jwt.issue(101)).statusCode()).isEqualTo(400);
        assertThat(send("POST", "/api/v1/shop/purchases", body, jwt.issue(101),
                "Idempotency-Key", "one", "Idempotency-Key", "two").statusCode()).isEqualTo(400);
        assertThat(send("POST", "/api/v1/shop/purchases", body, jwt.issue(101),
                "Idempotency-Key", "key!").statusCode()).isEqualTo(400);
        verifyNoInteractions(shop);
    }

    @Test
    void 장착에사용자부위위조필드를추가하면거절한다() throws Exception {
        assertThat(send("PATCH", "/api/v1/users/me/equipment",
                "{\"userItemId\":1,\"slot\":\"TOP\"}", jwt.issue(101)).statusCode()).isEqualTo(400);
        verifyNoInteractions(shop);
    }

    @Test
    void 출처와Preflight및민감응답캐시를검사한다() throws Exception {
        var preflight = send("OPTIONS", "/api/v1/shop/purchases", null, null,
                "Origin", "http://localhost:8080", "Access-Control-Request-Method", "POST",
                "Access-Control-Request-Headers", "Authorization,Content-Type,Idempotency-Key");
        assertThat(preflight.statusCode()).isEqualTo(204);
        assertThat(preflight.headers().firstValue("Access-Control-Allow-Origin").orElseThrow())
                .isEqualTo("http://localhost:8080");
        var denied = send("GET", "/api/v1/shop/items", null, jwt.issue(101), "Origin", "https://attacker.example");
        assertThat(denied.statusCode()).isEqualTo(403);
        var okay = send("GET", "/api/v1/shop/items", null, jwt.issue(101));
        assertThat(okay.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store");
    }

    @Test
    void 위조만료수단중복인증과비활성계정을거절한다() throws Exception {
        for (String token : List.of("forged", "wst_fake", jwt.issue(101) + "x", jwt.issue(202))) {
            assertThat(send("GET", "/api/v1/shop/items", null, token).statusCode()).isEqualTo(401);
        }
        assertThat(send("GET", "/api/v1/shop/items", null, jwt.issue(101),
                "Authorization", "Bearer " + jwt.issue(101)).statusCode()).isEqualTo(401);
        verifyNoInteractions(shop);
    }

    private HttpResponse<String> send(String method, String path, String body, String token, String... headers)
            throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path));
        if (token != null) { request.header("Authorization", "Bearer " + token); }
        if (body != null) { request.header("Content-Type", "application/json"); }
        for (int i = 0; i < headers.length; i += 2) { request.header(headers[i], headers[i + 1]); }
        return http.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
}

