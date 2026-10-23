package com.ssafy.ontop.wallet;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.shop.ShopService;
import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.service.WalletInitializationService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "server.address=127.0.0.1", "ontop.shop.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop"})
class WalletBalanceShopMySqlTests {

    @LocalServerPort private int port;
    @Autowired private UserRepository users;
    @Autowired private WalletInitializationService initializer;
    @Autowired private AuthExchangePersistenceService issuer;
    @Autowired private ShopService shop;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private ObjectMapper mapper;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_SHOP_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_shop_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("상점 연동 조회는 격리 MySQL DB만 사용합니다.");
        }
        byte[] key = new byte[32];
        new SecureRandom().nextBytes(key);
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_SHOP_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_SHOP_DB_PASSWORD"));
        registry.add("ontop.auth.jwt-secret-base64", () -> Base64.getEncoder().encodeToString(key));
    }

    @Test
    void 기존_Shop구매의_차감잔액을_HTTP로_조회하며_예약액과_원장을_바꾸지_않는다() throws Exception {
        String unique = UUID.randomUUID().toString().replace("-", "");
        User user = users.saveAndFlush(new User(LoginProvider.NAVER, "balance-shop-" + unique,
                unique.substring(0, 8), CharacterGender.FEMALE));
        initializer.initializeActiveMember(user.getId());
        String access = issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.EXISTING_MEMBER, user.getId(), null)).accessToken();
        jdbc.update("UPDATE wallets SET reserved_balance=30 WHERE user_id=?", user.getId());
        jdbc.update("""
                INSERT INTO items(item_code,name,item_type,price,image_key,is_for_sale)
                VALUES (?,'잔액조회검증','CONSUMABLE',20,'fixture/balance',TRUE)
                """, unique);
        long itemId = jdbc.queryForObject("SELECT id FROM items WHERE item_code=?", Long.class, unique);

        assertThat(shop.purchase(user.getId(), itemId, 1, "balance_" + unique).balanceAfter()).isEqualTo(80);
        var before = jdbc.queryForMap("SELECT * FROM wallets WHERE user_id=?", user.getId());
        long entries = jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions", Long.class);

        try (HttpClient client = HttpClient.newHttpClient()) {
            var response = client.send(HttpRequest.newBuilder(URI.create(
                    "http://127.0.0.1:" + port + "/api/v1/wallets/me"))
                    .header("Authorization", "Bearer " + access).GET().build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(mapper.readTree(response.body())).isEqualTo(mapper.readTree(
                    "{\"balance\":80,\"reservedBalance\":30,\"availableBalance\":50}"));
        }
        assertThat(jdbc.queryForMap("SELECT * FROM wallets WHERE user_id=?", user.getId())).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions", Long.class)).isEqualTo(entries);

        var receiptBefore = jdbc.queryForList("SELECT * FROM shop_purchases WHERE user_id=?", user.getId());
        try (HttpClient client = HttpClient.newHttpClient()) {
            var response = client.send(HttpRequest.newBuilder(URI.create(
                    "http://127.0.0.1:" + port + "/api/v1/wallets/me/transactions"))
                    .header("Authorization", "Bearer " + access).GET().build(), HttpResponse.BodyHandlers.ofString());
            assertThat(response.statusCode()).isEqualTo(200);
            assertThat(response.headers().firstValue("Cache-Control")).contains("no-store");
            var page = mapper.readTree(response.body());
            assertThat(page.path("transactions").size()).isEqualTo(2);
            var purchase = page.path("transactions").get(0);
            assertThat(purchase.path("transactionType").asText()).isEqualTo("SHOP_PURCHASE");
            assertThat(purchase.path("balanceDelta").asLong()).isEqualTo(-20);
            assertThat(purchase.path("reservedDelta").asLong()).isZero();
            assertThat(purchase.path("itemId").asLong()).isEqualTo(itemId);
            assertThat(purchase.path("gameSessionId").isNull()).isTrue();
            assertThat(purchase.path("minigameSessionId").isNull()).isTrue();
            assertThat(page.path("transactions").get(1).path("transactionType").asText()).isEqualTo("SIGNUP_BONUS");
            assertThat(page.path("nextCursor").isNull()).isTrue();
            assertThat(response.body()).doesNotContain("idempotencyKey", "balanceAfter", "userId", "walletId");
        }
        assertThat(jdbc.queryForList("SELECT * FROM shop_purchases WHERE user_id=?", user.getId()))
                .isEqualTo(receiptBefore);
        assertThat(jdbc.queryForMap("SELECT * FROM wallets WHERE user_id=?", user.getId())).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions", Long.class)).isEqualTo(entries);
    }
}
