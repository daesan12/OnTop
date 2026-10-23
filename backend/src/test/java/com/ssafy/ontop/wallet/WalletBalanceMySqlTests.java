package com.ssafy.ontop.wallet;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthIdentity;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.auth.service.AuthLogoutPersistenceService;
import com.ssafy.ontop.auth.service.OnboardingTokenStore;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.user.service.UserWithdrawalPersistenceService;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.service.WalletInitializationService;
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
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentLinkedQueue;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.orm.jpa.HibernatePropertiesCustomizer;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.doThrow;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.address=127.0.0.1")
@Import(WalletBalanceMySqlTests.SqlConfiguration.class)
class WalletBalanceMySqlTests {

    @LocalServerPort private int port;
    @Autowired private UserRepository users;
    @Autowired private WalletInitializationService initializer;
    @Autowired private AuthExchangePersistenceService issuer;
    @Autowired private AuthLogoutPersistenceService logout;
    @Autowired private UserWithdrawalPersistenceService withdrawal;
    @Autowired private OnboardingTokenStore onboarding;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper mapper;
    @Autowired private ReadInspector inspector;
    @MockitoSpyBean private WalletRepository wallets;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("지갑 조회 검증은 격리 loopback MySQL DB만 사용합니다.");
        }
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
        registry.add("ontop.auth.jwt-secret-base64", () -> Base64.getEncoder().encodeToString(key));
    }

    @Test
    void 실제_온보딩의_100코인을_HTTP로_조회한다() throws Exception {
        String token = onboarding.issue(new OAuthIdentity(OAuthProvider.SSAFY, "balance-onboard-" + UUID.randomUUID()));
        try (HttpClient client = HttpClient.newHttpClient()) {
            var response = client.send(HttpRequest.newBuilder(uri("/api/v1/users/onboarding"))
                    .header("Authorization", "Bearer " + token).header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(
                            Map.of("nickname", nickname(), "characterGender", "MALE")))).build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(201);
            var body = mapper.readTree(response.body());
            assertBalance(get(body.path("accessToken").asText(), ""), 100, 0, 100);
        }
    }

    @ParameterizedTest
    @ValueSource(longs = {0, 30, 100})
    void 실제_조회는_읽기전용_SELECT만_실행하고_잔액과_원장을_보존한다(long reserved) throws Exception {
        User user = member();
        initializer.initializeActiveMember(user.getId());
        String access = credentials(user).accessToken();
        jdbc.update("UPDATE wallets SET reserved_balance=? WHERE user_id=?", reserved, user.getId());
        var before = wallet(user.getId());
        long entries = ledgerCount();
        long walletCount = wallets.count();

        inspector.start();
        HttpResponse<String> response;
        List<ReadInspector.Statement> statements;
        try {
            response = get(access, "");
        } finally {
            statements = inspector.finish();
        }

        assertBalance(response, 100, reserved, 100 - reserved);
        assertThat(wallet(user.getId())).isEqualTo(before);
        assertThat(ledgerCount()).isEqualTo(entries);
        assertThat(wallets.count()).isEqualTo(walletCount);
        assertThat(statements).isNotEmpty().allSatisfy(statement -> {
            assertThat(statement.sql().stripLeading()).startsWith("select ");
            assertThat(statement.sql()).doesNotContain("for update", "for share", "lock in share mode");
            assertThat(statement.readOnly()).isTrue();
        });
        assertThat(statements).filteredOn(statement -> statement.sql().contains(" from wallets ")).hasSize(1);
    }

    @Test
    void 다른회원의_ID를_보내도_본인지갑만_조회한다() throws Exception {
        User owner = member();
        User other = member();
        initializer.initializeActiveMember(owner.getId());
        initializer.initializeActiveMember(other.getId());
        jdbc.update("UPDATE wallets SET balance=250,reserved_balance=50 WHERE user_id=?", other.getId());
        var otherBefore = wallet(other.getId());

        assertBalance(get(credentials(owner).accessToken(), "?userId=" + other.getId()
                + "&walletId=" + otherBefore.get("id")), 100, 0, 100);
        assertThat(wallet(other.getId())).isEqualTo(otherBefore);
    }

    @Test
    void 지갑이_없는_회원은_409이며_조회로_생성하거나_지급하지_않는다() throws Exception {
        User user = member();
        String access = credentials(user).accessToken();
        long beforeWallets = wallets.count();
        long entries = ledgerCount();

        var response = get(access, "");
        assertThat(response.statusCode()).isEqualTo(409);
        assertThat(mapper.readTree(response.body()).path("code").asText()).isEqualTo("WALLET_NOT_READY");
        assertThat(wallets.findByUserId(user.getId())).isEmpty();
        assertThat(wallets.count()).isEqualTo(beforeWallets);
        assertThat(ledgerCount()).isEqualTo(entries);
    }

    @Test
    void 실제_로그아웃한_sid는_401이며_다른_로그인계열은_유지된다() throws Exception {
        User user = member();
        initializer.initializeActiveMember(user.getId());
        var first = credentials(user);
        var second = credentials(user);
        logout.logout(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(first.refreshToken().getBytes(StandardCharsets.UTF_8))));

        var response = get(first.accessToken(), "");
        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(mapper.readTree(response.body()).path("code").asText()).isEqualTo("AUTH_MEMBER_STATE_CHANGED");
        assertBalance(get(second.accessToken(), ""), 100, 0, 100);
    }

    @Test
    void 실제_탈퇴한_회원의_JWT는_401이며_지갑과_원장은_보존된다() throws Exception {
        User user = member();
        initializer.initializeActiveMember(user.getId());
        String access = credentials(user).accessToken();
        var before = wallet(user.getId());
        long entries = ledgerCount();
        withdrawal.withdraw(user.getId());

        var response = get(access, "");
        assertThat(response.statusCode()).isEqualTo(401);
        assertThat(mapper.readTree(response.body()).path("code").asText()).isEqualTo("AUTH_MEMBER_STATE_CHANGED");
        assertThat(wallet(user.getId())).isEqualTo(before);
        assertThat(ledgerCount()).isEqualTo(entries);
    }

    @Test
    void 지갑_조회장애는_인증성공후에도_안전한503이다() throws Exception {
        User user = member();
        String access = credentials(user).accessToken();
        doThrow(new DataAccessResourceFailureException("private-wallet-database"))
                .when(wallets).findByUserId(user.getId());

        var response = get(access, "");
        assertThat(response.statusCode()).isEqualTo(503);
        assertThat(mapper.readTree(response.body()).path("code").asText()).isEqualTo("WALLET_UNAVAILABLE");
        assertThat(response.body()).doesNotContain("private-", "Exception", "jdbc:");
    }

    private void assertBalance(HttpResponse<String> response, long balance, long reserved, long available)
            throws Exception {
        assertThat(response.statusCode()).isEqualTo(200);
        var body = mapper.readTree(response.body());
        assertThat(body.size()).isEqualTo(3);
        assertThat(body.path("balance").asLong()).isEqualTo(balance);
        assertThat(body.path("reservedBalance").asLong()).isEqualTo(reserved);
        assertThat(body.path("availableBalance").asLong()).isEqualTo(available);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
    }

    private HttpResponse<String> get(String access, String query) throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            return client.send(HttpRequest.newBuilder(uri("/api/v1/wallets/me" + query))
                    .header("Authorization", "Bearer " + access).GET().build(), HttpResponse.BodyHandlers.ofString());
        }
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private User member() {
        return users.saveAndFlush(new User(LoginProvider.SSAFY, "balance-user-" + UUID.randomUUID(),
                nickname(), CharacterGender.MALE));
    }

    private String nickname() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }

    private AuthExchangePersistenceService.Credentials credentials(User user) {
        return issuer.issueExisting(new LoginOutcome(OAuthProvider.SSAFY,
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null));
    }

    private Map<String, Object> wallet(long userId) {
        return jdbc.queryForMap("SELECT * FROM wallets WHERE user_id=?", userId);
    }

    private long ledgerCount() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions", Long.class);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class SqlConfiguration {
        @Bean ReadInspector walletReadInspector() {
            return new ReadInspector();
        }

        @Bean HibernatePropertiesCustomizer walletSqlCustomizer(ReadInspector inspector) {
            return properties -> properties.put("hibernate.session_factory.statement_inspector", inspector);
        }
    }

    static class ReadInspector implements StatementInspector {
        private final ConcurrentLinkedQueue<Statement> statements = new ConcurrentLinkedQueue<>();
        private volatile boolean recording;

        void start() {
            statements.clear();
            recording = true;
        }

        List<Statement> finish() {
            recording = false;
            return List.copyOf(statements);
        }

        @Override
        public String inspect(String sql) {
            if (recording) {
                statements.add(new Statement(sql.toLowerCase(Locale.ROOT),
                        TransactionSynchronizationManager.isCurrentTransactionReadOnly()));
            }
            return sql;
        }

        record Statement(String sql, boolean readOnly) { }
    }
}
