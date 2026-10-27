package com.ssafy.ontop.feedback;

import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.feedback.dto.FeedbackListResponse;
import com.ssafy.ontop.feedback.dto.FeedbackReceiptResponse;
import com.ssafy.ontop.feedback.service.FeedbackService;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=production", "ontop.feedback.enabled=true", "ontop.admin.read-ids=101",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture.class)
class FeedbackProductionProfileHttpTests {
    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @MockitoBean WebSocketAccountLookup accounts;
    @MockitoBean FeedbackService feedback;
    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void 회원을_연결한다() {
        for (long id : new long[]{101, 202}) {
            when(accounts.findActive(id, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(
                    id, VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
        }
    }

    @Test
    void 운영_프로필에서도_접수와_관리자조회가_등록되고_권한을_검사한다() throws Exception {
        assertThat(request("POST", "/feedback", "{}", null).statusCode()).isEqualTo(401);

        Instant now = Instant.parse("2026-10-27T00:00:00Z");
        when(feedback.submit(anyLong(), any(), any(), any()))
                .thenReturn(new FeedbackReceiptResponse("1", now, now.plusSeconds(15)));
        assertThat(request("POST", "/feedback",
                "{\"operationId\":\"prod-1\",\"channelId\":\"channel-1\",\"text\":\"운영 소리함 의견입니다\"}",
                jwt.issue(202, TestLoginSessions.ID)).statusCode()).isEqualTo(201);

        assertThat(request("GET", "/admin/feedback", null, jwt.issue(202, TestLoginSessions.ID)).statusCode())
                .isEqualTo(403);
        when(feedback.list(101, Long.MAX_VALUE, 20)).thenReturn(new FeedbackListResponse(List.of(), null));
        assertThat(request("GET", "/admin/feedback", null, jwt.issue(101, TestLoginSessions.ID)).statusCode())
                .isEqualTo(200);
    }

    private HttpResponse<String> request(String method, String path, String body, String token) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1" + path));
        if (token != null) { request.header("Authorization", "Bearer " + token); }
        if (body != null) { request.header("Content-Type", "application/json"); }
        return http.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
}
