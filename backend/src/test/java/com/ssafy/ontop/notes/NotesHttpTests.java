package com.ssafy.ontop.notes;

import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.notes.dto.NoteReceiptResponse;
import com.ssafy.ontop.notes.service.NotesService;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.notes.enabled=true",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(com.ssafy.ontop.auth.websocket.MemberAuthenticationFixture.class)
class NotesHttpTests {
    @LocalServerPort int port;
    @Autowired AccessJwtService jwt;
    @MockitoBean WebSocketAccountLookup accounts;
    @MockitoBean NotesService notes;
    private final HttpClient http = HttpClient.newHttpClient();

    @BeforeEach
    void 회원을_연결한다() {
        when(accounts.findActive(101, TestLoginSessions.ID)).thenReturn(Optional.of(new VerifiedWebSocketUser(
                101, VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID)));
    }

    @Test
    void 미인증_접수와_조회는_차단한다() throws Exception {
        assertThat(request("POST", "/notes", "{}", null).statusCode()).isEqualTo(401);
        assertThat(request("GET", "/notes?channelId=channel-1", null, null).statusCode()).isEqualTo(401);
        verifyNoInteractions(notes);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "null", "[]", "{", "{\"operationId\":\"1761436800000_0123456789abcdef\",\"channelId\":\"channel-1\",\"text\":\"의견입니다\",\"userId\":202}",
            "{\"operationId\":\"1761436800000_0123456789abcdef\",\"channelId\":\"channel-1\",\"text\":4}",
            "{\"operationId\":\"1761436800000_0123456789abcdef\",\"channelId\":\"channel-1\",\"text\":\" \"}"})
    void 잘못된_본문과_위조필드는_거절한다(String body) throws Exception {
        assertThat(request("POST", "/notes", body, jwt.issue(101, TestLoginSessions.ID)).statusCode())
                .isEqualTo(400);
        verifyNoInteractions(notes);
    }

    @Test
    void 접수는_JWT회원과_정규화본문을_사용하고_익명메모를_응답한다() throws Exception {
        Instant now = Instant.parse("2026-10-25T00:00:00Z");
        when(notes.submit(anyLong(), any(), any(), any()))
                .thenReturn(new NoteReceiptResponse(new com.ssafy.ontop.notes.dto.NoteResponse("1", "의견입니다", now), now.plusSeconds(15)));
        var response = request("POST", "/notes", """
                {"operationId":"1761436800000_0123456789abcdef","channelId":"channel-1","text":"  의견입니다  "}
                """, jwt.issue(101, TestLoginSessions.ID));

        assertThat(response.statusCode()).isEqualTo(201);
        assertThat(response.body()).contains("\"id\":\"1\"").doesNotContain("userId", "author");
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        org.mockito.Mockito.verify(notes).submit(eq(101L), eq("1761436800000_0123456789abcdef"), eq("channel-1"),
                eq(new com.ssafy.ontop.notes.domain.NoteText("의견입니다")));
    }

    @Test
    void 빈_조회채널은_거절한다() throws Exception {
        assertThat(request("GET", "/notes?channelId=", null, jwt.issue(101, TestLoginSessions.ID)).statusCode())
                .isEqualTo(400);
        verifyNoInteractions(notes);
    }

    @Test
    void 필수_조회채널_누락도_같은_오류형식이다() throws Exception {
        var response = request("GET", "/notes", null, jwt.issue(101, TestLoginSessions.ID));
        assertThat(response.statusCode()).isEqualTo(400);
        assertThat(response.body()).contains("INVALID_REQUEST");
        verifyNoInteractions(notes);
    }

    @Test
    void 허용출처의_사전요청을_인증없이_처리한다() throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/notes"))
                .header("Origin", "http://localhost:8080").header("Access-Control-Request-Method", "POST")
                .header("Access-Control-Request-Headers", "authorization,content-type")
                .method("OPTIONS", HttpRequest.BodyPublishers.noBody()).build();
        var response = http.send(request, HttpResponse.BodyHandlers.ofString());

        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Access-Control-Allow-Origin")).contains("http://localhost:8080");
    }

    private HttpResponse<String> request(String method, String path, String body, String token) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1" + path));
        if (token != null) { request.header("Authorization", "Bearer " + token); }
        if (body != null) { request.header("Content-Type", "application/json"); }
        return http.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
}
