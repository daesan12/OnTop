package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.ActiveMemberLookup;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.table.websocket.WebSocketIngressGuard;
import com.ssafy.ontop.user.domain.LoginProvider;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/** JWT/접속권/실제 TCP 흐름. 회원 DB 조회만 기존 인증 경계에서 대역으로 둔다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=dev", "server.address=127.0.0.1",
        "ontop.websocket.limits.max-connections=2", "ontop.websocket.limits.max-connections-per-address=2",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="})
class WebSocketIngressAuthenticationFlowTests {
    @LocalServerPort int port;
    @Autowired WebSocketIngressGuard guard;
    @Autowired AccessJwtService jwt;
    @Autowired ObjectMapper json;
    @MockitoBean ActiveMemberLookup members;
    @MockitoBean(name = "oauthClock") Clock clock;

    @BeforeEach void members() {
        when(clock.instant()).thenReturn(Instant.parse("2026-10-29T00:00:00Z"));
        when(members.findActive(anyLong(), anyString())).thenAnswer(call -> member(call.getArgument(0)));
    }

    @Test void 중복회원거절은슬롯을돌려주고_다른회원의정상접속은유지한다() throws Exception {
        try (var first = connect(101)) {
            first.await(message -> message.path("type").asText().equals("CONNECTED"));
            try (var duplicate = connect(101)) { assertThat(duplicate.awaitClose()).isEqualTo(1008); }
            await().untilAsserted(() -> assertThat(guard.activeConnections()).isEqualTo(1));
            try (var other = connect(202)) {
                other.await(message -> message.path("type").asText().equals("CONNECTED"));
                assertThat(guard.activeConnections()).isEqualTo(2);
            }
        }
        await().untilAsserted(() -> assertThat(guard.activeConnections()).isZero());
    }

    @Test void Upgrade뒤인증폐기도슬롯을정리하고_새접속권으로재연결할수있다() throws Exception {
        when(members.findActive(303, TestLoginSessions.ID))
                .thenAnswer(call -> guard.activeConnections() > 0 ? Optional.empty() : member(303));
        try (var rejected = connect(303)) { assertThat(rejected.awaitClose()).isEqualTo(4401); }
        await().untilAsserted(() -> assertThat(guard.activeConnections()).isZero());
        when(members.findActive(303, TestLoginSessions.ID)).thenReturn(member(303));
        try (var returned = connect(303)) {
            returned.await(message -> message.path("type").asText().equals("CONNECTED"));
            assertThat(guard.activeConnections()).isEqualTo(1);
        }
        await().untilAsserted(() -> assertThat(guard.activeConnections()).isZero());
    }

    private Optional<AuthenticatedUser> member(long id) {
        return Optional.of(new AuthenticatedUser(id, LoginProvider.SSAFY, TestLoginSessions.ID));
    }

    private ScenarioClient connect(long user) throws Exception {
        try (var http = HttpClient.newHttpClient()) {
            var response = http.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                    + "/api/v1/auth/websocket-ticket")).header("Authorization", "Bearer "
                    + jwt.issue(user, TestLoginSessions.ID)).POST(HttpRequest.BodyPublishers.noBody()).build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            return new ScenarioClient(port, Long.toString(user), json.readTree(response.body()).path("ticket").asText());
        }
    }
}
