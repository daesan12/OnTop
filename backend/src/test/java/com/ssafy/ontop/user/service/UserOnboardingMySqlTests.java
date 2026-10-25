package com.ssafy.ontop.user.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.client.OAuthProviderClient;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.domain.RefreshToken;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.repository.RefreshTokenRepository;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.auth.service.OnboardingTokenStore;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.net.CookieManager;
import java.net.CookiePolicy;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
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
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.web.util.UriComponentsBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "ontop.oauth.ssafy.client-id=fixture-ssafy",
        "ontop.oauth.naver.client-id=fixture-naver",
        "ontop.oauth.frontend-callback-uri="
})
class UserOnboardingMySqlTests {

    private static final String TEST_KEY = randomKey();

    @Autowired
    private MockMvc mvc;
    @Autowired
    private ObjectMapper mapper;
    @MockitoSpyBean
    private UserRepository users;
    @Autowired
    private OnboardingTokenStore tokens;
    @MockitoSpyBean
    private AccessJwtService jwt;
    @MockitoSpyBean
    private RefreshTokenRepository refresh;
    @MockitoSpyBean
    private WalletRepository wallets;
    @MockitoSpyBean
    private WalletTransactionRepository walletTransactions;
    @MockitoBean
    private OAuthProviderClient provider;
    @Autowired
    private AuthExchangePersistenceService credentials;
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
            throw new IllegalStateException("온보딩 MySQL 테스트는 전용 loopback 검증 DB만 사용합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
        registry.add("ontop.auth.jwt-secret-base64", () -> TEST_KEY);
    }

    @ParameterizedTest
    @EnumSource(OAuthProvider.class)
    void 신규_회원과_Refresh를_함께_생성하고_JWT와_FK와_원문_미저장을_확인한다(OAuthProvider login)
            throws Exception {
        OAuthIdentity identity = identity(login);
        String token = token(identity);
        String nickname = nickname();
        long beforeUsers = users.count();
        long beforeRefresh = refresh.count();

        MvcResult result = onboard(token, nickname).andExpect(status().isCreated())
                .andExpect(jsonPath("$.characterGender").value("FEMALE")).andReturn();

        JsonNode body = mapper.readTree(result.getResponse().getContentAsString());
        User user = users.findByLoginProviderAndProviderUserId(login.loginProvider(), identity.providerUserId())
                .orElseThrow();
        assertThat(jwt.verify(body.path("accessToken").asText())).isEqualTo(user.getId());
        assertThat(body.path("userId").asLong()).isEqualTo(user.getId());
        assertThat(user.getNickname()).isEqualTo(nickname);
        assertThat(user.getCharacterGender()).isEqualTo(CharacterGender.FEMALE);
        assertThat(user.getCreatedAt()).isNotNull().isEqualTo(user.getUpdatedAt());
        assertThat(user.getDeletedAt()).isNull();
        var wallet = wallets.findByUserId(user.getId()).orElseThrow();
        assertThat(wallet.balance()).isEqualTo(100);
        assertThat(wallet.reserved()).isZero();
        assertThat(jdbc.queryForMap("""
                SELECT transaction_type,balance_delta,reserved_delta FROM wallet_transactions
                WHERE wallet_id=? AND idempotency_key=?
                """, wallet.id(), "signup:" + user.getId()))
                .containsEntry("transaction_type", "SIGNUP_BONUS")
                .containsEntry("balance_delta", 100L).containsEntry("reserved_delta", 0L);
        String raw = result.getResponse().getHeader("Set-Cookie").split(";", 2)[0].substring("ONTOP_REFRESH=".length());
        RefreshToken stored = refresh.findByTokenHash(digest(raw)).orElseThrow();
        assertThat(stored.getUserId()).isEqualTo(user.getId());
        assertThat(jwt.verifyAccess(body.path("accessToken").asText()).sessionId()).isEqualTo(stored.getSessionId());
        assertThat(stored.getTokenHash()).hasSize(64).isNotEqualTo(raw);
        assertThat(stored.getExpiresAt()).isEqualTo(stored.getCreatedAt().plusSeconds(604800));
        assertThat(stored.getRevokedAt()).isNull();
        assertThat(users.count()).isEqualTo(beforeUsers + 1);
        assertThat(refresh.count()).isEqualTo(beforeRefresh + 1);
        assertThat(body.has("providerUserId") || body.has("refreshToken") || body.has("onboardingToken")).isFalse();
        onboard(token, nickname).andExpect(status().isUnauthorized());
    }

    @Test
    void 대소문자만_다른_닉네임은_중복이며_기존_회원과_Refresh를_보존한다() throws Exception {
        String nickname = "Ab" + nickname().substring(0, 6);
        User existing = fixture(nickname);
        long beforeUsers = users.count();
        long beforeRefresh = refresh.count();
        String token = token(identity(OAuthProvider.SSAFY));

        onboard(token, nickname.toLowerCase()).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("USER_NICKNAME_ALREADY_EXISTS"));

        assertThat(users.findById(existing.getId()).orElseThrow().getNickname()).isEqualTo(nickname);
        assertThat(users.count()).isEqualTo(beforeUsers);
        assertThat(refresh.count()).isEqualTo(beforeRefresh);
        onboard(token, nickname()).andExpect(status().isCreated());
        assertThat(users.count()).isEqualTo(beforeUsers + 1);
        assertThat(refresh.count()).isEqualTo(beforeRefresh + 1);
        onboard(token, nickname()).andExpect(status().isUnauthorized());
    }

    @Test
    void 탈퇴한_계정의_닉네임도_중복이며_탈퇴상태를_변경하지_않는다() throws Exception {
        String nickname = nickname();
        User existing = fixture(nickname);
        jdbc.update("UPDATE users SET deleted_at = UTC_TIMESTAMP(3) WHERE id = ?", existing.getId());
        String token = token(identity(OAuthProvider.SSAFY));

        onboard(token, nickname).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("USER_NICKNAME_ALREADY_EXISTS"));

        assertThat(users.findById(existing.getId()).orElseThrow().getDeletedAt()).isNotNull();
        onboard(token, nickname()).andExpect(status().isCreated());
    }

    @Test
    void 같은_소셜계정은_새_토큰으로도_중복_가입하지_못한다() throws Exception {
        OAuthIdentity identity = identity(OAuthProvider.SSAFY);
        onboard(token(identity), nickname()).andExpect(status().isCreated());
        long beforeUsers = users.count();
        long beforeRefresh = refresh.count();

        String duplicate = token(identity);
        onboard(duplicate, nickname()).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("USER_ALREADY_REGISTERED"));
        onboard(duplicate, nickname()).andExpect(status().isUnauthorized());

        assertThat(users.count()).isEqualTo(beforeUsers);
        assertThat(refresh.count()).isEqualTo(beforeRefresh);
    }

    @Test
    void 다른_공급자의_같은_식별자는_별도_회원으로_가입한다() throws Exception {
        String providerId = "onboard91-shared-" + UUID.randomUUID();
        for (OAuthProvider login : OAuthProvider.values()) {
                onboard(token(new OAuthIdentity(login, providerId)), nickname())
                    .andExpect(status().isCreated());
        }
        assertThat(users.findByLoginProviderAndProviderUserId(LoginProvider.SSAFY, providerId)).isPresent();
        assertThat(users.findByLoginProviderAndProviderUserId(LoginProvider.NAVER, providerId)).isPresent();
    }

    @Test
    void 같은_소셜계정의_동시_가입은_하나만_성공하고_식별자를_로그에_남기지_않는다(CapturedOutput output)
            throws Exception {
        OAuthIdentity identity = identity(OAuthProvider.SSAFY);
        long beforeUsers = users.count();
        long beforeRefresh = refresh.count();
        String firstToken = token(identity);
        String secondToken = token(identity);

        List<Integer> results = race(() -> onboard(firstToken, nickname()).andReturn().getResponse().getStatus(),
                () -> onboard(secondToken, nickname()).andReturn().getResponse().getStatus());

        assertThat(results).containsExactlyInAnyOrder(201, 409);
        assertThat(users.count()).isEqualTo(beforeUsers + 1);
        assertThat(refresh.count()).isEqualTo(beforeRefresh + 1);
        assertThat(output.getAll()).doesNotContain(identity.providerUserId(), firstToken, secondToken);
    }

    @Test
    void 대소문자가_다른_닉네임의_동시_가입은_한_회원과_Refresh만_만든다() throws Exception {
        String nickname = "Ab" + nickname().substring(0, 6);
        OAuthIdentity one = identity(OAuthProvider.SSAFY);
        OAuthIdentity two = identity(OAuthProvider.NAVER);
        String firstToken = token(one);
        String secondToken = token(two);
        long beforeUsers = users.count();
        long beforeRefresh = refresh.count();

        List<Integer> results = race(() -> onboard(firstToken, nickname).andReturn().getResponse().getStatus(),
                () -> onboard(secondToken, nickname.toLowerCase()).andReturn().getResponse().getStatus());

        assertThat(results).containsExactlyInAnyOrder(201, 409);
        assertThat(users.count()).isEqualTo(beforeUsers + 1);
        assertThat(refresh.count()).isEqualTo(beforeRefresh + 1);
        String retry = results.getFirst() == 409 ? firstToken : secondToken;
        onboard(retry, nickname()).andExpect(status().isCreated());
        assertThat(users.count()).isEqualTo(beforeUsers + 2);
        assertThat(refresh.count()).isEqualTo(beforeRefresh + 2);
    }

    @Test
    void 사전조회_직후_다른_소셜계정이_닉네임을_선점한_DB_UNIQUE_충돌도_재시도한다() throws Exception {
        String nickname = nickname();
        OAuthIdentity identity = identity(OAuthProvider.SSAFY);
        String token = token(identity);
        long beforeUsers = users.count();
        long beforeRefresh = refresh.count();
        AtomicBoolean inserted = new AtomicBoolean();
        doAnswer(invocation -> {
            boolean exists = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE nickname = ?",
                    Long.class, nickname) > 0;
            if (!exists && inserted.compareAndSet(false, true)) {
                // 별도 연결에서 사전 조회 뒤 먼저 커밋하여 실제 MySQL UNIQUE 실패를 강제한다.
                try (var executor = Executors.newSingleThreadExecutor()) {
                    executor.submit(() -> jdbc.update("""
                            INSERT INTO users (login_provider, provider_user_id, nickname, character_gender,
                                created_at, updated_at)
                            VALUES ('NAVER', ?, ?, 'MALE', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
                            """, "onboard91-race-" + UUID.randomUUID(), nickname)).get(10, TimeUnit.SECONDS);
                }
            }
            return exists;
        }).when(users).existsByNickname(nickname);

        onboard(token, nickname).andExpect(status().isConflict())
                .andExpect(jsonPath("$.code").value("USER_NICKNAME_ALREADY_EXISTS"))
                .andExpect(header().doesNotExist("Set-Cookie"));

        assertThat(inserted).isTrue();
        assertThat(users.findByLoginProviderAndProviderUserId(LoginProvider.SSAFY, identity.providerUserId()))
                .isEmpty();
        assertThat(users.count()).isEqualTo(beforeUsers + 1);
        assertThat(refresh.count()).isEqualTo(beforeRefresh);
        onboard(token, nickname()).andExpect(status().isCreated());
        assertThat(users.count()).isEqualTo(beforeUsers + 2);
        assertThat(refresh.count()).isEqualTo(beforeRefresh + 1);
        onboard(token, nickname()).andExpect(status().isUnauthorized());
    }

    @Test
    void 같은_토큰의_동시_가입은_한번만_커밋한다() throws Exception {
        OAuthIdentity identity = identity(OAuthProvider.SSAFY);
        String token = token(identity);
        long beforeUsers = users.count();
        long beforeRefresh = refresh.count();

        List<Integer> results = race(() -> onboard(token, nickname()).andReturn().getResponse().getStatus(),
                () -> onboard(token, nickname()).andReturn().getResponse().getStatus());

        assertThat(results).containsExactlyInAnyOrder(201, 401);
        assertThat(users.count()).isEqualTo(beforeUsers + 1);
        assertThat(refresh.count()).isEqualTo(beforeRefresh + 1);
    }

    @Test
    void Refresh_저장_실패는_users_INSERT도_롤백하고_토큰을_복원하지_않는다() throws Exception {
        OAuthIdentity identity = identity(OAuthProvider.SSAFY);
        String token = token(identity);
        long beforeUsers = users.count();
        long beforeRefresh = refresh.count();
        long beforeWallets = wallets.count();
        long beforeLedger = walletTransactions.count();
        doThrow(new DataAccessResourceFailureException("fixture-private-refresh-store"))
                .when(refresh).saveAndFlush(any());

        MvcResult result = onboard(token, nickname()).andExpect(status().isServiceUnavailable())
                .andExpect(header().doesNotExist("Set-Cookie")).andReturn();

        assertThat(users.findByLoginProviderAndProviderUserId(LoginProvider.SSAFY, identity.providerUserId()))
                .isEmpty();
        assertThat(users.count()).isEqualTo(beforeUsers);
        assertThat(refresh.count()).isEqualTo(beforeRefresh);
        assertThat(wallets.count()).isEqualTo(beforeWallets);
        assertThat(walletTransactions.count()).isEqualTo(beforeLedger);
        assertThat(result.getResponse().getContentAsString()).doesNotContain("accessToken", "fixture-private");
        onboard(token, nickname()).andExpect(status().isUnauthorized());
    }

    @Test
    void JWT_발급_실패도_users와_Refresh를_롤백한다() throws Exception {
        OAuthIdentity identity = identity(OAuthProvider.SSAFY);
        String token = token(identity);
        long beforeUsers = users.count();
        long beforeRefresh = refresh.count();
        long beforeWallets = wallets.count();
        long beforeLedger = walletTransactions.count();
        doThrow(new AuthExchangeException(AuthExchangeException.Error.CONFIGURATION))
                .when(jwt).issue(anyLong(), anyString());

        onboard(token, nickname()).andExpect(status().isInternalServerError())
                .andExpect(header().doesNotExist("Set-Cookie"));

        assertThat(users.count()).isEqualTo(beforeUsers);
        assertThat(refresh.count()).isEqualTo(beforeRefresh);
        assertThat(wallets.count()).isEqualTo(beforeWallets);
        assertThat(walletTransactions.count()).isEqualTo(beforeLedger);
        assertThat(users.findByLoginProviderAndProviderUserId(LoginProvider.SSAFY, identity.providerUserId()))
                .isEmpty();
        onboard(token, nickname()).andExpect(status().isUnauthorized());
    }

    @ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(strings = {"wallet", "ledger"})
    void 지갑이나_가입원장_실패는_회원과_인증까지_롤백한다(String failure) throws Exception {
        long beforeUsers = users.count();
        long beforeRefresh = refresh.count();
        long beforeWallets = wallets.count();
        long beforeLedger = walletTransactions.count();
        if (failure.equals("wallet")) {
            doThrow(new DataAccessResourceFailureException("fixture-wallet-store"))
                    .when(wallets).saveAndFlush(any());
        } else {
            doThrow(new DataAccessResourceFailureException("fixture-ledger-store"))
                    .when(walletTransactions).saveAndFlush(any());
        }
        String token = token(identity(OAuthProvider.SSAFY));

        onboard(token, nickname()).andExpect(status().isServiceUnavailable())
                .andExpect(header().doesNotExist("Set-Cookie"));

        assertThat(users.count()).isEqualTo(beforeUsers);
        assertThat(refresh.count()).isEqualTo(beforeRefresh);
        assertThat(wallets.count()).isEqualTo(beforeWallets);
        assertThat(walletTransactions.count()).isEqualTo(beforeLedger);
        onboard(token, nickname()).andExpect(status().isUnauthorized());
    }

    @Test
    void 인증_발급은_호출자_트랜잭션이_없으면_거절하며_현재_마이그레이션을_유지한다() {
        User user = new User(LoginProvider.SSAFY, "onboard91-unpersisted", nickname(), CharacterGender.MALE);
        assertThatThrownBy(() -> credentials.issueForNewUser(user))
                .isInstanceOf(IllegalTransactionStateException.class);
        assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("6");
        assertThat(flyway.migrate().migrationsExecuted).isZero();
    }

    @ParameterizedTest
    @EnumSource(OAuthProvider.class)
    void 실제_HTTP_교환은_세션을_쓰고_온보딩은_쿠키없이_가입후_재로그인한다(OAuthProvider login) throws Exception {
        OAuthIdentity identity = identity(login);
        when(provider.identify(eq(login), anyString(), anyString())).thenReturn(identity);
        CookieManager jar = new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER);
        String base = "http://127.0.0.1:" + port;
        try (HttpClient http = HttpClient.newBuilder().cookieHandler(jar)
                .followRedirects(HttpClient.Redirect.NEVER).build()) {
            HttpResponse<String> authorize = http.send(HttpRequest.newBuilder(URI.create(base
                    + "/api/v1/auth/" + login.path() + "/authorize")).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(authorize.statusCode()).isEqualTo(302);
            assertThat(jar.getCookieStore().getCookies().stream()
                    .filter(cookie -> cookie.getName().equals("JSESSIONID")).findFirst().orElseThrow().getPath())
                    .isEqualTo("/api/v1/auth");
            String state = UriComponentsBuilder.fromUriString(authorize.headers().firstValue("Location").orElseThrow())
                    .build().getQueryParams().getFirst("state");
            HttpResponse<String> callback = http.send(HttpRequest.newBuilder(URI.create(base
                    + "/api/v1/auth/" + login.path() + "/callback?code=fixture-code&state=" + state)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(callback.statusCode()).isEqualTo(200);
            String code = mapper.readTree(callback.body()).path("exchangeCode").asText();
            HttpResponse<String> exchanged = json(http, base + "/api/v1/auth/exchange",
                    Map.of("exchangeCode", code), null);
            assertThat(exchanged.statusCode()).isEqualTo(200);
            JsonNode interim = mapper.readTree(exchanged.body());
            assertThat(interim.path("status").asText()).isEqualTo("ONBOARDING_REQUIRED");
            String token = interim.path("onboardingToken").asText();
            CookieManager independentJar = new CookieManager(null, CookiePolicy.ACCEPT_ORIGINAL_SERVER);
            try (HttpClient independent = HttpClient.newBuilder().cookieHandler(independentJar).build()) {
                assertThat(independentJar.getCookieStore().getCookies()).isEmpty();
                HttpResponse<String> enrolled = json(independent, base + "/api/v1/users/onboarding",
                        Map.of("nickname", nickname(), "characterGender", "MALE"), token);

                assertThat(enrolled.statusCode()).isEqualTo(201);
                assertThat(enrolled.headers().firstValue("Cache-Control").orElseThrow()).isEqualTo("no-store");
                JsonNode body = mapper.readTree(enrolled.body());
                assertThat(jwt.verify(body.path("accessToken").asText())).isEqualTo(body.path("userId").asLong());
                assertThat(enrolled.headers().allValues("Set-Cookie").stream()
                        .anyMatch(value -> value.startsWith("ONTOP_REFRESH=") && value.contains("Path=/api/v1/auth")))
                        .isTrue();
                assertThat(enrolled.headers().allValues("Set-Cookie"))
                        .noneMatch(value -> value.startsWith("JSESSIONID="));
                assertThat(independentJar.getCookieStore().getCookies().stream()
                        .filter(cookie -> cookie.getName().equals("ONTOP_REFRESH")).findFirst().orElseThrow().getPath())
                        .isEqualTo("/api/v1/auth");
                assertThat(json(independent, base + "/api/v1/users/onboarding",
                        Map.of("nickname", nickname(), "characterGender", "MALE"), token).statusCode()).isEqualTo(401);

                HttpResponse<String> reauthorize = http.send(HttpRequest.newBuilder(URI.create(base
                        + "/api/v1/auth/" + login.path() + "/authorize")).GET().build(),
                        HttpResponse.BodyHandlers.ofString());
                String nextState = UriComponentsBuilder.fromUriString(
                        reauthorize.headers().firstValue("Location").orElseThrow())
                        .build().getQueryParams().getFirst("state");
                HttpResponse<String> recallback = http.send(HttpRequest.newBuilder(URI.create(base
                        + "/api/v1/auth/" + login.path() + "/callback?code=fixture-code&state=" + nextState))
                        .GET().build(), HttpResponse.BodyHandlers.ofString());
                assertThat(recallback.statusCode()).isEqualTo(200);
                HttpResponse<String> loggedIn = json(http, base + "/api/v1/auth/exchange", Map.of("exchangeCode",
                        mapper.readTree(recallback.body()).path("exchangeCode").asText()), null);
                assertThat(loggedIn.statusCode()).isEqualTo(200);
                JsonNode authenticated = mapper.readTree(loggedIn.body());
                assertThat(authenticated.path("status").asText()).isEqualTo("AUTHENTICATED");
                assertThat(jwt.verify(authenticated.path("accessToken").asText()))
                        .isEqualTo(body.path("userId").asLong());
            }
        }
    }

    private HttpResponse<String> json(HttpClient http, String url, Map<String, String> body, String token)
            throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(url))
                .header("Content-Type", "application/json");
        if (token != null) {
            request.header("Authorization", "Bearer " + token);
        }
        return http.send(request.POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body))).build(),
                HttpResponse.BodyHandlers.ofString());
    }

    private List<Integer> race(Callable<Integer> first, Callable<Integer> second) throws Exception {
        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var calls = List.of(first, second).stream().map(call -> (Callable<Integer>) () -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS)) {
                    throw new IllegalStateException("테스트 동시 요청 시작 대기 실패");
                }
                return call.call();
            }).map(executor::submit).toList();
            assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            return List.of(calls.getFirst().get(20, TimeUnit.SECONDS), calls.getLast().get(20, TimeUnit.SECONDS));
        }
    }

    private ResultActions onboard(String token, String nickname) throws Exception {
        return mvc.perform(post("/api/v1/users/onboarding").header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(mapper.writeValueAsString(Map.of("nickname", nickname, "characterGender", "FEMALE"))));
    }

    private String token(OAuthIdentity identity) {
        return tokens.issue(identity);
    }

    private User fixture(String nickname) {
        return users.saveAndFlush(new User(LoginProvider.SSAFY, "onboard91-existing-" + UUID.randomUUID(),
                nickname, CharacterGender.MALE));
    }

    private OAuthIdentity identity(OAuthProvider login) {
        return new OAuthIdentity(login, "onboard91-" + UUID.randomUUID());
    }

    private String nickname() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }

    private String digest(String raw) throws Exception {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(raw.getBytes(StandardCharsets.UTF_8)));
    }

    private static String randomKey() {
        byte[] bytes = new byte[32];
        new SecureRandom().nextBytes(bytes);
        return Base64.getEncoder().encodeToString(bytes);
    }
}
