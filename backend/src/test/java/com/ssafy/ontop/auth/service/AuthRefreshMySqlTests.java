package com.ssafy.ontop.auth.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.client.OAuthProviderClient;
import com.ssafy.ontop.auth.domain.RefreshToken;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.HttpCookie;
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
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.autoconfigure.web.servlet.MockMvcPrint;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.dao.DataAccessException;
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
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
@AutoConfigureMockMvc(print = MockMvcPrint.NONE)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "ontop.auth.allowed-origins=http://localhost:8080")
class AuthRefreshMySqlTests {

    private static final Instant START = Instant.parse("2026-10-21T00:00:00Z");
    private static final String TEST_KEY = randomValue();
    private static final String ORIGIN = "http://localhost:8080";
    @Autowired
    private MockMvc mvc;
    @Autowired
    private ObjectMapper mapper;
    @Autowired
    private UserRepository users;
    @MockitoSpyBean
    private RefreshTokenRepository tokens;
    @MockitoSpyBean
    private AccessJwtService jwt;
    @MockitoSpyBean
    private PlatformTransactionManager transactionManager;
    @MockitoBean(name = "oauthClock", reset = MockReset.NONE)
    private Clock clock;
    @MockitoBean
    private OAuthProviderClient provider;
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
            throw new IllegalStateException("Refresh MySQL 테스트는 전용 loopback 검증 DB만 사용합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
        registry.add("ontop.auth.jwt-secret-base64", () -> TEST_KEY);
    }

    @BeforeEach
    void setUp() {
        when(clock.instant()).thenReturn(START);
    }

    @Test
    void 정상_회전은_새_JWT와_같은_세션의_Refresh를_발급하고_7일을_슬라이딩한다() throws Exception {
        SessionToken original = fixture();
        String oldAccess = jwt.issue(original.user().getId(), TestLoginSessions.ID);
        long count = tokens.count();
        Instant now = START.plusSeconds(3600);
        when(clock.instant()).thenReturn(now);

        MvcResult result = refresh(original.raw()).andExpect(status().isOk()).andReturn();
        var body = mapper.readTree(result.getResponse().getContentAsString());
        assertThat(body.size()).isEqualTo(3);
        assertThat(body.path("tokenType").asText()).isEqualTo("Bearer");
        assertThat(body.path("expiresIn").asLong()).isEqualTo(1800);
        assertThat(jwt.verify(body.path("accessToken").asText())).isEqualTo(original.user().getId());
        assertThat(body.path("accessToken").asText()).isNotEqualTo(oldAccess);
        assertThat(body.has("refreshToken") || body.has("userId") || body.has("providerUserId")).isFalse();
        String nextRaw = rawCookie(result);
        assertThat(nextRaw).isNotEqualTo(original.raw());
        RefreshToken old = stored(original.raw());
        RefreshToken next = stored(nextRaw);
        assertThat(old.getRevokedAt()).isEqualTo(now).isEqualTo(old.getRotatedAt());
        assertThat(next.getUserId()).isEqualTo(original.user().getId());
        assertThat(next.getSessionId()).isEqualTo(old.getSessionId());
        assertThat(next.getCreatedAt()).isEqualTo(now);
        assertThat(next.getExpiresAt()).isEqualTo(now.plusSeconds(604800)).isAfter(old.getExpiresAt());
        assertThat(next.getTokenHash()).hasSize(64).isNotEqualTo(nextRaw);
        assertThat(next.getRevokedAt()).isNull();
        assertThat(tokens.count()).isEqualTo(count + 1);
        assertThat(result.getResponse().getHeader("Set-Cookie")).contains("HttpOnly", "Path=/api/v1/auth",
                "SameSite=Lax", "Max-Age=604800");
        assertThat(result.getRequest().getSession(false)).isNull();
        verifyNoInteractions(provider);
    }

    @Test
    void 짧은_재시도는_401만_반환하고_유예를_연장하지_않으며_늦은_재사용은_계열을_폐기한다() throws Exception {
        SessionToken original = fixture();
        String next = rawCookie(refresh(original.raw()).andExpect(status().isOk()).andReturn());
        Instant expiry = stored(next).getExpiresAt();
        long count = tokens.count();
        for (long delay : new long[] {0, 4, 5}) {
            when(clock.instant()).thenReturn(START.plusSeconds(delay));
            refresh(original.raw()).andExpect(status().isUnauthorized())
                    .andExpect(jsonPath("$.code").value("AUTH_REFRESH_ALREADY_ROTATED"))
                    .andExpect(header().doesNotExist("Set-Cookie"));
            assertThat(stored(next).getRevokedAt()).isNull();
            assertThat(stored(next).getExpiresAt()).isEqualTo(expiry);
        }
        when(clock.instant()).thenReturn(START.plusSeconds(6));
        refresh(original.raw()).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_REFRESH_REUSE_DETECTED"));
        assertThat(stored(next).getRevokedAt()).isEqualTo(START.plusSeconds(6));
        refresh(next).andExpect(status().isUnauthorized());
        assertThat(tokens.count()).isEqualTo(count);
    }

    @Test
    void 같은_토큰_동시요청은_한번만_회전하고_성공한_쿠키를_무효화하지_않는다() throws Exception {
        SessionToken original = fixture();
        long count = tokens.count();
        var results = race(() -> refresh(original.raw()).andReturn(), () -> refresh(original.raw()).andReturn());
        assertThat(results.stream().map(result -> result.getResponse().getStatus()).toList())
                .containsExactlyInAnyOrder(200, 401);
        MvcResult success = results.stream().filter(result -> result.getResponse().getStatus() == 200)
                .findFirst().orElseThrow();
        MvcResult collision = results.stream().filter(result -> result.getResponse().getStatus() == 401)
                .findFirst().orElseThrow();
        assertThat(collision.getResponse().getHeader("Set-Cookie")).isNull();
        assertThat(tokens.count()).isEqualTo(count + 1);
        assertThat(activeCount(original)).isEqualTo(1);
        refresh(rawCookie(success)).andExpect(status().isOk());
        assertThat(activeCount(original)).isEqualTo(1);
    }

    @Test
    void 재사용_폐기와_자식토큰_회전이_경합해도_활성_토큰이_남지_않는다() throws Exception {
        SessionToken original = fixture();
        String next = rawCookie(refresh(original.raw()).andExpect(status().isOk()).andReturn());
        when(clock.instant()).thenReturn(START.plusSeconds(6));
        var results = race(() -> refresh(original.raw()).andReturn(), () -> refresh(next).andReturn());
        assertThat(results.getFirst().getResponse().getStatus()).isEqualTo(401);
        assertThat(results.getLast().getResponse().getStatus()).isIn(200, 401);
        assertThat(activeCount(original)).isZero();
    }

    @Test
    void 같은_회원의_다른_로그인_세션은_재사용_폐기에_영향받지_않는다() throws Exception {
        SessionToken one = fixture();
        SessionToken two = fixture(one.user());
        String next = rawCookie(refresh(one.raw()).andExpect(status().isOk()).andReturn());
        when(clock.instant()).thenReturn(START.plusSeconds(6));
        refresh(one.raw()).andExpect(status().isUnauthorized());
        assertThat(stored(next).getRevokedAt()).isNotNull();
        assertThat(stored(two.raw()).getRevokedAt()).isNull();
        refresh(two.raw()).andExpect(status().isOk());
        assertThat(activeCount(one)).isZero();
        assertThat(activeCount(two)).isEqualTo(1);
    }

    @Test
    void 만료된_조상_토큰의_재사용도_슬라이딩으로_살아있는_후속_계열을_폐기한다() throws Exception {
        SessionToken original = fixture();
        when(clock.instant()).thenReturn(START.plusSeconds(6 * 86400));
        String child = rawCookie(refresh(original.raw()).andExpect(status().isOk()).andReturn());
        when(clock.instant()).thenReturn(START.plusSeconds(6 * 86400 + 1));
        String latest = rawCookie(refresh(child).andExpect(status().isOk()).andReturn());
        when(clock.instant()).thenReturn(START.plusSeconds(8 * 86400));
        assertThat(stored(original.raw()).getExpiresAt()).isBefore(clock.instant());
        assertThat(stored(latest).isUsableAt(clock.instant())).isTrue();

        refresh(original.raw()).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_REFRESH_REUSE_DETECTED"));

        assertThat(stored(latest).getRevokedAt()).isEqualTo(clock.instant());
        assertThat(activeCount(original)).isZero();
    }

    @ParameterizedTest
    @ValueSource(strings = {"expired", "revoked", "future", "forged"})
    void 만료와_로그아웃성_폐기와_미래발급과_위조는_401이다(String kind) throws Exception {
        SessionToken original = fixture();
        String raw = original.raw();
        if (kind.equals("expired")) {
            when(clock.instant()).thenReturn(START.plusSeconds(604800));
        } else if (kind.equals("revoked")) {
            jdbc.update("UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?",
                    java.sql.Timestamp.from(START), original.stored().getId());
        } else if (kind.equals("future")) {
            when(clock.instant()).thenReturn(START.minusSeconds(4000));
        } else {
            raw = "rt_" + randomUrlValue();
        }
        long count = tokens.count();
        refresh(raw).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_INVALID_REFRESH_TOKEN"))
                .andExpect(header().doesNotExist("Set-Cookie"));
        assertThat(tokens.count()).isEqualTo(count);
    }

    @Test
    void 탈퇴_회원에게_발급하지_않고_연결된_세션을_폐기한다() throws Exception {
        SessionToken original = fixture();
        jdbc.update("UPDATE users SET deleted_at = UTC_TIMESTAMP(3) WHERE id = ?", original.user().getId());
        long count = tokens.count();
        refresh(original.raw()).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_MEMBER_STATE_CHANGED"));
        assertThat(tokens.count()).isEqualTo(count);
        assertThat(activeCount(original)).isZero();
    }

    @Test
    void Refresh_저장_실패는_기존_폐기와_새_저장을_함께_롤백한다() throws Exception {
        SessionToken original = fixture();
        long count = tokens.count();
        doThrow(new DataAccessResourceFailureException("fixture-private-store")).when(tokens).saveAndFlush(any());
        MvcResult result = refresh(original.raw()).andExpect(status().isServiceUnavailable())
                .andExpect(header().doesNotExist("Set-Cookie")).andReturn();
        assertRollback(original, count);
        assertThat(result.getResponse().getContentAsString()).doesNotContain("fixture-private-store", "accessToken");
    }

    @Test
    void JWT_발급_실패도_기존_토큰을_폐기하지_않는다() throws Exception {
        SessionToken original = fixture();
        long count = tokens.count();
        doThrow(new AuthExchangeException(AuthExchangeException.Error.CONFIGURATION))
                .when(jwt).issue(anyLong(), anyString());
        refresh(original.raw()).andExpect(status().isInternalServerError())
                .andExpect(header().doesNotExist("Set-Cookie"));
        assertRollback(original, count);
    }

    @Test
    void 커밋단계_실패_대역은_실제_DB_트랜잭션을_롤백하고_인증을_공개하지_않는다() throws Exception {
        SessionToken original = fixture();
        long count = tokens.count();
        AtomicBoolean failed = new AtomicBoolean();
        doAnswer(invocation -> {
            TransactionStatus transaction = invocation.getArgument(0);
            if (transaction.isNewTransaction() && failed.compareAndSet(false, true)) {
                transactionManager.rollback(transaction);
                throw new TransactionSystemException("fixture-private-commit");
            }
            return invocation.callRealMethod();
        }).when(transactionManager).commit(any());

        refresh(original.raw()).andExpect(status().isServiceUnavailable())
                .andExpect(header().doesNotExist("Set-Cookie"));
        assertThat(failed).isTrue();
        assertRollback(original, count);
    }

    @Test
    void 잘못된_Origin과_본문은_정상_토큰을_소비하지_않는다() throws Exception {
        SessionToken original = fixture();
        mvc.perform(post("/api/v1/auth/refresh").cookie(cookie(original.raw())))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/auth/refresh").header("Origin", "https://attacker.example.test")
                .cookie(cookie(original.raw()))).andExpect(status().isForbidden());
        mvc.perform(post("/api/v1/auth/refresh").header("Origin", ORIGIN).cookie(cookie(original.raw())).content("{}"))
                .andExpect(status().isBadRequest());
        assertThat(stored(original.raw()).getRevokedAt()).isNull();
        refresh(original.raw()).andExpect(status().isOk());
    }

    @Test
    void 실제_HTTP_쿠키_저장소가_같은_Path의_Refresh를_교체하고_다시_사용한다() throws Exception {
        SessionToken original = fixture();
        CookieManager jar = new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER);
        URI endpoint = URI.create("http://127.0.0.1:" + port + "/api/v1/auth/refresh");
        // 로그인 응답처럼 CookieManager로 파싱하여 host/path 메타데이터를 동일하게 설정한다.
        jar.put(endpoint, Map.of("Set-Cookie", List.of("ONTOP_REFRESH=" + original.raw()
                + "; Path=/api/v1/auth; HttpOnly; SameSite=Lax; Max-Age=604800")));
        try (HttpClient client = HttpClient.newBuilder().cookieHandler(jar).build()) {
            HttpResponse<String> first = client.send(HttpRequest.newBuilder(endpoint).header("Origin", ORIGIN)
                    .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(first.statusCode()).isEqualTo(200);
            assertThat(first.headers().firstValue("Cache-Control").orElseThrow()).isEqualTo("no-store");
            HttpCookie updated = jar.getCookieStore().getCookies().stream()
                    .filter(value -> value.getName().equals("ONTOP_REFRESH")).findFirst().orElseThrow();
            assertThat(updated.getValue().equals(original.raw())).isFalse();
            assertThat(updated.getPath()).isEqualTo("/api/v1/auth");
            assertThat(updated.isHttpOnly()).isTrue();
            assertThat(jar.getCookieStore().getCookies()).noneMatch(value -> value.getName().equals("JSESSIONID"));
            HttpResponse<String> second = client.send(HttpRequest.newBuilder(endpoint).header("Origin", ORIGIN)
                    .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(second.statusCode()).isEqualTo(200);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"%72efresh", "refresh;probe=1"})
    void 인코딩과_경로파라미터로_Origin_검증을_우회할_수_없다(String path) throws Exception {
        SessionToken original = fixture();
        URI endpoint = URI.create("http://127.0.0.1:" + port + "/api/v1/auth/" + path);
        try (HttpClient client = HttpClient.newHttpClient()) {
            HttpResponse<String> result = client.send(HttpRequest.newBuilder(endpoint)
                    .header("Cookie", "ONTOP_REFRESH=" + original.raw())
                    .POST(HttpRequest.BodyPublishers.noBody()).build(), HttpResponse.BodyHandlers.ofString());
            assertThat(result.statusCode()).isEqualTo(403);
        }
        assertThat(stored(original.raw()).getRevokedAt()).isNull();
        refresh(original.raw()).andExpect(status().isOk());
    }

    @Test
    void V6와_시각_CHECK와_JPA_validate와_Flyway_재실행을_확인한다() {
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("6");
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE()
                AND table_name = 'refresh_tokens' AND column_name = 'rotated_at'
                AND data_type = 'timestamp' AND datetime_precision = 3 AND is_nullable = 'YES'
                """, Integer.class)).isEqualTo(1);
        SessionToken original = fixture();
        assertThat(stored(original.raw()).getRotatedAt()).isNull();
        assertThatThrownBy(() -> jdbc.update("UPDATE refresh_tokens SET rotated_at = ? WHERE id = ?",
                java.sql.Timestamp.from(START), original.stored().getId())).isInstanceOf(DataAccessException.class);
    }

    private void assertRollback(SessionToken original, long count) throws Exception {
        RefreshToken unchanged = stored(original.raw());
        assertThat(unchanged.getRevokedAt()).isNull();
        assertThat(unchanged.getRotatedAt()).isNull();
        assertThat(tokens.count()).isEqualTo(count);
    }

    private List<MvcResult> race(Callable<MvcResult> one, Callable<MvcResult> two) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var futures = List.of(one, two).stream().map(call -> (Callable<MvcResult>) () -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("Refresh 테스트 시작 대기 실패");
                }
                return call.call();
            }).map(executor::submit).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            return List.of(futures.getFirst().get(20, TimeUnit.SECONDS), futures.getLast().get(20, TimeUnit.SECONDS));
        }
    }

    private ResultActions refresh(String raw) throws Exception {
        return mvc.perform(post("/api/v1/auth/refresh").header("Origin", ORIGIN).cookie(cookie(raw)));
    }

    private Cookie cookie(String raw) {
        return new Cookie("ONTOP_REFRESH", raw);
    }

    private SessionToken fixture() {
        User user = users.saveAndFlush(new User(LoginProvider.SSAFY, "auth63-" + UUID.randomUUID(),
                UUID.randomUUID().toString().replace("-", "").substring(0, 8), CharacterGender.MALE));
        return fixture(user);
    }

    private SessionToken fixture(User user) {
        String raw = "rt_" + randomUrlValue();
        RefreshToken token = tokens.saveAndFlush(new RefreshToken(user, UUID.randomUUID().toString(), digest(raw),
                START.minusSeconds(3600), START.plusSeconds(604800)));
        return new SessionToken(user, raw, token);
    }

    private RefreshToken stored(String raw) {
        return tokens.findByTokenHash(digest(raw)).orElseThrow();
    }

    private long activeCount(SessionToken token) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM refresh_tokens WHERE user_id = ? AND session_id = ? "
                + "AND revoked_at IS NULL", Long.class, token.user().getId(), token.stored().getSessionId());
    }

    private String rawCookie(MvcResult result) {
        return result.getResponse().getHeader("Set-Cookie").split(";", 2)[0].substring("ONTOP_REFRESH=".length());
    }

    private static String digest(String raw) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(raw.getBytes(StandardCharsets.UTF_8)));
        } catch (java.security.NoSuchAlgorithmException exception) {
            throw new IllegalStateException("테스트 해시를 사용할 수 없습니다.");
        }
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
            return "RefreshFixture[redacted]";
        }
    }
}
