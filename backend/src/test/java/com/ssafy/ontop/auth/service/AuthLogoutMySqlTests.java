package com.ssafy.ontop.auth.service;

import com.ssafy.ontop.auth.client.OAuthProviderClient;
import com.ssafy.ontop.auth.domain.RefreshToken;
import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.RepeatedTest;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockReset;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.TransactionSystemException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "ontop.auth.allowed-origins=http://localhost:8080")
class AuthLogoutMySqlTests {

    private static final Instant NOW = Instant.parse("2026-10-21T00:00:00Z");
    private static final String ORIGIN = "http://localhost:8080";
    private static final String TEST_KEY = randomValue();
    @Autowired
    private MockMvc mvc;
    @Autowired
    private UserRepository users;
    @MockitoSpyBean
    private RefreshTokenRepository tokens;
    @MockitoSpyBean
    private PlatformTransactionManager transactionManager;
    @MockitoBean(name = "oauthClock", reset = MockReset.NONE)
    private Clock clock;
    @MockitoBean
    private OAuthProviderClient provider;
    @Autowired
    private AccessJwtService jwt;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private Flyway flyway;
    @LocalServerPort
    private int port;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("로그아웃 MySQL 테스트는 전용 loopback 검증 DB만 사용합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
        registry.add("ontop.auth.jwt-secret-base64", () -> TEST_KEY);
    }

    @BeforeEach
    void setUp() {
        when(clock.instant()).thenReturn(NOW);
    }

    @Test
    void 로그아웃은_204와_삭제쿠키를_주고_Refresh를_폐기하지만_기존_Access_서명은_유효하다() throws Exception {
        SessionToken original = fixture();
        String access = jwt.issue(original.user().getId(), TestLoginSessions.ID);
        long count = tokens.count();

        MvcResult result = logout(original.raw()).andExpect(status().isNoContent()).andReturn();

        assertThat(result.getResponse().getContentAsByteArray()).isEmpty();
        assertThat(result.getResponse().getHeader("Set-Cookie")).contains("ONTOP_REFRESH=;", "Max-Age=0",
                "Path=/api/v1/auth", "HttpOnly", "SameSite=Lax").doesNotContain("Domain=");
        assertThat(result.getRequest().getSession(false)).isNull();
        assertThat(stored(original.raw()).getRevokedAt()).isEqualTo(NOW);
        assertThat(stored(original.raw()).getRotatedAt()).isNull();
        assertThat(tokens.count()).isEqualTo(count);
        refresh(original.raw()).andExpect(status().isUnauthorized());
        assertThat(jwt.verify(access)).isEqualTo(original.user().getId());
        verifyNoInteractions(provider);
    }

    @Test
    void 반복_로그아웃은_204이며_다른_로그인_계열과_기존_폐기시각을_보존한다() throws Exception {
        SessionToken original = fixture();
        SessionToken other = fixture(original.user());
        logout(original.raw()).andExpect(status().isNoContent());
        when(clock.instant()).thenReturn(NOW.plusSeconds(60));
        logout(original.raw()).andExpect(status().isNoContent());
        assertThat(stored(original.raw()).getRevokedAt()).isEqualTo(NOW);
        assertThat(stored(other.raw()).getRevokedAt()).isNull();
        refresh(other.raw()).andExpect(status().isOk());
        assertThat(activeCount(original)).isZero();
        assertThat(activeCount(other)).isEqualTo(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"missing", "malformed", "forged", "expired", "revoked"})
    void 쿠키_누락과_만료와_위조와_폐기도_멱등적으로_처리한다(String kind) throws Exception {
        SessionToken original = fixture();
        String raw = original.raw();
        if (kind.equals("missing")) {
            raw = null;
        } else if (kind.equals("malformed")) {
            raw = "fixture-invalid";
        } else if (kind.equals("forged")) {
            raw = "rt_" + randomUrlValue();
        } else if (kind.equals("expired")) {
            when(clock.instant()).thenReturn(NOW.plusSeconds(604800));
        } else {
            jdbc.update("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?",
                    java.sql.Timestamp.from(NOW.minusSeconds(1)), original.stored().getId());
        }
        long count = tokens.count();
        logout(raw).andExpect(status().isNoContent()).andExpect(header().exists("Set-Cookie"));
        assertThat(tokens.count()).isEqualTo(count);
        if (kind.equals("expired") || kind.equals("revoked")) {
            assertThat(activeCount(original)).isZero();
        } else {
            assertThat(stored(original.raw()).getRevokedAt()).isNull();
        }
    }

    @Test
    void 이미_회전된_조상으로_로그아웃해도_같은_계열의_후속_토큰_전체만_폐기한다() throws Exception {
        SessionToken original = fixture();
        SessionToken other = fixture(original.user());
        String child = rawCookie(refresh(original.raw()).andExpect(status().isOk()).andReturn());
        when(clock.instant()).thenReturn(NOW.plusSeconds(1));
        String latest = rawCookie(refresh(child).andExpect(status().isOk()).andReturn());
        when(clock.instant()).thenReturn(NOW.plusSeconds(60));

        logout(original.raw()).andExpect(status().isNoContent());

        assertThat(activeCount(original)).isZero();
        assertThat(stored(latest).getRevokedAt()).isEqualTo(NOW.plusSeconds(60));
        assertThat(stored(original.raw()).getRotatedAt()).isEqualTo(NOW);
        assertThat(stored(child).getRotatedAt()).isEqualTo(NOW.plusSeconds(1));
        refresh(latest).andExpect(status().isUnauthorized());
        refresh(other.raw()).andExpect(status().isOk());
        logout(original.raw()).andExpect(status().isNoContent());
        assertThat(activeCount(other)).isEqualTo(1);
    }

    @Test
    void 만료된_조상도_계열_식별에만_사용하여_슬라이딩_후속_토큰을_폐기한다() throws Exception {
        SessionToken original = fixture();
        when(clock.instant()).thenReturn(NOW.plusSeconds(6 * 86400));
        String latest = rawCookie(refresh(original.raw()).andExpect(status().isOk()).andReturn());
        when(clock.instant()).thenReturn(NOW.plusSeconds(8 * 86400));
        assertThat(stored(latest).isUsableAt(clock.instant())).isTrue();
        logout(original.raw()).andExpect(status().isNoContent());
        assertThat(activeCount(original)).isZero();
        refresh(latest).andExpect(status().isUnauthorized());
    }

    @RepeatedTest(3)
    void 로그아웃과_Rotation이_동시에_실행되어도_활성_Refresh가_남지_않는다() throws Exception {
        SessionToken original = fixture();
        SessionToken other = fixture(original.user());
        var results = race(() -> refresh(original.raw()).andReturn(), () -> logout(original.raw()).andReturn());
        assertThat(results.getFirst().getResponse().getStatus()).isIn(200, 401);
        assertThat(results.getLast().getResponse().getStatus()).isEqualTo(204);
        assertThat(activeCount(original)).isZero();
        assertThat(activeCount(other)).isEqualTo(1);
        if (results.getFirst().getResponse().getStatus() == 200) {
            refresh(rawCookie(results.getFirst())).andExpect(status().isUnauthorized());
        }
        logout(original.raw()).andExpect(status().isNoContent());
    }

    @Test
    void 실제_UPDATE_후_저장소_예외가_발생해도_롤백하고_204를_반환하지_않는다() throws Exception {
        SessionToken original = fixture();
        long count = tokens.count();
        AtomicBoolean updated = new AtomicBoolean();
        doAnswer(invocation -> {
            Long userId = invocation.getArgument(0);
            String sessionId = invocation.getArgument(1);
            Instant now = invocation.getArgument(2);
            int changed = jdbc.update("UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? "
                    + "AND session_id = ? AND revoked_at IS NULL", java.sql.Timestamp.from(now), userId, sessionId);
            updated.set(changed > 0);
            throw new DataAccessResourceFailureException("fixture-private-store");
        }).when(tokens).revokeSession(any(), any(), any());

        MvcResult result = logout(original.raw()).andExpect(status().isServiceUnavailable())
                .andExpect(header().doesNotExist("Set-Cookie")).andReturn();

        assertThat(updated).isTrue();
        assertThat(stored(original.raw()).getRevokedAt()).isNull();
        assertThat(tokens.count()).isEqualTo(count);
        assertThat(result.getResponse().getContentAsString()).doesNotContain("fixture-private-store");
    }

    @Test
    void 커밋단계_실패_대역은_실제_폐기를_롤백하고_삭제쿠키를_공개하지_않는다() throws Exception {
        SessionToken original = fixture();
        AtomicBoolean failed = new AtomicBoolean();
        doAnswer(invocation -> {
            TransactionStatus transaction = invocation.getArgument(0);
            if (transaction.isNewTransaction() && failed.compareAndSet(false, true)) {
                transactionManager.rollback(transaction);
                throw new TransactionSystemException("fixture-private-commit");
            }
            return invocation.callRealMethod();
        }).when(transactionManager).commit(any());

        logout(original.raw()).andExpect(status().isServiceUnavailable())
                .andExpect(header().doesNotExist("Set-Cookie"));

        assertThat(failed).isTrue();
        assertThat(stored(original.raw()).getRevokedAt()).isNull();
    }

    @ParameterizedTest
    @ValueSource(strings = {"logout", "%6cogout", "logout;probe=1"})
    void 실제_HTTP_Origin_검증은_누락과_위조와_경로_변형을_거절한다(String path) throws Exception {
        SessionToken original = fixture();
        URI endpoint = URI.create("http://127.0.0.1:" + port + "/api/v1/auth/" + path);
        try (HttpClient client = HttpClient.newHttpClient()) {
            for (boolean forged : new boolean[] {false, true}) {
                var request = HttpRequest.newBuilder(endpoint).header("Cookie", "ONTOP_REFRESH=" + original.raw());
                if (forged) {
                    request.header("Origin", "https://attacker.example.test");
                }
                HttpResponse<String> response = client.send(request.POST(HttpRequest.BodyPublishers.noBody()).build(),
                        HttpResponse.BodyHandlers.ofString());
                assertThat(response.statusCode()).isEqualTo(403);
                assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
            }
        }
        assertThat(stored(original.raw()).getRevokedAt()).isNull();
        logout(original.raw()).andExpect(status().isNoContent());
    }

    @Test
    void 실제_HTTP_쿠키_저장소에서_Refresh만_삭제되고_반복_호출도_204이다() throws Exception {
        SessionToken original = fixture();
        CookieManager jar = new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER);
        URI endpoint = URI.create("http://127.0.0.1:" + port + "/api/v1/auth/logout");
        jar.put(endpoint, Map.of("Set-Cookie", List.of("ONTOP_REFRESH=" + original.raw()
                + "; Path=/api/v1/auth; HttpOnly; SameSite=Lax; Max-Age=604800", "OTHER=keep; Path=/")));
        try (HttpClient client = HttpClient.newBuilder().cookieHandler(jar).build()) {
            for (int count = 0; count < 2; count++) {
                HttpResponse<String> response = client.send(HttpRequest.newBuilder(endpoint).header("Origin", ORIGIN)
                        .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
                assertThat(response.statusCode()).isEqualTo(204);
                assertThat(response.body()).isEmpty();
                assertThat(jar.getCookieStore().getCookies())
                        .noneMatch(value -> value.getName().equals("ONTOP_REFRESH")
                                || value.getName().equals("JSESSIONID"));
                assertThat(jar.getCookieStore().getCookies()).anyMatch(value -> value.getName().equals("OTHER"));
            }
        }
        assertThat(activeCount(original)).isZero();
    }

    @Test
    void 탈퇴_계정도_로그아웃할수_있고_마이그레이션_추가나_회원_변경이_없다() throws Exception {
        SessionToken original = fixture();
        jdbc.update("UPDATE users SET deleted_at = UTC_TIMESTAMP(3) WHERE id = ?", original.user().getId());
        long before = users.count();
        logout(original.raw()).andExpect(status().isNoContent());
        assertThat(users.count()).isEqualTo(before);
        assertThat(users.findById(original.user().getId()).orElseThrow().getDeletedAt()).isNotNull();
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("4");
        assertThat(flyway.migrate().migrationsExecuted).isZero();
    }

    private List<MvcResult> race(Callable<MvcResult> first, Callable<MvcResult> second) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var results = List.of(first, second).stream().map(call -> (Callable<MvcResult>) () -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("로그아웃 경합 테스트 대기 실패");
                }
                return call.call();
            }).map(executor::submit).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            return List.of(results.getFirst().get(20, TimeUnit.SECONDS), results.getLast().get(20, TimeUnit.SECONDS));
        }
    }

    private ResultActions logout(String raw) throws Exception {
        var request = post("/api/v1/auth/logout").header("Origin", ORIGIN);
        if (raw != null) {
            request.cookie(new Cookie("ONTOP_REFRESH", raw));
        }
        return mvc.perform(request);
    }

    private ResultActions refresh(String raw) throws Exception {
        return mvc.perform(post("/api/v1/auth/refresh").header("Origin", ORIGIN)
                .cookie(new Cookie("ONTOP_REFRESH", raw)));
    }

    private SessionToken fixture() {
        User user = users.saveAndFlush(new User(LoginProvider.SSAFY, "auth62-" + UUID.randomUUID(),
                UUID.randomUUID().toString().replace("-", "").substring(0, 8), CharacterGender.MALE));
        return fixture(user);
    }

    private SessionToken fixture(User user) {
        String raw = "rt_" + randomUrlValue();
        RefreshToken token = tokens.saveAndFlush(new RefreshToken(user, UUID.randomUUID().toString(),
                OpaqueTokens.digest(raw), NOW.minusSeconds(3600), NOW.plusSeconds(604800)));
        return new SessionToken(user, raw, token);
    }

    private RefreshToken stored(String raw) {
        return tokens.findByTokenHash(OpaqueTokens.digest(raw)).orElseThrow();
    }

    private long activeCount(SessionToken token) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM refresh_tokens WHERE user_id = ? AND session_id = ? "
                + "AND revoked_at IS NULL", Long.class, token.user().getId(), token.stored().getSessionId());
    }

    private String rawCookie(MvcResult result) {
        return result.getResponse().getHeader("Set-Cookie").split(";", 2)[0].substring("ONTOP_REFRESH=".length());
    }

    private static String randomValue() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }

    private static String randomUrlValue() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private record SessionToken(User user, String raw, RefreshToken stored) {
        @Override
        public String toString() {
            return "LogoutFixture[redacted]";
        }
    }
}
