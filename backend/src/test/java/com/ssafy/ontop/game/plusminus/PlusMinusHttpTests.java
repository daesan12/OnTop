package com.ssafy.ontop.game.plusminus;

import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.game.plusminus.dto.PlusMinusStateResponse;
import com.ssafy.ontop.game.plusminus.service.PlusMinusException;
import com.ssafy.ontop.game.plusminus.service.PlusMinusService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.List;
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
class PlusMinusHttpTests {
    private static final PlusMinusStateResponse STATE = new PlusMinusStateResponse(
            Instant.parse("2026-11-03T03:00:00Z"), 190, 1,
            new PlusMinusStateResponse.Rules(30, 10, List.of(7, 0), List.of("+", "-"), List.of(-1, 5), 10, 7, 500),
            new PlusMinusStateResponse.Round("7", 0, 0, 1, 7, "+", 5, 12, "PAID", 120,
                    Instant.parse("2026-11-03T03:00:00Z")));

    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @MockitoBean private WebSocketAccountLookup accounts;
    @MockitoBean private PlusMinusService service;
    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void 인증을_준비한다() {
        when(accounts.findActive(101, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(
                101, VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
        when(service.status(101)).thenReturn(STATE);
        when(service.start(101, "round-1")).thenReturn(STATE);
    }

    @Test
    void 미인증_상태_조회는_거절한다() throws Exception {
        var response = http.send(요청("/status", null).GET().build(), HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(401);
        verifyNoInteractions(service);
    }

    @Test
    void 본인의_상태를_저장하지_않는_응답으로_돌려준다() throws Exception {
        var response = http.send(요청("/status", 토큰()).GET().build(), HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("\"availableBalance\":190", "\"dailyPlays\":10", "\"outcome\":\"PAID\"");
        assertThat(response.headers().firstValue("Cache-Control")).hasValue("no-store");
    }

    @Test
    void START는_본문_없이_중복_방지_키만_서비스에_전달한다() throws Exception {
        var request = 요청("/rounds", 토큰()).header("Idempotency-Key", "round-1")
                .POST(HttpRequest.BodyPublishers.noBody()).build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(response.body()).contains("\"payout\":120");
        verify(service).start(101, "round-1");
    }

    @Test
    void 잘못되거나_없는_중복_방지_키는_서비스를_호출하지_않는다() throws Exception {
        var invalid = 요청("/rounds", 토큰()).header("Idempotency-Key", "invalid:key")
                .POST(HttpRequest.BodyPublishers.noBody()).build();
        var missing = 요청("/rounds", 토큰()).POST(HttpRequest.BodyPublishers.noBody()).build();

        assertThat(http.send(invalid, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(400);
        assertThat(http.send(missing, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(400);
        verifyNoInteractions(service);
    }

    @Test
    void 서비스의_업무_오류는_코드와_문구로_돌려준다() throws Exception {
        when(service.start(101, "round-2"))
                .thenThrow(new PlusMinusException(409, "PLUS_MINUS_DAILY_LIMIT", "오늘 10판을 모두 했어요."));
        var request = 요청("/rounds", 토큰()).header("Idempotency-Key", "round-2")
                .POST(HttpRequest.BodyPublishers.noBody()).build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(response.body()).contains("PLUS_MINUS_DAILY_LIMIT");
    }

    @Test
    void 허용_출처의_START_사전요청을_지원한다() throws Exception {
        var request = 요청("/rounds", null)
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization,idempotency-key")
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.headers().firstValue("Access-Control-Allow-Headers").orElseThrow())
                .containsIgnoringCase("idempotency-key");
        verifyNoInteractions(service);
    }

    private String 토큰() {
        return jwt.issue(101, TestLoginSessions.ID);
    }

    private HttpRequest.Builder 요청(String path, String token) {
        var request = HttpRequest.newBuilder(URI.create(
                "http://127.0.0.1:" + port + "/api/v1/minigames/plus-minus" + path))
                .header("Origin", "http://localhost:8080");
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return request;
    }
}
