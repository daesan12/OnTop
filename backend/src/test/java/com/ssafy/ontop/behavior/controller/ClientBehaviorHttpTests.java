package com.ssafy.ontop.behavior.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.behavior.service.ClientBehaviorIntake;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture.class)
class ClientBehaviorHttpTests {

    private static final String BODY = """
            {"events":[{"type":"ONBOARDING_STEP","ageMs":0,
            "props":{"flow":"welcome_tour","action":"start","replay":false,"doneCount":0}}]}""";

    @LocalServerPort private int port;
    @Autowired private AccessJwtService jwt;
    @MockitoBean private WebSocketAccountLookup accounts;
    @MockitoBean private ClientBehaviorIntake intake;
    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void 인증을_준비한다() {
        when(accounts.findActive(101, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(
                101, VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
        when(intake.accept(eq(101L), eq(TestLoginSessions.ID), any(JsonNode.class)))
                .thenReturn(new ClientBehaviorIntake.Result(1, 0));
    }

    @Test
    void 미인증_요청은_거절한다() throws Exception {
        var response = send(BODY, null);

        assertThat(response.statusCode()).isEqualTo(401);
        verifyNoInteractions(intake);
    }

    @Test
    void 회원의_묶음을_받아_건수를_돌려준다() throws Exception {
        var response = send(BODY, jwt.issue(101, TestLoginSessions.ID));

        assertThat(response.statusCode()).isEqualTo(202);
        assertThat(response.body()).contains("\"accepted\":1", "\"dropped\":0");
        assertThat(response.headers().firstValue("Cache-Control")).hasValue("no-store");
        verify(intake).accept(eq(101L), eq(TestLoginSessions.ID), argThat(events -> events.size() == 1));
    }

    @Test
    void 묶음_모양이_틀리면_400이고_기록하지_않는다() throws Exception {
        String token = jwt.issue(101, TestLoginSessions.ID);
        String tooMany = "{\"events\":[" + "{},".repeat(ClientBehaviorIntake.MAX_BATCH) + "{}]}";

        for (String body : new String[] {"{\"events\":[]}", "{\"events\":{}}", "[]", "{\"events\":[{}],\"x\":1}",
                tooMany, "{not json"}) {
            assertThat(send(body, token).statusCode()).as(body).isEqualTo(400);
        }
        verifyNoInteractions(intake);
    }

    @Test
    void 허용_출처의_사전요청을_지원한다() throws Exception {
        var request = HttpRequest.newBuilder(uri()).header("Origin", "http://localhost:8080")
                .header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization,content-type")
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build();

        var response = http.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Access-Control-Allow-Origin")).contains("http://localhost:8080");
        verifyNoInteractions(intake);
    }

    private HttpResponse<String> send(String body, String token) throws Exception {
        var request = HttpRequest.newBuilder(uri()).header("Origin", "http://localhost:8080")
                .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(body));
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private URI uri() {
        return URI.create("http://127.0.0.1:" + port + "/api/v1/behavior-events");
    }
}
