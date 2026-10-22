package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.user.domain.LoginProvider;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

/** 실제 TCP Host와 브라우저 Origin을 독립적으로 지정한다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "server.address=127.0.0.1",
        "ontop.auth.allowed-origins=http://localhost:8080,http://localhost:5173,https://APP.EXAMPLE:443/"
})
class WebSocketOriginAuthenticationTests {
    private static final String SAME_ORIGIN = "http://localhost:8080";
    private static final String FRONTEND_ORIGIN = "http://localhost:5173";

    @LocalServerPort
    private int port;
    @Autowired
    private ObjectMapper mapper;
    @MockitoSpyBean
    private AccessJwtService jwt;
    @MockitoBean
    private ActiveMemberLookup members;
    @MockitoBean(name = "oauthClock")
    private Clock clock;
    private volatile Instant now;

    @DynamicPropertySource
    static void signingKey(DynamicPropertyRegistry registry) {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        String key = Base64.getEncoder().encodeToString(bytes);
        registry.add("ontop.auth.jwt-secret-base64", () -> key);
    }

    @BeforeEach
    void member() {
        now = Instant.parse("2026-10-22T00:00:00Z");
        when(clock.instant()).thenAnswer(call -> now);
        when(members.findActive(anyLong())).thenAnswer(call -> Optional.of(
                new AuthenticatedUser(call.getArgument(0), LoginProvider.SSAFY)));
    }

    @Test
    void 동일_Origin은_기존대로_연결된다() throws Exception {
        assertConnected(ticket(101, SAME_ORIGIN), SAME_ORIGIN, "localhost:8080");
    }

    @Test
    void 허용된_프론트의_다른_Origin도_실제_백엔드_Host로_연결된다() throws Exception {
        assertConnected(ticket(102, FRONTEND_ORIGIN), FRONTEND_ORIGIN, "127.0.0.1:" + port);
    }

    @Test
    void 프록시의_내부_Host와_정규화된_공개_HTTPS_Origin이_달라도_연결된다() throws Exception {
        String origin = "https://app.example";
        assertConnected(ticket(103, origin), origin, "backend.internal:8080");
    }

    @Test
    void 비허용_Origin은_소비전에_403이고_Host를_같게_위조해도_우회하지_못한다() throws Exception {
        String value = ticket(104, FRONTEND_ORIGIN);
        rejected(value, "https://untrusted.invalid", "untrusted.invalid:443", 403);
        assertConnected(value, FRONTEND_ORIGIN, "127.0.0.1:" + port);
    }

    @Test
    void 양쪽_Origin이_허용돼도_발급출처와_다르면_401이며_소비를_복원하지_않는다() throws Exception {
        String value = ticket(105, FRONTEND_ORIGIN);
        rejected(value, SAME_ORIGIN, "localhost:8080", 401);
        rejected(value, FRONTEND_ORIGIN, "127.0.0.1:" + port, 401);
    }

    @Test
    void 교차_Origin에서도_재사용과_30초_만료를_거절한다() throws Exception {
        String value = ticket(106, FRONTEND_ORIGIN);
        assertConnected(value, FRONTEND_ORIGIN, "127.0.0.1:" + port);
        rejected(value, FRONTEND_ORIGIN, "127.0.0.1:" + port, 401);
        String expired = ticket(107, FRONTEND_ORIGIN);
        now = now.plusSeconds(30);
        rejected(expired, FRONTEND_ORIGIN, "127.0.0.1:" + port, 401);
    }

    @Test
    void HTTP_발급은_JWT검증과_내부회원조회를_각각_한번만_수행한다() throws Exception {
        String access = jwt.issue(108);
        clearInvocations(jwt, members);
        HttpResponse<String> response = issue(access, FRONTEND_ORIGIN);
        assertThat(response.statusCode()).isEqualTo(200);
        verify(jwt, times(1)).verifyAccess(anyString());
        verify(members, times(1)).findActive(108);
        verifyNoMoreInteractions(members);
        assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
        assertThat(response.headers().firstValue("Access-Control-Allow-Origin")).contains(FRONTEND_ORIGIN);
        assertThat(response.headers().firstValue("Access-Control-Allow-Credentials")).isEmpty();
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
    }

    @Test
    void 사전_Origin_거절은_JWT와_회원조회도_수행하지_않는다() throws Exception {
        String access = jwt.issue(109);
        clearInvocations(jwt, members);
        assertThat(issue(access, "https://untrusted.invalid").statusCode()).isEqualTo(403);
        verify(jwt, times(0)).verifyAccess(anyString());
        verifyNoMoreInteractions(members);
    }

    @Test
    void 교차_Origin에서_인증누락과_위조와_탈퇴회원은_여전히_401이다() throws Exception {
        assertThat(issue(null, FRONTEND_ORIGIN).statusCode()).isEqualTo(401);
        assertThat(issue("forged", FRONTEND_ORIGIN).statusCode()).isEqualTo(401);
        when(members.findActive(110)).thenReturn(Optional.empty());
        assertThat(issue(jwt.issue(110), FRONTEND_ORIGIN).statusCode()).isEqualTo(401);
    }

    private String ticket(long id, String origin) throws Exception {
        HttpResponse<String> response = issue(jwt.issue(id), origin);
        assertThat(response.statusCode()).isEqualTo(200);
        return mapper.readTree(response.body()).path("ticket").asText();
    }

    private HttpResponse<String> issue(String access, String origin) throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            HttpRequest.Builder request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/auth/websocket-ticket")).header("Origin", origin)
                    .POST(HttpRequest.BodyPublishers.noBody());
            if (access != null) {
                request.header("Authorization", "Bearer " + access);
            }
            return client.send(request.build(), HttpResponse.BodyHandlers.ofString());
        }
    }

    private void assertConnected(String ticket, String origin, String host) throws Exception {
        try (ScenarioClient socket = new ScenarioClient(port, "unused", ticket, origin, host)) {
            assertThat(socket.await(message -> message.path("type").asText().equals("CONNECTED"))
                    .path("payload").path("userId").asText()).matches("[1-9][0-9]*");
        }
    }

    private void rejected(String ticket, String origin, String host, int status) {
        assertThatThrownBy(() -> new ScenarioClient(port, "unused", ticket, origin, host))
                .isInstanceOf(AssertionError.class).hasMessageContaining("HTTP/1.1 " + status);
    }
}
