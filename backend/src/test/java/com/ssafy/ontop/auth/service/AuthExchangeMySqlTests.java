package com.ssafy.ontop.auth.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.client.OAuthProviderClient;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.domain.RefreshToken;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.util.UriComponentsBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
@AutoConfigureMockMvc
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "ontop.oauth.ssafy.client-id=fixture-ssafy",
        "ontop.oauth.frontend-callback-uri="
})
class AuthExchangeMySqlTests {

    private static final String TEST_KEY = randomKey();

    @Autowired
    private MockMvc mvc;
    @Autowired
    private ObjectMapper mapper;
    @Autowired
    private OAuthExchangeStore codes;
    @Autowired
    private OnboardingTokenStore onboarding;
    @Autowired
    private AccessJwtService jwt;
    @Autowired
    private UserRepository users;
    @MockitoSpyBean
    private RefreshTokenRepository refreshTokens;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private Flyway flyway;
    @MockitoBean
    private OAuthProviderClient provider;
    @LocalServerPort
    private int port;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("교환 MySQL 테스트는 전용 loopback 검증 DB만 사용합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
        registry.add("ontop.auth.jwt-secret-base64", () -> TEST_KEY);
    }

    @ParameterizedTest
    @EnumSource(value = LoginOutcome.Status.class, names = {"EXISTING_MEMBER", "RESTORED_MEMBER"})
    void 정상과_복구회원은_동일_ID로_발급하고_DB에는_Refresh_해시만_저장한다(LoginOutcome.Status member) throws Exception {
        User user = fixture();
        MockHttpSession session = new MockHttpSession();
        String code = code(session, new LoginOutcome(OAuthProvider.SSAFY, member, user.getId(), null));
        long userCount = users.count();

        MvcResult result = exchange(code, session).andExpect(status().isOk()).andReturn();

        JsonNode body = mapper.readTree(result.getResponse().getContentAsString());
        assertThat(jwt.verify(body.path("accessToken").asText())).isEqualTo(user.getId());
        assertThat(body.has("refreshToken")).isFalse();
        String raw = refreshValue(result.getResponse().getHeader("Set-Cookie"));
        RefreshToken saved = refreshTokens.findByTokenHash(OpaqueTokens.digest(raw)).orElseThrow();
        assertThat(saved.getUserId()).isEqualTo(user.getId());
        assertThat(saved.getTokenHash()).hasSize(64).isNotEqualTo(raw);
        assertThat(saved.getExpiresAt()).isEqualTo(saved.getCreatedAt().plusSeconds(604800));
        assertThat(saved.getRevokedAt()).isNull();
        assertThat(saved.isUsableAt(Instant.now())).isTrue();
        assertThat(users.count()).isEqualTo(userCount);
    }

    @Test
    void 신규회원은_양쪽_테이블에_행을_생성하지_않고_온보딩만_발급한다() throws Exception {
        MockHttpSession session = new MockHttpSession();
        String providerId = "auth89-new-" + UUID.randomUUID();
        String code = code(session,
                new LoginOutcome(OAuthProvider.NAVER, LoginOutcome.Status.NEW_MEMBER, null, providerId));
        long beforeUsers = users.count();
        long beforeRefresh = refreshTokens.count();

        MvcResult result = exchange(code, session).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ONBOARDING_REQUIRED"))
                .andExpect(header().doesNotExist("Set-Cookie")).andReturn();

        String token = mapper.readTree(result.getResponse().getContentAsString()).path("onboardingToken").asText();
        assertThat(onboarding.verify(token).providerUserId()).isEqualTo(providerId);
        assertThatThrownBy(() -> jwt.verify(token)).isInstanceOf(AuthExchangeException.class);
        assertThat(users.count()).isEqualTo(beforeUsers);
        assertThat(refreshTokens.count()).isEqualTo(beforeRefresh);
    }

    @Test
    void 탈퇴_회원은_교환_시점에_재검증해_거절한다() throws Exception {
        User user = fixture();
        jdbc.update("UPDATE users SET deleted_at = UTC_TIMESTAMP(3) WHERE id = ?", user.getId());
        assertMemberRejected(new LoginOutcome(OAuthProvider.SSAFY,
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null));
    }

    @Test
    void 삭제된_회원_ID와_공급자가_다른_회원은_거절한다() throws Exception {
        assertMemberRejected(new LoginOutcome(OAuthProvider.SSAFY,
                LoginOutcome.Status.EXISTING_MEMBER, Long.MAX_VALUE, null));
        User user = fixture();
        assertMemberRejected(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.RESTORED_MEMBER, user.getId(), null));
    }

    @Test
    void 신규_교환_후_이미_회원이_생겼다면_온보딩도_거절한다() throws Exception {
        User user = fixture();
        assertMemberRejected(new LoginOutcome(OAuthProvider.SSAFY,
                LoginOutcome.Status.NEW_MEMBER, null, user.getProviderUserId()));
    }

    @Test
    void 복수기기_로그인은_서로_다른_세션과_해시로_저장한다() throws Exception {
        User user = fixture();
        LoginOutcome outcome = new LoginOutcome(OAuthProvider.SSAFY,
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null);
        MockHttpSession firstSession = new MockHttpSession();
        MockHttpSession secondSession = new MockHttpSession();
        MvcResult first = exchange(code(firstSession, outcome), firstSession).andExpect(status().isOk()).andReturn();
        MvcResult second = exchange(code(secondSession, outcome), secondSession).andExpect(status().isOk()).andReturn();
        RefreshToken one = refreshTokens.findByTokenHash(OpaqueTokens.digest(refreshValue(first.getResponse()
                .getHeader("Set-Cookie")))).orElseThrow();
        RefreshToken two = refreshTokens.findByTokenHash(OpaqueTokens.digest(refreshValue(second.getResponse()
                .getHeader("Set-Cookie")))).orElseThrow();

        assertThat(one.getSessionId()).isNotEqualTo(two.getSessionId());
        assertThat(one.getTokenHash()).isNotEqualTo(two.getTokenHash());
        assertThat(one.getUserId()).isEqualTo(two.getUserId());
    }

    @Test
    void Refresh_저장_실패는_롤백되고_응답과_쿠키가_노출되지_않는다() throws Exception {
        User user = fixture();
        MockHttpSession session = new MockHttpSession();
        String code = code(session,
                new LoginOutcome(OAuthProvider.SSAFY, LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null));
        long before = refreshTokens.count();
        doThrow(new DataAccessResourceFailureException("fixture-private-database"))
                .when(refreshTokens).saveAndFlush(any());

        MvcResult result = exchange(code, session).andExpect(status().isServiceUnavailable())
                .andExpect(header().doesNotExist("Set-Cookie")).andReturn();

        assertThat(result.getResponse().getContentAsString()).doesNotContain("accessToken", "fixture-private-database");
        assertThat(refreshTokens.count()).isEqualTo(before);
        exchange(code, session).andExpect(status().isUnauthorized());
    }

    @Test
    void V2와_FK와_JPA_validate와_재실행을_확인한다() {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.4.");
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("2");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE success = 1", Integer.class))
                .isEqualTo(2);
        long userCount = users.count();
        long refreshCount = refreshTokens.count();
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThat(users.count()).isEqualTo(userCount);
        assertThat(refreshTokens.count()).isEqualTo(refreshCount);
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS
                WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = 'fk_refresh_tokens_user'
                AND DELETE_RULE = 'RESTRICT'
                """, Integer.class)).isEqualTo(1);
        assertThatThrownBy(() -> jdbc.update("""
                INSERT INTO refresh_tokens (user_id, session_id, token_hash, created_at, expires_at)
                VALUES (?, ?, ?, UTC_TIMESTAMP(3), DATE_ADD(UTC_TIMESTAMP(3), INTERVAL 7 DAY))
                """, Long.MAX_VALUE, UUID.randomUUID().toString(), OpaqueTokens.digest(UUID.randomUUID().toString())))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    void 실제_HTTP_인가_콜백_교환은_동일_쿠키로_연결되고_세션_ID가_교체된다() throws Exception {
        User user = fixture();
        when(provider.identify(eq(OAuthProvider.SSAFY), anyString(), anyString()))
                .thenReturn(new OAuthIdentity(OAuthProvider.SSAFY, user.getProviderUserId()));
        CookieManager jar = new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER);
        try (HttpClient http = HttpClient.newBuilder().cookieHandler(jar)
                .followRedirects(HttpClient.Redirect.NEVER).build()) {
            String base = "http://127.0.0.1:" + port;
            HttpResponse<String> authorize = http.send(HttpRequest.newBuilder(URI.create(base
                    + "/api/v1/auth/ssafy/authorize")).GET().build(), HttpResponse.BodyHandlers.ofString());
            assertThat(authorize.statusCode()).isEqualTo(302);
            String state = UriComponentsBuilder.fromUriString(authorize.headers().firstValue("Location").orElseThrow())
                    .build().getQueryParams().getFirst("state");
            String sessionBefore = jar.getCookieStore().getCookies().stream()
                    .filter(cookie -> cookie.getName().equals("JSESSIONID"))
                    .findFirst().orElseThrow().getValue();
            HttpResponse<String> callback = http.send(HttpRequest.newBuilder(URI.create(base
                    + "/api/v1/auth/ssafy/callback?code=fixture-code&state=" + state)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(callback.statusCode()).isEqualTo(200);
            String exchangeCode = mapper.readTree(callback.body()).path("exchangeCode").asText();
            HttpResponse<String> response = http.send(HttpRequest.newBuilder(URI.create(base + "/api/v1/auth/exchange"))
                    .header("Content-Type", "application/json").POST(HttpRequest.BodyPublishers.ofString(
                            mapper.writeValueAsString(Map.of("exchangeCode", exchangeCode)))).build(),
                    HttpResponse.BodyHandlers.ofString());

            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(jwt.verify(mapper.readTree(response.body()).path("accessToken").asText()))
                    .isEqualTo(user.getId());
            assertThat(response.headers().allValues("Set-Cookie").stream()
                    .anyMatch(value -> value.startsWith("ONTOP_REFRESH=")))
                    .isTrue();
            assertThat(jar.getCookieStore().getCookies().stream()
                    .filter(cookie -> cookie.getName().equals("JSESSIONID"))
                    .findFirst().orElseThrow().getValue()).isNotEqualTo(sessionBefore);
        }
    }

    private void assertMemberRejected(LoginOutcome outcome) throws Exception {
        MockHttpSession session = new MockHttpSession();
        String code = code(session, outcome);
        long before = refreshTokens.count();
        exchange(code, session).andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_MEMBER_STATE_CHANGED"))
                .andExpect(header().doesNotExist("Set-Cookie"));
        assertThat(refreshTokens.count()).isEqualTo(before);
    }

    private User fixture() {
        String unique = UUID.randomUUID().toString().replace("-", "");
        return users.saveAndFlush(new User(LoginProvider.SSAFY, "auth89-" + unique,
                unique.substring(0, 8), CharacterGender.MALE));
    }

    private String code(MockHttpSession session, LoginOutcome outcome) {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.setSession(session);
        return codes.issue(request, outcome);
    }

    private ResultActions exchange(String code, MockHttpSession session) throws Exception {
        return mvc.perform(post("/api/v1/auth/exchange").session(session).contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("exchangeCode", code))));
    }

    private String refreshValue(String cookie) {
        return cookie.split(";", 2)[0].substring((RefreshCookieService.NAME + "=").length());
    }

    private static String randomKey() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }
}
