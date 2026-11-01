package com.ssafy.ontop.game.rpsroulette;

import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.game.rpsroulette.dto.RpsRouletteStateResponse;
import com.ssafy.ontop.game.rpsroulette.service.RpsRouletteException;
import com.ssafy.ontop.game.rpsroulette.service.RpsRouletteService;
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
class RpsRouletteHttpTests {
    private static final RpsRouletteStateResponse STATE = new RpsRouletteStateResponse(
            Instant.parse("2026-11-01T03:00:00Z"), 90, 1,
            new RpsRouletteStateResponse.Rules(List.of(10, 20, 30), 15, List.of(1.0, 1.5, 2.0), List.of(10, 1),
                    5000, 10000, 1500),
            null);

    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @MockitoBean private WebSocketAccountLookup accounts;
    @MockitoBean private RpsRouletteService service;
    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void 인증을_준비한다() {
        when(accounts.findActive(101, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(
                101, VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
        when(service.status(101)).thenReturn(STATE);
        when(service.start(101, "round-1", 20)).thenReturn(STATE);
        when(service.hand(101, 7, 3, "ROCK")).thenReturn(STATE);
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
        assertThat(response.body()).contains("\"availableBalance\":90", "\"playedToday\":1", "\"dailyPlays\":15");
        assertThat(response.headers().firstValue("Cache-Control")).hasValue("no-store");
    }

    @Test
    void START는_중복_방지_키와_참가비를_서비스에_전달한다() throws Exception {
        var request = 요청("/rounds", 토큰()).header("Idempotency-Key", "round-1")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"fee\":20}")).build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(201);
        verify(service).start(101, "round-1", 20);
    }

    @Test
    void 잘못된_중복_방지_키는_서비스를_호출하지_않는다() throws Exception {
        var request = 요청("/rounds", 토큰()).header("Idempotency-Key", "invalid:key")
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"fee\":20}")).build();

        assertThat(http.send(request, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(400);
        verifyNoInteractions(service);
    }

    @Test
    void 손_내기는_판_순번과_손을_전달한다() throws Exception {
        var request = 요청("/rounds/7/hands", 토큰()).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"seq\":3,\"hand\":\"ROCK\"}")).build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
        verify(service).hand(101, 7, 3, "ROCK");
    }

    @Test
    void 서비스의_업무_오류는_코드와_문구로_돌려준다() throws Exception {
        when(service.stop(101, 7, 4))
                .thenThrow(new RpsRouletteException(409, "RPS_INVALID_PHASE", "지금은 할 수 없는 행동이에요."));
        var request = 요청("/rounds/7/stop", 토큰()).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"seq\":4}")).build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(response.body()).contains("RPS_INVALID_PHASE");
    }

    @Test
    void 깨진_본문은_400으로_거절한다() throws Exception {
        var request = 요청("/rounds/7/challenge", 토큰()).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{seq:")).build();

        assertThat(http.send(request, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(400);
        verifyNoInteractions(service);
    }

    @Test
    void 허용_출처의_행동_사전요청을_지원한다() throws Exception {
        var request = 요청("/rounds/7/hands", null)
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization,content-type")
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(204);
        assertThat(response.headers().firstValue("Access-Control-Allow-Headers").orElseThrow())
                .containsIgnoringCase("content-type");
        verifyNoInteractions(service);
    }

    private String 토큰() {
        return jwt.issue(101, TestLoginSessions.ID);
    }

    private HttpRequest.Builder 요청(String path, String token) {
        var request = HttpRequest.newBuilder(URI.create(
                "http://127.0.0.1:" + port + "/api/v1/minigames/rps-roulette" + path))
                .header("Origin", "http://localhost:8080");
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return request;
    }
}
