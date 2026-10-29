package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.minigame.repository.MinigameRepository;
import com.ssafy.ontop.shop.repository.ShopRepository;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;

/** 실제 HTTP/JPA/MySQL 동작 검증. 잠금 뒤 대기와 실패 주입만 테스트에서 제어한다. */
@Tag("mysql")
@EnabledIfEnvironmentVariable(named = "TEST_WALLET_FLOW", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=dev,db", "SHOP_ENABLED=true", "ontop.behavior-log.enabled=false",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop,classpath:db/minigame",
        "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class ShopRewardConcurrencyMySqlTests {
    enum Order { PURCHASE_FIRST, REWARD_FIRST, PURCHASE_ROLLBACK }

    @Autowired JdbcTemplate jdbc;
    @Autowired AuthExchangePersistenceService issuer;
    @MockitoSpyBean ShopRepository purchases;
    @MockitoSpyBean MinigameRepository rewards;
    @LocalServerPort int port;
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry properties) {
        String url = System.getenv("TEST_WALLET_FLOW_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_wallet_flow_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("새 loopback ontop_wallet_flow_test_ 전용 DB가 필요합니다.");
        }
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.username", () -> System.getenv("TEST_WALLET_FLOW_DB_USERNAME"));
        properties.add("spring.datasource.password", () -> System.getenv("TEST_WALLET_FLOW_DB_PASSWORD"));
    }

    @ParameterizedTest
    @EnumSource(Order.class)
    void 구매와_보상은_같은지갑에서_잠금대기후_커밋하거나_롤백하고_재시도한다(Order order) throws Exception {
        long user = 101 + order.ordinal();
        seed(user);
        String token = issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.EXISTING_MEMBER, user, null)).accessToken();
        var started = request(token, "/api/v1/minigames/sessions", "{\"minigameType\":\"BUNGEOPPANG\"}",
                "start-" + user);
        assertThat(started.statusCode()).isEqualTo(201);
        var start = json.readTree(started.body());
        long session = start.path("minigameSessionId").asLong();
        var heats = json.convertValue(start.path("heats"),
                new com.fasterxml.jackson.core.type.TypeReference<List<Integer>>() { });
        String submission = BungeoppangFixtures.sevenGolden(heats).toString();
        // 새 테스트 세션만 종료 시각에 도달시킨다. 제품 시계·기존 데이터는 변경하지 않는다.
        jdbc.update("UPDATE minigame_sessions SET started_at=TIMESTAMPADD(SECOND,-65,UTC_TIMESTAMP(3)) WHERE id=?",
                session);
        String purchaseBody = "{\"itemId\":" + user + ",\"quantity\":1}";
        Callable<HttpResponse<String>> purchase = () -> request(token, "/api/v1/shop/purchases", purchaseBody,
                "purchase-" + user);
        Callable<HttpResponse<String>> reward = () -> request(token,
                "/api/v1/minigames/sessions/" + session + "/complete", submission, null);
        var held = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        pauseAfterLock(order, user, held, release);
        boolean rollback = order == Order.PURCHASE_ROLLBACK;
        if (rollback) {
            long wallet = jdbc.queryForObject("SELECT id FROM wallets WHERE user_id=?", Long.class, user);
            // 이 테스트 회원의 구매 원장만 실패시킨다. 앞 시나리오의 원장·보상은 허용한다.
            jdbc.execute("ALTER TABLE wallet_transactions ADD CONSTRAINT ck_wallet_flow_purchase CHECK "
                    + "(wallet_id <> " + wallet + " OR transaction_type <> 'SHOP_PURCHASE')");
        }

        HttpResponse<String> purchaseResponse;
        HttpResponse<String> rewardResponse;
        try {
            try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
                var first = executor.submit(order == Order.REWARD_FIRST ? reward : purchase);
                Future<HttpResponse<String>> second;
                try {
                    assertThat(held.await(5, TimeUnit.SECONDS)).isTrue();
                    second = executor.submit(order == Order.REWARD_FIRST ? purchase : reward);
                    // 호출 시작만으로 동시성을 주장하지 않고 실제 InnoDB 행 잠금 대기를 확인한다.
                    await().pollInterval(Duration.ofMillis(20)).atMost(Duration.ofSeconds(5))
                            .until(() -> waitingWalletLocks() > 0);
                    assertThat(second.isDone()).isFalse();
                } finally {
                    release.countDown();
                }
                var firstResponse = first.get(10, TimeUnit.SECONDS);
                var secondResponse = second.get(10, TimeUnit.SECONDS);
                purchaseResponse = order == Order.REWARD_FIRST ? secondResponse : firstResponse;
                rewardResponse = order == Order.REWARD_FIRST ? firstResponse : secondResponse;
            }
        } finally {
            release.countDown();
            if (rollback) {
                jdbc.execute("ALTER TABLE wallet_transactions DROP CHECK ck_wallet_flow_purchase");
            }
        }
        assertThat(rewardResponse.statusCode()).isEqualTo(200);
        assertThat(json.readTree(rewardResponse.body()).path("rewardAmount").asLong()).isEqualTo(5);
        if (rollback) {
            assertThat(purchaseResponse.statusCode()).isEqualTo(503);
            assertThat(purchaseResponse.body()).contains("SHOP_UNAVAILABLE");
            assertThat(balance(user)).isEqualTo(105);
            assertThat(count("shop_purchases", user)).isZero();
            assertThat(count("user_items", user)).isZero();
            purchaseResponse = purchase.call();
        }
        assertThat(purchaseResponse.statusCode()).isEqualTo(200);
        assertThat(json.readTree(purchaseResponse.body()).path("balanceAfter").asLong())
                .isEqualTo(order == Order.PURCHASE_FIRST ? 90 : 95);
        assertThat(balance(user)).isEqualTo(95);

        // 두 API의 성공 후 재전송도 실제 HTTP로 겹치게 보내 최초 응답만 반환하는지 확인한다.
        var ready = new CountDownLatch(8);
        var retry = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var responses = new ArrayList<Future<HttpResponse<String>>>();
            for (int i = 0; i < 8; i++) {
                var action = i % 2 == 0 ? purchase : reward;
                responses.add(executor.submit(() -> {
                    ready.countDown();
                    if (!retry.await(5, TimeUnit.SECONDS)) {
                        throw new AssertionError("재요청 시작 대기 초과");
                    }
                    return action.call();
                }));
            }
            try {
                assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            } finally {
                retry.countDown();
            }
            for (int i = 0; i < responses.size(); i++) {
                var response = responses.get(i).get(10, TimeUnit.SECONDS);
                assertThat(response.statusCode()).isEqualTo(200);
                assertThat(response.body()).isEqualTo(i % 2 == 0 ? purchaseResponse.body() : rewardResponse.body());
            }
        }
        assertThat(balance(user)).isEqualTo(95);
        assertThat(jdbc.queryForObject("SELECT reserved_balance FROM wallets WHERE user_id=?", Long.class, user))
                .isEqualTo(30);
        assertThat(count("shop_purchases", user)).isEqualTo(1);
        assertThat(count("user_items", user)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT quantity FROM user_items WHERE user_id=?", Integer.class, user))
                .isEqualTo(1);
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM wallet_transactions t JOIN wallets w ON t.wallet_id=w.id WHERE w.user_id=?
                """, Integer.class, user)).isEqualTo(2);
        assertThat(jdbc.queryForObject("""
                SELECT SUM(t.balance_delta) FROM wallet_transactions t JOIN wallets w ON t.wallet_id=w.id
                WHERE w.user_id=?
                """, Long.class, user)).isEqualTo(-5);
        assertThat(jdbc.queryForObject("""
                SELECT SUM(t.reserved_delta) FROM wallet_transactions t JOIN wallets w ON t.wallet_id=w.id
                WHERE w.user_id=?
                """, Long.class, user)).isZero();
        System.out.println("[WALLET_FLOW] order=" + order + " lockWaitObserved=true balance=95 reserved=30"
                + " purchaseReceipts=1 items=1 ledgerEntries=2 balanceDelta=-5 retryResponses=8");
    }

    private void pauseAfterLock(Order order, long user, CountDownLatch held, CountDownLatch release) {
        var once = new AtomicBoolean();
        org.mockito.stubbing.Answer<Object> pause = invocation -> {
            Object wallet = invocation.callRealMethod();
            if (once.compareAndSet(false, true)) {
                held.countDown();
                if (!release.await(10, TimeUnit.SECONDS)) {
                    throw new AssertionError("지갑 잠금 해제 대기 초과");
                }
            }
            return wallet;
        };
        if (order == Order.REWARD_FIRST) {
            doAnswer(pause).when(rewards).lockWallet(eq(user));
        } else {
            doAnswer(pause).when(purchases).lockWallet(eq(user));
        }
    }

    private int waitingWalletLocks() {
        return jdbc.queryForObject("""
                SELECT COUNT(*) FROM performance_schema.data_lock_waits waiters
                JOIN performance_schema.data_locks locks
                  ON waiters.ENGINE=locks.ENGINE AND waiters.REQUESTING_ENGINE_LOCK_ID=locks.ENGINE_LOCK_ID
                WHERE locks.OBJECT_SCHEMA=DATABASE() AND locks.OBJECT_NAME='wallets'
                """, Integer.class);
    }

    private void seed(long user) {
        jdbc.update("""
                INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)
                VALUES (?,'NAVER',?,?,'MALE',NOW(3),NOW(3))
                """, user, "wallet-flow-" + user, "검증회원" + user);
        jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES (?,100,30)", user);
        jdbc.update("""
                INSERT INTO items(id,item_code,name,item_type,equip_slot,price,image_key,is_for_sale)
                VALUES (?,?,'검증의상','EQUIPMENT','TOP',10,'synthetic-top',TRUE)
                """, user, "WALLET_FLOW_" + user);
    }

    private long balance(long user) {
        return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=?", Long.class, user);
    }

    private int count(String table, long user) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE user_id=?", Integer.class, user);
    }

    private HttpResponse<String> request(String token, String path, String body, String key) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(15)).header("Authorization", "Bearer " + token)
                .header("Origin", "https://dev.on-top.world").header("Content-Type", "application/json");
        if (key != null) {
            request.header("Idempotency-Key", key);
        }
        return http.send(request.POST(HttpRequest.BodyPublishers.ofString(body)).build(),
                HttpResponse.BodyHandlers.ofString());
    }
}
