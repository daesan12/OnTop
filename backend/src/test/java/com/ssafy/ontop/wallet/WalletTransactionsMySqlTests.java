package com.ssafy.ontop.wallet;

import com.fasterxml.jackson.databind.JsonNode;
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
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import com.ssafy.ontop.wallet.service.WalletInitializationService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "server.address=127.0.0.1")
@Import(WalletBalanceMySqlTests.SqlConfiguration.class)
class WalletTransactionsMySqlTests {
    @LocalServerPort private int port;
    @Autowired private UserRepository users;
    @Autowired private WalletRepository wallets;
    @Autowired private WalletInitializationService initializer;
    @Autowired private AuthExchangePersistenceService issuer;
    @Autowired private AuthLogoutPersistenceService logout;
    @Autowired private UserWithdrawalPersistenceService withdrawal;
    @Autowired private OnboardingTokenStore onboarding;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper mapper;
    @Autowired private WalletBalanceMySqlTests.ReadInspector inspector;
    @MockitoSpyBean private WalletTransactionRepository transactions;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        WalletBalanceMySqlTests.database(registry);
    }

    @Test
    void 실제_온보딩의_SIGNUP_BONUS와_nullable필드와_UTC시각을_조회한다() throws Exception {
        String token = onboarding.issue(new OAuthIdentity(OAuthProvider.SSAFY, "history-" + UUID.randomUUID()));
        try (HttpClient client = HttpClient.newHttpClient()) {
            var created = client.send(HttpRequest.newBuilder(uri("/api/v1/users/onboarding"))
                    .header("Authorization", "Bearer " + token).header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(
                            Map.of("nickname", unique().substring(0, 8), "characterGender", "MALE")))).build(),
                    HttpResponse.BodyHandlers.ofString());
            assertThat(created.statusCode()).isEqualTo(201);
            var page = page(mapper.readTree(created.body()).path("accessToken").asText(), "");
            assertThat(page.path("transactions").size()).isEqualTo(1);
            JsonNode entry = page.path("transactions").get(0);
            assertThat(entry.path("transactionType").asText()).isEqualTo("SIGNUP_BONUS");
            assertThat(entry.path("balanceDelta").asLong()).isEqualTo(100);
            assertThat(entry.path("reservedDelta").asLong()).isZero();
            for (String reference : List.of("itemId", "gameSessionId", "minigameSessionId")) {
                assertThat(entry.path(reference).isNull()).isTrue();
            }
            assertThat(Instant.parse(entry.path("createdAt").asText())).isBeforeOrEqualTo(Instant.now());
            assertThat(page.path("nextCursor").isNull()).isTrue();
            assertThat(page.path("hasNext").asBoolean()).isFalse();
        }
    }

    @Test
    void 원장이_없는_지갑은_빈배열이며_미생성과_구분한다() throws Exception {
        User user = member();
        wallets.saveAndFlush(Wallet.forSignup(user.getId(), Instant.now()));
        var page = page(credentials(user).accessToken(), "");
        assertThat(page.path("transactions").isArray()).isTrue();
        assertThat(page.path("transactions")).isEmpty();
        assertThat(page.path("nextCursor").isNull()).isTrue();
        assertThat(page.path("hasNext").asBoolean()).isFalse();
    }

    @Test
    void 기본20과_최대100_페이지는_내림차순이며_새거래가_끼어도_중복누락이_없다() throws Exception {
        User owner = initialized();
        long walletId = wallets.findByUserId(owner.getId()).orElseThrow().id();
        // 0원 원장은 페이지 경계 확인용 fixture이며 실제 구매 기능은 별도 Shop 통합 테스트로 확인한다.
        transactions.saveAllAndFlush(IntStream.range(0, 104).mapToObj(index ->
                new WalletTransaction(walletId, 77, 0, "history:" + unique())).toList());
        User other = initialized();
        long otherWallet = wallets.findByUserId(other.getId()).orElseThrow().id();
        String access = credentials(owner).accessToken();
        List<Long> expected = idsInDatabase(walletId);

        var first = page(access, "?userId=" + other.getId() + "&walletId=" + otherWallet);
        assertThat(ids(first)).containsExactlyElementsOf(expected.subList(0, 20));
        assertThat(first.path("hasNext").asBoolean()).isTrue();
        assertThat(first.path("nextCursor").asLong()).isEqualTo(expected.get(19));

        transactions.saveAndFlush(new WalletTransaction(walletId, 77, 0, "history:" + unique()));
        var next = page(access, "?cursor=" + first.path("nextCursor").asLong() + "&size=100");
        assertThat(ids(next)).containsExactlyElementsOf(expected.subList(20, 105));
        assertThat(next.path("hasNext").asBoolean()).isFalse();
        assertThat(next.path("nextCursor").isNull()).isTrue();
        var combined = new ArrayList<>(ids(first));
        combined.addAll(ids(next));
        assertThat(combined).doesNotHaveDuplicates().containsExactlyElementsOf(expected);

        var maximum = page(access, "?size=100");
        assertThat(ids(maximum)).hasSize(100).isSortedAccordingTo(java.util.Comparator.reverseOrder());
        assertThat(maximum.path("nextCursor").asLong()).isEqualTo(ids(maximum).getLast());
        var last = page(access, "?cursor=" + maximum.path("nextCursor").asLong() + "&size=100");
        assertThat(ids(last)).hasSize(6).doesNotContainAnyElementsOf(ids(maximum));
        assertThat(last.path("nextCursor").isNull()).isTrue();
        var pastEnd = page(access, "?cursor=" + ids(last).getLast());
        assertThat(ids(pastEnd)).isEmpty();
    }

    @Test
    void 조회는_COUNT와_쓰기잠금없는_읽기전용_투영이며_기존복합인덱스를_사용한다() throws Exception {
        User user = initialized();
        long walletId = wallets.findByUserId(user.getId()).orElseThrow().id();
        String access = credentials(user).accessToken();
        jdbc.update("UPDATE wallets SET reserved_balance=30 WHERE id=?", walletId);
        var before = jdbc.queryForMap("SELECT * FROM wallets WHERE id=?", walletId);
        long count = transactions.count();

        inspector.start();
        List<WalletBalanceMySqlTests.ReadInspector.Statement> statements;
        try {
            page(access, "?size=1");
        } finally {
            statements = inspector.finish();
        }
        assertThat(statements).isNotEmpty().allSatisfy(statement -> {
            assertThat(statement.sql()).startsWith("select ").doesNotContain("count(", "for update", "for share");
            assertThat(statement.readOnly()).isTrue();
        });
        var history = statements.stream().filter(statement -> statement.sql().contains(" from wallet_transactions "))
                .toList();
        assertThat(history).hasSize(1);
        assertThat(history.getFirst().sql()).contains("wallet_id=?", "id<?", "order by", "desc", "limit ?")
                .doesNotContain("idempotency_key");
        assertThat(jdbc.queryForMap("SELECT * FROM wallets WHERE id=?", walletId)).isEqualTo(before);
        assertThat(transactions.count()).isEqualTo(count);
        assertThat(jdbc.queryForList("""
                SELECT column_name FROM information_schema.statistics
                WHERE table_schema=DATABASE() AND table_name='wallet_transactions'
                AND index_name='ix_wallet_transactions_wallet_id' ORDER BY seq_in_index
                """, String.class)).containsExactly("wallet_id", "id");
        var plan = jdbc.queryForMap("""
                EXPLAIN SELECT id, transaction_type, balance_delta, reserved_delta, item_id,
                game_session_id, minigame_session_id, created_at FROM wallet_transactions
                WHERE wallet_id=? AND (? IS NULL OR id < ?) ORDER BY id DESC LIMIT 21
                """, walletId, Long.MAX_VALUE, Long.MAX_VALUE);
        assertThat(plan.get("key")).isEqualTo("ix_wallet_transactions_wallet_id");
    }

    @Test
    void 참조ID와_밀리초_시각은_추가엔티티_조회없이_그대로_반환한다() throws Exception {
        User user = initialized();
        long walletId = wallets.findByUserId(user.getId()).orElseThrow().id();
        com.ssafy.ontop.game.TestGameSessions.reference(jdbc, 88);
        jdbc.update("""
                INSERT INTO wallet_transactions(wallet_id,transaction_type,balance_delta,reserved_delta,
                item_id,game_session_id,minigame_session_id,idempotency_key,created_at)
                VALUES (?,'SHOP_PURCHASE',0,0,77,88,99,?,?)
                """, walletId, "history:" + unique(), java.sql.Timestamp.from(Instant.parse("2026-10-23T10:00:00.123Z")));
        var entry = page(credentials(user).accessToken(), "?size=1").path("transactions").get(0);
        assertThat(entry.path("itemId").asLong()).isEqualTo(77);
        assertThat(entry.path("gameSessionId").asLong()).isEqualTo(88);
        assertThat(entry.path("minigameSessionId").asLong()).isEqualTo(99);
        assertThat(entry.path("createdAt").asText()).isEqualTo("2026-10-23T10:00:00.123Z");
        assertThat(entry.size()).isEqualTo(8);
    }

    @Test
    void 지갑미생성은_409이며_조회로_생성하지_않는다() throws Exception {
        User user = member();
        long count = transactions.count();
        error(get(credentials(user).accessToken(), ""), 409, "WALLET_NOT_READY");
        assertThat(wallets.findByUserId(user.getId())).isEmpty();
        assertThat(transactions.count()).isEqualTo(count);
    }

    @Test
    void 실제_로그아웃_sid는_401이며_다른_로그인계열은_정상조회한다() throws Exception {
        User user = initialized();
        var first = credentials(user);
        var second = credentials(user);
        logout.logout(HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(first.refreshToken().getBytes(StandardCharsets.UTF_8))));
        error(get(first.accessToken(), ""), 401, "AUTH_MEMBER_STATE_CHANGED");
        assertThat(ids(page(second.accessToken(), ""))).hasSize(1);
    }

    @Test
    void 실제_탈퇴회원은_401이며_원장은_보존한다() throws Exception {
        User user = initialized();
        String access = credentials(user).accessToken();
        long count = transactions.count();
        withdrawal.withdraw(user.getId());
        error(get(access, ""), 401, "AUTH_MEMBER_STATE_CHANGED");
        assertThat(transactions.count()).isEqualTo(count);
    }

    @Test
    void 실제_원장Repository_장애는_안전한503이다() throws Exception {
        User user = initialized();
        long walletId = wallets.findByUserId(user.getId()).orElseThrow().id();
        doThrow(new DataAccessResourceFailureException("private-history-db"))
                .when(transactions).findHistory(eq(walletId), any(), any());
        error(get(credentials(user).accessToken(), ""), 503, "WALLET_UNAVAILABLE");
    }

    private User member() {
        return users.saveAndFlush(new User(LoginProvider.SSAFY, "history-" + unique(),
                unique().substring(0, 8), CharacterGender.MALE));
    }

    private User initialized() {
        User user = member();
        initializer.initializeActiveMember(user.getId());
        return user;
    }

    private AuthExchangePersistenceService.Credentials credentials(User user) {
        return issuer.issueExisting(new LoginOutcome(OAuthProvider.SSAFY,
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null));
    }

    private List<Long> idsInDatabase(long walletId) {
        return jdbc.queryForList("SELECT id FROM wallet_transactions WHERE wallet_id=? ORDER BY id DESC",
                Long.class, walletId);
    }

    private List<Long> ids(JsonNode page) {
        List<Long> result = new ArrayList<>();
        page.path("transactions").forEach(row -> result.add(row.path("transactionId").asLong()));
        return result;
    }

    private JsonNode page(String access, String query) throws Exception {
        var response = get(access, query);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.headers().firstValue("Set-Cookie")).isEmpty();
        assertThat(response.body()).doesNotContain("idempotencyKey", "walletId", "userId", "balanceAfter");
        return mapper.readTree(response.body());
    }

    private void error(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(mapper.readTree(response.body()).path("code").asText()).isEqualTo(code);
        assertThat(mapper.readTree(response.body()).size()).isEqualTo(2);
        assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(response.body()).doesNotContain("private-", "jdbc:", "Exception");
    }

    private HttpResponse<String> get(String access, String query) throws Exception {
        try (HttpClient client = HttpClient.newHttpClient()) {
            return client.send(HttpRequest.newBuilder(uri("/api/v1/wallets/me/transactions" + query))
                    .header("Authorization", "Bearer " + access).GET().build(), HttpResponse.BodyHandlers.ofString());
        }
    }

    private URI uri(String path) {
        return URI.create("http://127.0.0.1:" + port + path);
    }

    private String unique() {
        return UUID.randomUUID().toString().replace("-", "");
    }
}
