package com.ssafy.ontop.game.skewer;

import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.game.skewer.dto.SkewerAdmissionResponse;
import com.ssafy.ontop.game.skewer.service.SkewerAdmissionService;
import java.io.ByteArrayInputStream;
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
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture.class)
class SkewerAdmissionHttpTests {
    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @MockitoBean private WebSocketAccountLookup accounts;
    @MockitoBean private SkewerAdmissionService service;
    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void 인증과_영수증을_준비한다() {
        when(accounts.findActive(101, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(
                101, VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
        when(service.start(101, "round-1")).thenReturn(new SkewerAdmissionResponse("skewer-17", "skewer", 10, 90));
    }

    @Test
    void 미인증_구매는_거절한다() throws Exception {
        assertThat(전송(null, "round-1").statusCode()).isEqualTo(401);
        verifyNoInteractions(service);
    }

    @Test
    void 서명된_JWT의_본인만_고정_이용료_영수증을_받는다() throws Exception {
        var response = 전송(jwt.issue(101, TestLoginSessions.ID), "round-1");

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(response.body()).contains("\"fee\":10", "\"availableBalance\":90", "skewer-17");
        assertThat(response.headers().firstValue("Cache-Control")).hasValue("no-store");
        verify(service).start(101, "round-1");
    }

    @Test
    void 잘못된_키는_구매_서비스를_호출하지_않는다() throws Exception {
        assertThat(전송(jwt.issue(101, TestLoginSessions.ID), "invalid:key").statusCode()).isEqualTo(400);
        verifyNoInteractions(service);
    }

    @Test
    void 중복_키_헤더는_거절한다() throws Exception {
        var request = HttpRequest.newBuilder(주소()).header("Origin", "http://localhost:8080")
                .header("Authorization", "Bearer " + jwt.issue(101, TestLoginSessions.ID))
                .header("Idempotency-Key", "one").header("Idempotency-Key", "two")
                .POST(HttpRequest.BodyPublishers.noBody()).build();

        assertThat(http.send(request, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(400);
        verifyNoInteractions(service);
    }

    @Test
    void 가격과_사용자를_본문으로_지정하는_요청을_거절한다() throws Exception {
        var request = HttpRequest.newBuilder(주소()).header("Origin", "http://localhost:8080")
                .header("Authorization", "Bearer " + jwt.issue(101, TestLoginSessions.ID))
                .header("Idempotency-Key", "round-1").header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"fee\":0,\"userId\":202}")).build();

        assertThat(http.send(request, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(400);
        verifyNoInteractions(service);
    }

    @Test
    void 프록시가_빈_본문을_chunked로_전달해도_정상_구매한다() throws Exception {
        var request = HttpRequest.newBuilder(주소()).version(HttpClient.Version.HTTP_1_1)
                .header("Origin", "http://localhost:8080")
                .header("Authorization", "Bearer " + jwt.issue(101, TestLoginSessions.ID))
                .header("Idempotency-Key", "round-1")
                .POST(HttpRequest.BodyPublishers.ofInputStream(() -> new ByteArrayInputStream(new byte[0]))).build();

        assertThat(http.send(request, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(201);
        verify(service).start(101, "round-1");
    }

    @Test
    void 허용_출처의_중복_방지_헤더_사전요청을_지원한다() throws Exception {
        var request = HttpRequest.newBuilder(주소()).header("Origin", "http://localhost:8080")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization,idempotency-key")
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.headers().firstValue("Access-Control-Allow-Headers").orElseThrow())
                .containsIgnoringCase("idempotency-key");
        verifyNoInteractions(service);
    }

    private HttpResponse<String> 전송(String token, String key) throws Exception {
        var request = HttpRequest.newBuilder(주소()).header("Origin", "http://localhost:8080")
                .header("Idempotency-Key", key);
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return http.send(request.POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
    }

    private URI 주소() {
        return URI.create("http://127.0.0.1:" + port + "/api/v1/minigames/skewer/admissions");
    }
}
