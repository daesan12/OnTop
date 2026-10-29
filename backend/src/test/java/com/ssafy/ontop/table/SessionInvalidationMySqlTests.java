package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.domain.RefreshToken;
import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.auth.service.AuthenticationRevocations;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
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
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.address=127.0.0.1")
class SessionInvalidationMySqlTests {
    @LocalServerPort
    private int port;
    @Autowired
    private AuthExchangePersistenceService issuer;
    @Autowired
    private AccessJwtService jwt;
    @Autowired
    private ObjectMapper mapper;
    @Autowired
    private RefreshTokenRepository tokens;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private TableHub hub;
    @Autowired
    private AuthenticationRevocations revocations;
    @MockitoSpyBean
    private UserRepository users;
    @MockitoSpyBean
    private PlatformTransactionManager transactions;
    @MockitoBean(name = "oauthClock")
    private Clock clock;
    private volatile Instant now;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("로그인 세션 테스트는 전용 loopback 검증 DB만 사용합니다.");
        }
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        String encoded = Base64.getEncoder().encodeToString(key);
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
        registry.add("ontop.auth.jwt-secret-base64", () -> encoded);
    }

    @BeforeEach
    void time() {
        now = Instant.parse("2026-10-24T00:00:00Z");
        when(clock.instant()).thenAnswer(call -> now);
    }

    @Test
    void 로그인_JWT와_Refresh는_동일한_로그인계열을_사용한다() throws Exception {
        User user = member();
        var first = login(user);
        var second = login(user);
        var verified = jwt.verifyAccess(first.accessToken());
        assertThat(verified.sessionId()).isEqualTo(stored(first.refreshToken()).getSessionId());
        assertThat(verified.sessionId()).isNotEqualTo(jwt.verifyAccess(second.accessToken()).sessionId());
        assertThat(get(first.accessToken()).statusCode()).isEqualTo(200);
        assertThat(jwt.verifyAccess(first.accessToken()).toString()).isEqualTo("VerifiedAccess[redacted]");
    }

    @Test
    void 로그아웃_커밋은_Access와_미소비접속권을_막고_연결을_4401로_종료한다() throws Exception {
        User user = member();
        var credentials = login(user);
        var other = login(user);
        assertThat(get(credentials.accessToken()).statusCode()).isEqualTo(200);
        Instant issuedAt = clock.instant();
        long issueStarted = System.nanoTime();
        HttpResponse<String> issued = issueTicket(credentials.accessToken());
        assertThat(issued.statusCode()).isEqualTo(200);
        var issuedBody = mapper.readTree(issued.body());
        assertThat(issuedBody.path("expiresIn").asLong()).isEqualTo(30);
        long issuedNanos = System.nanoTime();
        long closedBefore = hub.closedConnections(ConnectionCloseReason.LOGOUT);
        try (ScenarioClient socket = new ScenarioClient(port, Long.toString(user.getId()),
                issuedBody.path("ticket").asText())) {
            socket.await(message -> message.path("type").asText().equals("CONNECTED"));
            long connectedNanos = System.nanoTime();
            assertThat(connectedNanos - issueStarted).isLessThan(TimeUnit.SECONDS.toNanos(30));
            HttpResponse<String> waitingResponse = issueTicket(credentials.accessToken());
            assertThat(waitingResponse.statusCode()).isEqualTo(200);
            var waitingBody = mapper.readTree(waitingResponse.body());
            assertThat(waitingBody.path("expiresIn").asLong()).isEqualTo(30);
            String waiting = waitingBody.path("ticket").asText();
            long waitingNanos = System.nanoTime();
            HttpResponse<String> response = post("logout", credentials.refreshToken());
            assertThat(response.statusCode()).isEqualTo(204);
            assertThat(response.body()).isEmpty();
            assertThat(response.headers().firstValue("Set-Cookie").orElseThrow())
                    .contains("ONTOP_REFRESH=;", "Max-Age=0", "Path=/api/v1/auth", "HttpOnly");
            assertThat(socket.awaitClose()).isEqualTo(4401);
            assertThat(get(credentials.accessToken()).statusCode()).isEqualTo(401);
            assertThat(issueTicket(credentials.accessToken()).statusCode()).isEqualTo(401);
            // The production ticket clock has not advanced, and wall time is also below its unchanged TTL.
            assertThat(clock.instant()).isEqualTo(issuedAt);
            assertThat(stored(credentials.refreshToken()).getRevokedAt()).isNotNull();
            rejected(waiting);
            long waitingAgeMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - waitingNanos);
            assertThat(waitingAgeMillis).isLessThan(30_000);
            assertThat(get(other.accessToken()).statusCode()).isEqualTo(200);
            assertThat(post("refresh", other.refreshToken()).statusCode()).isEqualTo(200);
            assertThat(post("logout", credentials.refreshToken()).statusCode()).isEqualTo(204);
            System.out.printf("AUTH113_HTTP_WS ticketResponseToConnectedMs=%d issueStartToConnectedMs=%d "
                            + "unusedTicketAgeMs=%d beforeRest=200 ticket=200 logout=204 close=4401 "
                            + "afterRest=401 afterTicketIssue=401 unusedHandshake=401 "
                            + "otherRest=200 otherRefresh=200 reason=LOGOUT%n",
                    TimeUnit.NANOSECONDS.toMillis(connectedNanos - issuedNanos),
                    TimeUnit.NANOSECONDS.toMillis(connectedNanos - issueStarted), waitingAgeMillis);
        }
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() ->
                assertThat(hub.closedConnections(ConnectionCloseReason.LOGOUT)).isGreaterThan(closedBefore));
    }

    @Test
    void 같은회원의_다른기기_로그인계열은_JWT와_연결과_Refresh를_유지한다() throws Exception {
        User user = member();
        var first = login(user);
        var other = login(user);
        String waiting = ticket(first.accessToken());
        // Hub의 회원당 중복 연결 정책을 유지한다. 다른 로그인 계열의 연결 하나만 열어 둔다.
        try (ScenarioClient socket = connected(user, other.accessToken())) {
            assertThat(post("logout", first.refreshToken()).statusCode()).isEqualTo(204);
            assertThat(get(first.accessToken()).statusCode()).isEqualTo(401);
            rejected(waiting);
            assertThat(get(other.accessToken()).statusCode()).isEqualTo(200);
            assertThat(post("refresh", other.refreshToken()).statusCode()).isEqualTo(200);
            assertThat(socket.request("TABLE_JOIN", Map.of("tableId", "table-1"))
                    .path("payload").path("tableId").asText()).isEqualTo("table-1");
            assertThat(post("logout", other.refreshToken()).statusCode()).isEqualTo(204);
            assertThat(socket.awaitClose()).isEqualTo(4401);
        }
    }

    @Test
    void 회전은_기존_Access를_유지하고_5초후_재사용폐기는_같은계열을_차단한다() throws Exception {
        User user = member();
        var original = login(user);
        var other = login(user);
        long closedBefore = hub.closedConnections(ConnectionCloseReason.AUTH_SESSION_REVOKED);
        long logoutBefore = hub.closedConnections(ConnectionCloseReason.LOGOUT);
        try (ScenarioClient socket = connected(user, original.accessToken())) {
            now = now.plusSeconds(60);
            HttpResponse<String> response = post("refresh", original.refreshToken());
            assertThat(response.statusCode()).isEqualTo(200);
            String access = mapper.readTree(response.body()).path("accessToken").asText();
            String refresh = response.headers().firstValue("Set-Cookie").orElseThrow()
                    .split(";", 2)[0].substring("ONTOP_REFRESH=".length());
            assertThat(jwt.verifyAccess(access).sessionId()).isEqualTo(jwt.verifyAccess(original.accessToken()).sessionId());
            assertThat(stored(refresh).getExpiresAt()).isEqualTo(now.plusSeconds(604800));
            assertThat(get(original.accessToken()).statusCode()).isEqualTo(200);
            assertThat(get(access).statusCode()).isEqualTo(200);
            assertThat(post("refresh", original.refreshToken()).statusCode()).isEqualTo(401);
            assertThat(get(access).statusCode()).isEqualTo(200); // 5초 grace는 정상 계열을 폐기하지 않는다.
            assertThat(socket.request("TABLE_JOIN", Map.of("tableId", "table-1"))
                    .path("payload").path("tableId").asText()).isEqualTo("table-1");
            now = now.plusSeconds(6);
            assertThat(post("refresh", original.refreshToken()).statusCode()).isEqualTo(401);
            assertThat(socket.awaitClose()).isEqualTo(4401);
            assertThat(get(original.accessToken()).statusCode()).isEqualTo(401);
            assertThat(get(access).statusCode()).isEqualTo(401);
            assertThat(get(other.accessToken()).statusCode()).isEqualTo(200);
        }
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() ->
                assertThat(hub.closedConnections(ConnectionCloseReason.AUTH_SESSION_REVOKED)).isEqualTo(closedBefore + 1));
        assertThat(hub.closedConnections(ConnectionCloseReason.LOGOUT)).isEqualTo(logoutBefore);
    }

    @RepeatedTest(3)
    void 실제_재사용감지와_로그아웃_경합은_같은계열만_폐기하고_최초종료사유를_보존한다() throws Exception {
        User user = member();
        var original = login(user);
        var other = login(user);
        assertThat(post("refresh", original.refreshToken()).statusCode()).isEqualTo(200);
        now = now.plusSeconds(6);
        long logoutBefore = hub.closedConnections(ConnectionCloseReason.LOGOUT);
        long reuseBefore = hub.closedConnections(ConnectionCloseReason.AUTH_SESSION_REVOKED);
        try (ScenarioClient socket = connected(user, original.accessToken());
                var workers = Executors.newFixedThreadPool(2)) {
            CountDownLatch start = new CountDownLatch(1);
            var logout = workers.submit(() -> { start.await(); return post("logout", original.refreshToken()); });
            var reuse = workers.submit(() -> { start.await(); return post("refresh", original.refreshToken()); });
            start.countDown();
            assertThat(logout.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(204);
            assertThat(reuse.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(401);
            assertThat(socket.awaitClose()).isEqualTo(4401);
            await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> assertThat(
                    hub.closedConnections(ConnectionCloseReason.LOGOUT) - logoutBefore
                    + hub.closedConnections(ConnectionCloseReason.AUTH_SESSION_REVOKED) - reuseBefore).isEqualTo(1));
            assertThat(get(original.accessToken()).statusCode()).isEqualTo(401);
            assertThat(get(other.accessToken()).statusCode()).isEqualTo(200);
            assertThat(post("refresh", other.refreshToken()).statusCode()).isEqualTo(200);
            String reason = hub.closedConnections(ConnectionCloseReason.LOGOUT) > logoutBefore
                    ? "LOGOUT" : "AUTH_SESSION_REVOKED";
            System.out.printf("AUTH_REASON_RACE reuseLogout logout=204 reuse=401 close=4401 reason=%s otherRest=200%n", reason);
        }
    }

    @Test
    void 회원비활성_롤백은_연결을_보존하고_커밋은_전체연결을_4403으로_닫는다() throws Exception {
        User user = member();
        var credentials = login(user);
        String waiting = ticket(credentials.accessToken());
        try (ScenarioClient socket = connected(user, credentials.accessToken())) {
            new TransactionTemplate(transactions).executeWithoutResult(status -> {
                jdbc.update("UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?", user.getId());
                revocations.memberDeactivated(user.getId());
                status.setRollbackOnly();
            });
            assertThat(get(credentials.accessToken()).statusCode()).isEqualTo(200);
            assertThat(socket.request("TABLE_JOIN", Map.of("tableId", "table-2"))
                    .path("payload").path("tableId").asText()).isEqualTo("table-2");
            new TransactionTemplate(transactions).executeWithoutResult(status -> {
                jdbc.update("UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?", user.getId());
                jdbc.update("UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP(3) "
                        + "WHERE user_id = ? AND revoked_at IS NULL", user.getId());
                revocations.memberDeactivated(user.getId());
            });
            assertThat(socket.awaitClose()).isEqualTo(4403);
            assertThat(get(credentials.accessToken()).statusCode()).isEqualTo(401);
            rejected(waiting);
        }
    }

    @Test
    void 로그아웃_커밋실패는_503이며_Refresh와_Access와_연결이_유지된다() throws Exception {
        User user = member();
        var credentials = login(user);
        try (ScenarioClient socket = connected(user, credentials.accessToken())) {
            AtomicBoolean failed = new AtomicBoolean();
            doAnswer(call -> {
                TransactionStatus status = call.getArgument(0);
                if (status.isNewTransaction() && failed.compareAndSet(false, true)) {
                    transactions.rollback(status);
                    throw new TransactionSystemException("private-commit-fixture");
                }
                return call.callRealMethod();
            }).when(transactions).commit(any());
            HttpResponse<String> response = post("logout", credentials.refreshToken());
            assertThat(response.statusCode()).isEqualTo(503);
            assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
            assertThat(response.body()).doesNotContain("private-commit-fixture", "Exception");
            assertThat(stored(credentials.refreshToken()).getRevokedAt()).isNull();
            assertThat(get(credentials.accessToken()).statusCode()).isEqualTo(200);
            assertThat(socket.request("TABLE_JOIN", Map.of("tableId", "table-1"))
                    .path("payload").path("tableId").asText()).isEqualTo("table-1");
        }
    }

    @Test
    void DB조회_장애는_503이고_기존_연결을_로그아웃으로_종료하지_않는다() throws Exception {
        User user = member();
        var credentials = login(user);
        try (ScenarioClient socket = connected(user, credentials.accessToken())) {
            doThrow(new DataAccessResourceFailureException("private-db-fixture")).when(users)
                    .findActiveForLoginSession(eq(user.getId()), anyString(), any());
            assertThat(get(credentials.accessToken()).statusCode()).isEqualTo(503);
            assertThat(issueTicket(credentials.accessToken()).statusCode()).isEqualTo(503);
            assertThat(socket.request("TABLE_JOIN", Map.of("tableId", "table-2"))
                    .path("payload").path("tableId").asText()).isEqualTo("table-2");
            assertThat(stored(credentials.refreshToken()).getRevokedAt()).isNull();
        }
    }

    @RepeatedTest(3)
    void 로그아웃과_접속권소비가_경합해도_폐기된_연결이_남지_않는다() throws Exception {
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
            var logout = workers.submit(() -> { start.await(); return post("logout", credentials.refreshToken()); });
            start.countDown();
            assertThat(logout.get(10, TimeUnit.SECONDS).statusCode()).isEqualTo(204);
            try (ScenarioClient socket = upgrade.get(10, TimeUnit.SECONDS)) {
                if (socket != null) {
                    assertThat(socket.awaitClose()).isEqualTo(4401);
                }
            }
            assertThat(get(credentials.accessToken()).statusCode()).isEqualTo(401);
        }
    }

    @Test
    void 서명이_정상이어도_없는세션과_다른회원세션과_만료세션은_차단한다() throws Exception {
        User first = member();
        User second = member();
        var original = login(first);
        var other = login(second);
        String foreign = jwt.issue(first.getId(), jwt.verifyAccess(other.accessToken()).sessionId());
        assertThat(get(foreign).statusCode()).isEqualTo(401);
        assertThat(get(jwt.issue(first.getId(), UUID.randomUUID().toString())).statusCode()).isEqualTo(401);
        jdbc.update("UPDATE refresh_tokens SET expires_at = ? WHERE user_id = ?",
                java.sql.Timestamp.from(now.plusSeconds(1)), first.getId());
        now = now.plusSeconds(2);
        assertThat(get(original.accessToken()).statusCode()).isEqualTo(401);
        assertThat(get(other.accessToken()).statusCode()).isEqualTo(200);
    }

    private User member() {
        return users.saveAndFlush(new User(LoginProvider.SSAFY, "auth113-fixture-" + UUID.randomUUID(),
                "S" + UUID.randomUUID().toString().replace("-", "").substring(0, 7), CharacterGender.FEMALE));
    }

    private AuthExchangePersistenceService.Credentials login(User user) {
        return issuer.issueExisting(new LoginOutcome(OAuthProvider.SSAFY,
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null));
    }

    private RefreshToken stored(String raw) throws Exception {
        String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(raw.getBytes(StandardCharsets.US_ASCII)));
        return tokens.findByTokenHash(hash).orElseThrow();
    }

    private ScenarioClient connected(User user, String access) throws Exception {
        ScenarioClient socket = new ScenarioClient(port, Long.toString(user.getId()), ticket(access));
        socket.await(message -> message.path("type").asText().equals("CONNECTED"));
        return socket;
    }

    private String ticket(String access) throws Exception {
        HttpResponse<String> response = issueTicket(access);
        assertThat(response.statusCode()).isEqualTo(200);
        return mapper.readTree(response.body()).path("ticket").asText();
    }

    private void rejected(String ticket) {
        assertThatThrownBy(() -> new ScenarioClient(port, "unused", ticket))
                .isInstanceOf(AssertionError.class).hasMessageContaining("401");
    }

    private HttpResponse<String> get(String access) throws Exception {
        return request(HttpRequest.newBuilder(url("/api/v1/channels"))
                .header("Authorization", "Bearer " + access).GET().build());
    }

    private HttpResponse<String> issueTicket(String access) throws Exception {
        return request(HttpRequest.newBuilder(url("/api/v1/auth/websocket-ticket"))
                .header("Authorization", "Bearer " + access).POST(HttpRequest.BodyPublishers.noBody()).build());
    }

    private HttpResponse<String> post(String operation, String refresh) throws Exception {
        return request(HttpRequest.newBuilder(url("/api/v1/auth/" + operation))
                .header("Cookie", "ONTOP_REFRESH=" + refresh).header("Origin", "http://localhost:8080")
                .POST(HttpRequest.BodyPublishers.noBody()).build());
    }

    private URI url(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private HttpResponse<String> request(HttpRequest request) throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            return client.send(request, HttpResponse.BodyHandlers.ofString());
        }
    }
}
