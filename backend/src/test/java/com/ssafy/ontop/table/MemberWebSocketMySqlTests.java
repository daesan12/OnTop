package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.WebSocketAccountLookup;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;

@Tag("mysql")
@ActiveProfiles({"dev", "db"})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.address=127.0.0.1")
class MemberWebSocketMySqlTests {
    @LocalServerPort
    private int port;
    @Autowired
    private ObjectMapper mapper;
    @Autowired
    private AccessJwtService jwt;
    @Autowired
    private AuthExchangePersistenceService issuer;
    @Autowired
    private WebSocketAccountLookup accounts;
    @Autowired
    private JdbcTemplate jdbc;
    @MockitoSpyBean
    private UserRepository users;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("회원 WebSocket 테스트는 전용 loopback 검증 DB만 사용합니다.");
        }
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        String key = Base64.getEncoder().encodeToString(bytes);
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
        registry.add("ontop.auth.jwt-secret-base64", () -> key);
    }

    @ParameterizedTest
    @EnumSource(LoginProvider.class)
    void 실제DB_회원이_접속권과_소켓으로_동일_내부ID와_제공자를_사용한다(LoginProvider provider) throws Exception {
        User user = fixture(provider);
        String access = access(user);
        var identity = accounts.findActive(user.getId(), jwt.verifyAccess(access).sessionId()).orElseThrow();
        assertThat(identity.userId()).isEqualTo(user.getId());
        assertThat(identity.provider()).isEqualTo(VerifiedWebSocketUser.Provider.valueOf(provider.name()));

        HttpResponse<String> issued = issue(access);
        assertThat(issued.statusCode()).isEqualTo(200);
        String ticket = mapper.readTree(issued.body()).path("ticket").asText();
        try (ScenarioClient socket = new ScenarioClient(port, Long.toString(user.getId()), ticket)) {
            assertThat(socket.await(message -> message.path("type").asText().equals("CONNECTED"))
                    .path("payload").path("userId").asText()).isEqualTo(Long.toString(user.getId()));
        }
        assertThat(users.findById(user.getId()).orElseThrow().getUpdatedAt()).isEqualTo(user.getUpdatedAt());
    }

    @Test
    void 발급후_실제DB탈퇴와_존재하지_않는_회원은_연결과_발급을_차단한다() throws Exception {
        assertThat(issue(jwt.issue(Long.MAX_VALUE, TestLoginSessions.ID)).statusCode()).isEqualTo(401);
        User user = fixture(LoginProvider.SSAFY);
        String access = access(user);
        String ticket = mapper.readTree(issue(access).body()).path("ticket").asText();

        jdbc.update("UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?", user.getId());

        assertThat(issue(access).statusCode()).isEqualTo(401);
        assertUpgradeRejected(ticket, 401);
        assertThat(users.findById(user.getId()).orElseThrow().getDeletedAt()).isNotNull();
    }

    @Test
    void Repository_장애는_발급과_Handshake_모두_503이고_접속권은_복구하지_않는다() throws Exception {
        User user = fixture(LoginProvider.NAVER);
        String access = access(user);
        String ticket = mapper.readTree(issue(access).body()).path("ticket").asText();
        doThrow(new DataAccessResourceFailureException("private-mysql-fixture")).when(users)
                .findActiveForLoginSession(eq(user.getId()),
                        anyString(), any());

        HttpResponse<String> failed = issue(access);
        assertThat(failed.statusCode()).isEqualTo(503);
        assertThat(failed.body()).doesNotContain("private-mysql-fixture", "Exception");
        assertUpgradeRejected(ticket, 503);
        assertUpgradeRejected(ticket, 401);
    }

    private User fixture(LoginProvider provider) {
        return users.saveAndFlush(new User(provider, "auth100-fixture-" + UUID.randomUUID(),
                "W" + UUID.randomUUID().toString().replace("-", "").substring(0, 7), CharacterGender.MALE));
    }

    private String access(User user) {
        return issuer.issueExisting(new LoginOutcome(
                OAuthProvider.valueOf(user.getLoginProvider().name()),
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null)).accessToken();
    }

    private HttpResponse<String> issue(String access) throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            return client.send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port
                            + "/api/v1/auth/websocket-ticket"))
                    .header("Authorization", "Bearer " + access).POST(HttpRequest.BodyPublishers.noBody()).build(),
                    HttpResponse.BodyHandlers.ofString());
        }
    }

    private void assertUpgradeRejected(String ticket, int expected) {
        assertThatThrownBy(() -> new ScenarioClient(port, "unused", ticket)).isInstanceOf(AssertionError.class)
                .hasMessageContaining(Integer.toString(expected));
    }
}
