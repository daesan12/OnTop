package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.exception.AuthCallbackException;
import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.auth.security.AccessAuthenticationService;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.auth.service.AuthUserStateService;
import com.ssafy.ontop.auth.websocket.MemberWebSocketConnections;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.address=127.0.0.1")
class UserWithdrawalMySqlTests {

    @LocalServerPort private int port;
    @Autowired private UserRepository users;
    @Autowired private AuthExchangePersistenceService issuer;
    @Autowired private AuthUserStateService states;
    @Autowired private AccessJwtService jwt;
    @Autowired private AccessAuthenticationService authentication;
    @Autowired private MemberWebSocketConnections connections;
    @Autowired private TableHub hub;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper mapper;
    @MockitoSpyBean private RefreshTokenRepository tokens;
    @MockitoSpyBean private PlatformTransactionManager transactions;
    @MockitoBean(name = "oauthClock") private Clock clock;
    private volatile Instant now;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("회원 탈퇴 검증은 격리 loopback MySQL 테스트 DB만 사용합니다.");
        }
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
        registry.add("ontop.auth.jwt-secret-base64", () -> Base64.getEncoder().encodeToString(key));
    }

    @BeforeEach
    void time() {
        now = Instant.parse("2026-10-24T00:00:00Z");
        when(clock.instant()).thenAnswer(call -> now);
    }

    @Test
    void 실제_DELETE가_전계열과_접속권을_폐기하고_4403으로_닫으며_다른회원은_보존한다() throws Exception {
        User user = member();
        User other = member();
        var first = login(user);
        var second = login(user);
        var otherLogin = login(other);
        now = now.plusSeconds(1);
        assertThat(refresh(first.refreshToken()).statusCode()).isEqualTo(200);
        Instant priorRevoked = tokens.findByTokenHash(hash(first.refreshToken())).orElseThrow().getRevokedAt();
        now = now.plusSeconds(1);
        long count = users.count();
        long closedBefore = hub.closedConnections(ConnectionCloseReason.MEMBER_DEACTIVATED);
        try (ScenarioClient socket = connected(user, first.accessToken());
                ScenarioClient otherSocket = connected(other, otherLogin.accessToken())) {
            String waiting = ticket(first.accessToken());
            long issued = System.nanoTime();
            Instant issuedAt = now;
            var response = withdraw(first.accessToken());
            assertThat(response.statusCode()).isEqualTo(204);
            assertThat(response.body()).isEmpty();
            assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
            assertThat(socket.awaitClose()).isEqualTo(4403);
            await().atMost(5, TimeUnit.SECONDS).untilAsserted(() ->
                    assertThat(hub.closedConnections(ConnectionCloseReason.MEMBER_DEACTIVATED)).isEqualTo(closedBefore + 1));
            User retained = users.findById(user.getId()).orElseThrow();
            assertThat(retained.getDeletedAt()).isEqualTo(now);
            assertThat(retained.getProviderUserId()).isEqualTo(user.getProviderUserId());
            assertThat(retained.getNickname()).isEqualTo(user.getNickname());
            assertThat(retained.getCreatedAt()).isEqualTo(user.getCreatedAt());
            assertThat(users.count()).isEqualTo(count);
            assertThat(activeTokens(user)).isZero();
            assertThat(tokens.findByTokenHash(hash(first.refreshToken())).orElseThrow().getRevokedAt())
                    .isEqualTo(priorRevoked);
            for (String access : new String[]{first.accessToken(), second.accessToken()}) {
                assertThat(get("/api/v1/users/me", access).statusCode()).isEqualTo(401);
                assertThat(get("/api/v1/users/nickname-availability?nickname=TestUser", access).statusCode())
                        .isEqualTo(401);
                assertThat(send(HttpRequest.newBuilder(url("/api/v1/users/me"))
                        .header("Authorization", "Bearer " + access).header("Content-Type", "application/json")
                        .method("PATCH", HttpRequest.BodyPublishers.ofString("{\"nickname\":\"온탑회원\"}"))
                        .build()).statusCode()).isEqualTo(401);
                assertThat(issueTicket(access).statusCode()).isEqualTo(401);
            }
            assertThat(refresh(first.refreshToken()).statusCode()).isEqualTo(401);
            assertThat(refresh(second.refreshToken()).statusCode()).isEqualTo(401);
            rejected(waiting);
            assertThat(now).isEqualTo(issuedAt);
            assertThat(System.nanoTime() - issued).isLessThan(TimeUnit.SECONDS.toNanos(30));
            assertThat(get("/api/v1/users/me", otherLogin.accessToken()).statusCode()).isEqualTo(200);
            assertThat(refresh(otherLogin.refreshToken()).statusCode()).isEqualTo(200);
            assertThat(otherSocket.request("TABLE_JOIN", Map.of("tableId", "table-1"))
                    .path("payload").path("tableId").asText()).isEqualTo("table-1");
            assertThat(withdraw(first.accessToken()).statusCode()).isEqualTo(401);
        }
    }

    @Test
    void 탈퇴_커밋_실패는_503이며_회원과_전계열과_실제_연결을_보존한다() throws Exception {
        User user = member();
        var first = login(user);
        var second = login(user);
        try (ScenarioClient socket = connected(user, first.accessToken())) {
            AtomicBoolean failed = new AtomicBoolean();
            doAnswer(call -> {
                TransactionStatus status = call.getArgument(0);
                if (status.isNewTransaction() && !TransactionSynchronizationManager.isCurrentTransactionReadOnly()
                        && failed.compareAndSet(false, true)) {
                    transactions.rollback(status);
                    throw new TransactionSystemException("private-commit");
                }
                return call.callRealMethod();
            }).when(transactions).commit(any());
            var response = withdraw(first.accessToken());
            assertThat(response.statusCode()).isEqualTo(503);
            assertThat(response.body()).doesNotContain("private-", "Exception");
            assertThat(users.findById(user.getId()).orElseThrow().getDeletedAt()).isNull();
            assertThat(activeTokens(user)).isEqualTo(2);
            assertThat(get("/api/v1/users/me", second.accessToken()).statusCode()).isEqualTo(200);
            assertThat(socket.request("TABLE_JOIN", Map.of("tableId", "table-2"))
                    .path("payload").path("tableId").asText()).isEqualTo("table-2");
        }
    }

    @Test
    void 전계열_DB_폐기_실패도_회원_상태를_롤백한다() throws Exception {
        User user = member();
        var credentials = login(user);
        doThrow(new DataAccessResourceFailureException("private-revoke"))
                .when(tokens).revokeAllForUser(eq(user.getId()), any());
        assertThat(withdraw(credentials.accessToken()).statusCode()).isEqualTo(503);
        assertThat(users.findById(user.getId()).orElseThrow().getDeletedAt()).isNull();
        assertThat(activeTokens(user)).isEqualTo(1);
    }

    @Test
    void 커밋후_소켓_IO_실패는_204와_DB_탈퇴를_되돌리지_않는다() throws Exception {
        User user = member();
        var credentials = login(user);
        WebSocketSession socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn(UUID.randomUUID().toString());
        when(socket.getAttributes()).thenReturn(new ConcurrentHashMap<>());
        when(socket.isOpen()).thenReturn(true);
        doThrow(new IOException("private-close")).when(socket).close(any());
        AtomicReference<ConnectionCloseReason> cleaned = new AtomicReference<>();
        connections.connect(socket, VerifiedWebSocketUser.from(authentication.authenticate(credentials.accessToken())),
                () -> true, cleaned::set);
        assertThat(withdraw(credentials.accessToken()).statusCode()).isEqualTo(204);
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() ->
                assertThat(cleaned.get()).isEqualTo(ConnectionCloseReason.MEMBER_DEACTIVATED));
        assertThat(users.findById(user.getId()).orElseThrow().getDeletedAt()).isNotNull();
        assertThat(activeTokens(user)).isZero();
    }

    @Test
    void 기존_7일이내_복구는_같은_ID를_쓰며_과거_Access와_Refresh는_되살아나지_않는다() throws Exception {
        User user = member();
        var old = login(user);
        assertThat(withdraw(old.accessToken()).statusCode()).isEqualTo(204);
        now = now.plusSeconds(60);
        var restored = states.resolve(new OAuthIdentity(OAuthProvider.SSAFY, user.getProviderUserId()));
        assertThat(restored.status()).isEqualTo(LoginOutcome.Status.RESTORED_MEMBER);
        assertThat(restored.userId()).isEqualTo(user.getId());
        assertThat(users.findById(user.getId()).orElseThrow().getDeletedAt()).isNull();
        assertThat(jwt.verifyAccess(old.accessToken()).userId()).isEqualTo(user.getId());
        assertThat(get("/api/v1/users/me", old.accessToken()).statusCode()).isEqualTo(401);
        assertThat(refresh(old.refreshToken()).statusCode()).isEqualTo(401);
        String fresh = issuer.issueExisting(restored).accessToken();
        assertThat(get("/api/v1/users/me", fresh).statusCode()).isEqualTo(200);
    }

    @Test
    void 기존_7일초과_정책은_행과_소셜키와_닉네임을_남기고_재가입을_보류한다() throws Exception {
        User user = member();
        var credentials = login(user);
        assertThat(withdraw(credentials.accessToken()).statusCode()).isEqualTo(204);
        long count = users.count();
        now = now.plusSeconds(604801);
        assertThatThrownBy(() -> states.resolve(new OAuthIdentity(OAuthProvider.SSAFY, user.getProviderUserId())))
                .isInstanceOfSatisfying(AuthCallbackException.class,
                        error -> assertThat(error.error()).isEqualTo(AuthCallbackException.Error.REJOIN_PENDING));
        assertThat(users.count()).isEqualTo(count);
        assertThat(users.findByLoginProviderAndProviderUserId(LoginProvider.SSAFY, user.getProviderUserId()))
                .isPresent();
        assertThat(users.existsByNickname(user.getNickname())).isTrue();
    }

    @RepeatedTest(3)
    void Rotation과_탈퇴가_경합해도_활성_Refresh가_남지_않는다() throws Exception {
        User user = member();
        var credentials = login(user);
        CountDownLatch start = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var rotate = workers.submit(() -> { start.await(); return refresh(credentials.refreshToken()); });
            var remove = workers.submit(() -> { start.await(); return withdraw(credentials.accessToken()); });
            start.countDown();
            assertThat(remove.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(204);
            var rotated = rotate.get(10, TimeUnit.SECONDS);
            assertThat(rotated.statusCode()).isIn(200, 401);
            if (rotated.statusCode() == 200) {
                String issued = mapper.readTree(rotated.body()).path("accessToken").asText();
                assertThat(get("/api/v1/users/me", issued).statusCode()).isEqualTo(401);
            }
        }
        assertThat(activeTokens(user)).isZero();
        assertThat(get("/api/v1/users/me", credentials.accessToken()).statusCode()).isEqualTo(401);
    }

    @RepeatedTest(3)
    void 핸드셰이크와_탈퇴가_경합해도_폐기된_연결은_남지_않는다() throws Exception {
        User user = member();
        var credentials = login(user);
        String ticket = ticket(credentials.accessToken());
        CountDownLatch start = new CountDownLatch(1);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var upgrade = workers.submit(() -> {
                start.await();
                try {
                    return new ScenarioClient(port, Long.toString(user.getId()), ticket);
                } catch (AssertionError rejected) {
                    assertThat(rejected.getMessage()).contains("401");
                    return null;
                }
            });
            var remove = workers.submit(() -> { start.await(); return withdraw(credentials.accessToken()); });
            start.countDown();
            assertThat(remove.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(204);
            try (ScenarioClient socket = upgrade.get(10, TimeUnit.SECONDS)) {
                if (socket != null) {
                    assertThat(socket.awaitClose()).isIn(4401, 4403);
                }
            }
        }
        assertThat(issueTicket(credentials.accessToken()).statusCode()).isEqualTo(401);
    }

    @RepeatedTest(3)
    void 실제_탈퇴와_다른계열의_로그아웃_경합은_전계열을_폐기하고_최초종료사유를_보존한다() throws Exception {
        User user = member();
        User otherUser = member();
        var first = login(user);
        var second = login(user);
        var other = login(otherUser);
        long logoutBefore = hub.closedConnections(ConnectionCloseReason.LOGOUT);
        long memberBefore = hub.closedConnections(ConnectionCloseReason.MEMBER_DEACTIVATED);
        try (ScenarioClient socket = connected(user, first.accessToken());
                var workers = Executors.newFixedThreadPool(2)) {
            CountDownLatch start = new CountDownLatch(1);
            var logout = workers.submit(() -> {
                start.await();
                return send(HttpRequest.newBuilder(url("/api/v1/auth/logout"))
                        .header("Cookie", "ONTOP_REFRESH=" + first.refreshToken())
                        .header("Origin", "http://localhost:8080")
                        .POST(HttpRequest.BodyPublishers.noBody()).build());
            });
            // 탈퇴는 별도 정상 sid로 인증하므로 첫 sid의 로그아웃이 인증 자체를 무효화하지 않는다.
            var withdrawal = workers.submit(() -> { start.await(); return withdraw(second.accessToken()); });
            start.countDown();
            assertThat(logout.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(204);
            assertThat(withdrawal.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(204);
            int code = socket.awaitClose();
            assertThat(code).isIn(4401, 4403);
            await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> assertThat(
                    hub.closedConnections(ConnectionCloseReason.LOGOUT) - logoutBefore
                    + hub.closedConnections(ConnectionCloseReason.MEMBER_DEACTIVATED) - memberBefore).isEqualTo(1));
            assertThat(hub.closedConnections(code == 4401 ? ConnectionCloseReason.LOGOUT
                    : ConnectionCloseReason.MEMBER_DEACTIVATED))
                    .isEqualTo((code == 4401 ? logoutBefore : memberBefore) + 1);
            assertThat(activeTokens(user)).isZero();
            assertThat(get("/api/v1/users/me", first.accessToken()).statusCode()).isEqualTo(401);
            assertThat(get("/api/v1/users/me", second.accessToken()).statusCode()).isEqualTo(401);
            assertThat(get("/api/v1/users/me", other.accessToken()).statusCode()).isEqualTo(200);
            assertThat(refresh(other.refreshToken()).statusCode()).isEqualTo(200);
            System.out.printf("AUTH_REASON_RACE withdrawalLogout withdrawal=204 logout=204 close=%d reason=%s otherRest=200%n",
                    code, code == 4401 ? "LOGOUT" : "MEMBER_DEACTIVATED");
        }
    }

    private User member() {
        return users.saveAndFlush(new User(LoginProvider.SSAFY, "withdrawal-" + UUID.randomUUID(),
                "D" + UUID.randomUUID().toString().replace("-", "").substring(0, 7), CharacterGender.FEMALE));
    }

    private AuthExchangePersistenceService.Credentials login(User user) {
        return issuer.issueExisting(new LoginOutcome(OAuthProvider.SSAFY,
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null));
    }

    private long activeTokens(User user) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM refresh_tokens WHERE user_id=? AND revoked_at IS NULL",
                Long.class, user.getId());
    }

    private String hash(String raw) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(raw.getBytes(StandardCharsets.US_ASCII)));
    }

    private ScenarioClient connected(User user, String access) throws Exception {
        ScenarioClient socket = new ScenarioClient(port, Long.toString(user.getId()), ticket(access));
        socket.await(message -> message.path("type").asText().equals("CONNECTED"));
        return socket;
    }

    private String ticket(String access) throws Exception {
        var response = issueTicket(access);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(response.body()).path("expiresIn").asLong()).isEqualTo(30);
        return mapper.readTree(response.body()).path("ticket").asText();
    }

    private void rejected(String ticket) {
        assertThatThrownBy(() -> new ScenarioClient(port, "unused", ticket))
                .isInstanceOf(AssertionError.class).hasMessageContaining("401");
    }

    private HttpResponse<String> withdraw(String access) throws Exception {
        return send(HttpRequest.newBuilder(url("/api/v1/users/me"))
                .header("Authorization", "Bearer " + access).DELETE().build());
    }

    private HttpResponse<String> refresh(String refresh) throws Exception {
        return send(HttpRequest.newBuilder(url("/api/v1/auth/refresh"))
                .header("Cookie", "ONTOP_REFRESH=" + refresh).header("Origin", "http://localhost:8080")
                .POST(HttpRequest.BodyPublishers.noBody()).build());
    }

    private HttpResponse<String> issueTicket(String access) throws Exception {
        return send(HttpRequest.newBuilder(url("/api/v1/auth/websocket-ticket"))
                .header("Authorization", "Bearer " + access).POST(HttpRequest.BodyPublishers.noBody()).build());
    }

    private HttpResponse<String> get(String path, String access) throws Exception {
        return send(HttpRequest.newBuilder(url(path)).header("Authorization", "Bearer " + access).GET().build());
    }

    private URI url(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private HttpResponse<String> send(HttpRequest request) throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            return client.send(request, HttpResponse.BodyHandlers.ofString());
        }
    }
}
