package com.ssafy.ontop.game.mole;

import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.game.mole.dto.MoleDtos;
import com.ssafy.ontop.game.mole.service.MoleException;
import com.ssafy.ontop.game.mole.service.MoleService;
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
class MoleHttpTests {
    private static final MoleDtos.Rules RULES = new MoleDtos.Rules(90_000, 30_000,
            List.of("Q", "W", "E", "I", "O", "P"), 45, 10, 30, 20, List.of(0, 0, 20, 30, 45, 60),
            List.of(10, 20, 30), List.of(10, 12, 15, 20));
    private static final MoleDtos.Result RESULT = new MoleDtos.Result("7", 1380, 24, 96, 46, 46,
            Instant.parse("2026-11-04T03:01:33Z"));

    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @MockitoBean private WebSocketAccountLookup accounts;
    @MockitoBean private MoleService service;
    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void 인증을_준비한다() {
        when(accounts.findActive(101, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(
                101, VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
        when(service.status(101)).thenReturn(new MoleDtos.State(Instant.parse("2026-11-04T03:00:00Z"), 120, 500,
                1380, RULES, RESULT));
        when(service.start(101, "round-1")).thenReturn(new MoleDtos.Round("7", Instant.parse("2026-11-04T03:00:00Z"),
                RULES, List.of(new MoleDtos.Mole(0, 2, "RAPID", 3, 700, 1800))));
        when(service.complete(101, 7, List.of(new MoleDtos.Hit(2, 900), new MoleDtos.Hit(2, 1000))))
                .thenReturn(new MoleDtos.Settlement(RESULT, 166, 500, 1380));
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
        assertThat(response.body()).contains("\"todayEarned\":120", "\"dailyCap\":500", "\"pointsPerCoin\":45");
        assertThat(response.headers().firstValue("Cache-Control")).hasValue("no-store");
    }

    @Test
    void 시작은_중복_방지_키만_받아_출현표를_돌려준다() throws Exception {
        var request = 요청("/rounds", 토큰()).header("Idempotency-Key", "round-1")
                .POST(HttpRequest.BodyPublishers.noBody()).build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(response.body()).contains("\"kind\":\"RAPID\"", "\"hits\":3", "\"leaveAt\":1800");
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
    void 완료는_타격_기록을_서비스에_넘기고_정산_결과를_돌려준다() throws Exception {
        var request = 요청("/rounds/7/complete", 토큰()).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"hits\":[{\"hole\":2,\"at\":900},{\"hole\":2,\"at\":1000}]}"))
                .build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.body()).contains("\"reward\":46", "\"todayEarned\":166");
    }

    @Test
    void 잘못된_판_번호나_본문은_400이고_업무_오류는_코드로_돌려준다() throws Exception {
        when(service.complete(101, 8, List.of()))
                .thenThrow(new MoleException(409, "MOLE_ROUND_NOT_FINISHED", "아직 끝나지 않은 판이에요."));
        var badId = 요청("/rounds/0/complete", 토큰()).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"hits\":[]}")).build();
        var badBody = 요청("/rounds/7/complete", 토큰()).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"hits\":\"many\"}")).build();
        var early = 요청("/rounds/8/complete", 토큰()).header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString("{\"hits\":[]}")).build();

        assertThat(http.send(badId, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(400);
        assertThat(http.send(badBody, HttpResponse.BodyHandlers.ofString()).statusCode()).isEqualTo(400);
        var response = http.send(early, HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(response.body()).contains("MOLE_ROUND_NOT_FINISHED");
    }

    @Test
    void 허용_출처의_완료_사전요청을_지원한다() throws Exception {
        var request = 요청("/rounds/7/complete", null)
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization,content-type")
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(204);
        verifyNoInteractions(service);
    }

    private String 토큰() {
        return jwt.issue(101, TestLoginSessions.ID);
    }

    private HttpRequest.Builder 요청(String path, String token) {
        var request = HttpRequest.newBuilder(URI.create(
                "http://127.0.0.1:" + port + "/api/v1/minigames/whack-a-mole" + path))
                .header("Origin", "http://localhost:8080");
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return request;
    }
}
