package com.ssafy.ontop.shop;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.service.AccessJwtService;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.shop.domain.DuplicateEquipmentPolicy;
import com.ssafy.ontop.shop.domain.EquipmentChanged;
import com.ssafy.ontop.shop.dto.OwnedItemResponse;
import com.ssafy.ontop.shop.dto.PurchaseResponse;
import com.ssafy.ontop.shop.repository.ShopRepository;
import com.ssafy.ontop.shop.service.ShopService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.shop.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class ShopMySqlTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired ShopService shop;
    @Autowired jakarta.persistence.EntityManager entities;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean
    ShopRepository repository;
    @Autowired AccessJwtService jwt;
    @Autowired AuthExchangePersistenceService issuer;
    private final Map<Long, String> accessTokens = new HashMap<>();
    @Autowired PlatformTransactionManager manager;
    @Autowired com.ssafy.ontop.wallet.service.WalletInitializationService walletInitializer;
    @LocalServerPort int port;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newHttpClient();

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_SHOP_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_shop_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_shop_test_ 전용 검증 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_SHOP_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_SHOP_DB_PASSWORD"));
    }

    @BeforeEach
    void setup() {
        accessTokens.clear();
        jdbc.execute("DROP TRIGGER IF EXISTS shop_test_fail_ledger");
        for (String table : List.of("shop_purchases", "wallet_transactions", "user_items", "wallets",
                "items", "refresh_tokens", "users")) {
            jdbc.update("DELETE FROM " + table);
        }
        for (long user : new long[]{101, 202}) {
            jdbc.update("""
                    INSERT INTO users(id, login_provider, provider_user_id, nickname, character_gender,
                        created_at, updated_at)
                    VALUES (?, 'NAVER', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
                    """, user, "shop-test-" + user, "shop" + user);
            jdbc.update("INSERT INTO wallets(user_id, balance, reserved_balance) VALUES (?, 100, 0)", user);
            accessTokens.put(user, issuer.issueExisting(new LoginOutcome(
                    OAuthProvider.NAVER,
                    LoginOutcome.Status.EXISTING_MEMBER, user, null)).accessToken());
        }
        item(1, "EQUIPMENT", "TOP", 10, true);
        item(2, "EQUIPMENT", "TOP", 20, true);
        item(3, "CONSUMABLE", null, 5, true);
        item(4, "EQUIPMENT", "HAIR", 1, false);
    }

    @Test
    void 공통초기화는_기존상점지갑과_원장없는잔액을_보존한다() {
        assertThat(walletInitializer.initializeActiveMember(101))
                .isEqualTo(com.ssafy.ontop.wallet.service.WalletInitializationService.Result.PRESERVED);
        assertThat(balance(101)).isEqualTo(100);
        assertThat(count("wallet_transactions")).isZero();
    }

    @Test
    void 지갑없이_보유기록이_있는회원은_자동지급하지_않는다() {
        jdbc.update("""
                INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)
                VALUES (303,'NAVER','shop-wallet-review','검토대상','MALE',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))
                """);
        jdbc.update("INSERT INTO user_items(user_id,item_id,quantity) VALUES (303,3,1)");

        assertThatThrownBy(() -> walletInitializer.initializeActiveMember(303))
                .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class)
                .hasMessageContaining("WALLET_INITIALIZATION_REVIEW_REQUIRED");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallets WHERE user_id=303", Long.class)).isZero();
        assertThat(count("wallet_transactions")).isZero();
    }

    private void item(long id, String type, String slot, long price, boolean sale) {
        jdbc.update("""
                INSERT INTO items(id, item_code, name, item_type, equip_slot, price, image_key, is_for_sale)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, id, "ITEM_" + id, "아이템" + id, type, slot, price, "item-" + id, sale);
    }

    @Test
    void 거래원장_경기참조는NullableLong으로조회하고_상점구매는비워둔다() {
        shop.purchase(101, 3, 1, "session-reference");
        var tx = new TransactionTemplate(manager);
        tx.executeWithoutResult(status -> {
            Object[] refs = entities.createQuery("""
                    select t.gameSessionId, t.minigameSessionId
                    from WalletTransaction t where t.transactionType = 'SHOP_PURCHASE'
                    """, Object[].class).getSingleResult();
            assertThat(refs).containsExactly(null, null);
        });
        long gameId = 3_000_000_001L;
        long minigameId = 4_000_000_001L;
        jdbc.update("""
                INSERT INTO wallet_transactions(wallet_id, game_session_id, transaction_type,
                    balance_delta, reserved_delta, idempotency_key)
                SELECT id, ?, 'GAME_WIN', 10, -10, 'game-reference' FROM wallets WHERE user_id = 101
                """, gameId);
        jdbc.update("""
                INSERT INTO wallet_transactions(wallet_id, minigame_session_id, transaction_type,
                    balance_delta, reserved_delta, idempotency_key)
                SELECT id, ?, 'MINIGAME_REWARD', 10, 0, 'minigame-reference' FROM wallets WHERE user_id = 101
                """, minigameId);
        tx.executeWithoutResult(status -> {
            var refs = entities.createQuery("""
                    select t.gameSessionId, t.minigameSessionId
                    from WalletTransaction t where t.idempotencyKey in ('game-reference', 'minigame-reference')
                    order by t.idempotencyKey
                    """, Object[].class).getResultList();
            assertThat(refs).hasSize(2);
            assertThat(refs.get(0)).containsExactly(gameId, null);
            assertThat(refs.get(1)).containsExactly(null, minigameId);
        });
    }

    @Test
    void 실제JWT_HTTP_구매부터보유조회와같은부위장착교체까지() throws Exception {
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.4.");
        var list = request("GET", "/api/v1/shop/items", 101, null, null);
        assertThat(list.statusCode()).isEqualTo(200);
        assertThat(json(list).path("items").size()).isEqualTo(3);
        var buy = request("POST", "/api/v1/shop/purchases", 101,
                "{\"itemId\":1,\"quantity\":1}", "http-first");
        assertThat(buy.statusCode()).isEqualTo(200);
        long ownedId = json(buy).path("userItemId").asLong();
        assertThat(json(buy).path("balanceAfter").asLong()).isEqualTo(90);
        var equipped = request("PATCH", "/api/v1/users/me/equipment", 101,
                "{\"userItemId\":" + ownedId + "}", null);
        assertThat(equipped.statusCode()).isEqualTo(200);
        assertThat(json(equipped).path("equipment").size()).isEqualTo(1);
        long second = shop.purchase(101, 2, 1, "second-top").userItemId();
        shop.equip(101, second);
        assertThat(shop.inventory(101).items()).filteredOn(OwnedItemResponse::equipped)
                .extracting(OwnedItemResponse::userItemId).containsExactly(second);
        assertThat(json(request("GET", "/api/v1/users/me/items", 202, null, null)).path("items").isEmpty()).isTrue();
        assertThat(list.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store");
    }

    @Test
    void 같은키_동시8요청은한번만차감지급하고같은영수증을돌려준다() throws Exception {
        List<PurchaseResponse> results = new ArrayList<>();
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var futures = java.util.stream.IntStream.range(0, 8).mapToObj(index ->
                    executor.submit(() -> { gate.await(); return shop.purchase(101, 3, 2, "same-key"); })).toList();
            gate.countDown();
            for (var future : futures) { results.add(future.get(10, TimeUnit.SECONDS)); }
        }
        assertThat(results).containsOnly(results.getFirst());
        assertThat(balance(101)).isEqualTo(90);
        assertThat(count("wallet_transactions")).isEqualTo(1);
        assertThat(count("shop_purchases")).isEqualTo(1);
        assertThat(shop.inventory(101).items().getFirst().quantity()).isEqualTo(2);
    }

    @Test
    void 실제DB에서도삭제계정과위조요청은잔액과보유를바꾸지않는다() throws Exception {
        assertThat(request("POST", "/api/v1/shop/purchases", 101,
                "{\"itemId\":1,\"quantity\":1,\"price\":0}", "tampered").statusCode()).isEqualTo(400);
        assertThat(request("POST", "/api/v1/shop/purchases", 101,
                "{\"itemId\":1,\"quantity\":1}", null).statusCode()).isEqualTo(400);
        jdbc.update("UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = 101");
        assertThat(request("POST", "/api/v1/shop/purchases", 101,
                "{\"itemId\":1,\"quantity\":1}", "deleted").statusCode()).isEqualTo(401);
        assertThat(balance(101)).isEqualTo(100);
        assertThat(count("user_items")).isZero();
        assertThat(count("wallet_transactions")).isZero();
        assertThat(count("shop_purchases")).isZero();
    }

    @Test
    void 동일부위동시장착은하나만유지한다() throws Exception {
        long first = shop.purchase(101, 1, 1, "top-one").userItemId();
        long second = shop.purchase(101, 2, 1, "top-two").userItemId();
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var tasks = List.of(first, second).stream().map(id -> executor.submit(() -> {
                gate.await(); return shop.equip(101, id);
            })).toList();
            gate.countDown();
            for (var task : tasks) { task.get(10, TimeUnit.SECONDS); }
        }
        assertThat(shop.inventory(101).items()).filteredOn(OwnedItemResponse::equipped).hasSize(1);
    }

    @Test
    void 서로다른키_동시구매는잔액을초과하지않는다() throws Exception {
        jdbc.update("UPDATE wallets SET balance = 15 WHERE user_id = 101");
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var futures = java.util.stream.IntStream.range(0, 2).mapToObj(index -> executor.submit(() -> {
                gate.await();
                try { shop.purchase(101, 3, 2, "different-" + index); return "OK"; }
                catch (ShopException exception) { return exception.code(); }
            })).toList();
            gate.countDown();
            var outcomes = new ArrayList<String>();
            for (var future : futures) { outcomes.add(future.get(10, TimeUnit.SECONDS)); }
            assertThat(outcomes).containsExactlyInAnyOrder("OK", "INSUFFICIENT_BALANCE");
        }
        assertThat(balance(101)).isEqualTo(5);
        assertThat(count("wallet_transactions")).isEqualTo(1);
        assertThat(shop.inventory(101).items().getFirst().quantity()).isEqualTo(2);
    }

    @Test
    void 원장쓰기실패시차감과아이템지급과영수증이전부롤백된다() {
        // 격리 DB의 임시 CHECK로 실제 원장 INSERT만 실패시킨다. SUPER/서버 전역 설정이 필요 없다.
        jdbc.execute("""
                ALTER TABLE wallet_transactions ADD CONSTRAINT ck_shop_test_fail_ledger
                CHECK (transaction_type <> 'SHOP_PURCHASE')
                """);
        try {
            assertThatThrownBy(() -> shop.purchase(101, 3, 1, "rollback")).isInstanceOf(RuntimeException.class);
            assertThat(balance(101)).isEqualTo(100);
            assertThat(count("user_items")).isZero();
            assertThat(count("wallet_transactions")).isZero();
            assertThat(count("shop_purchases")).isZero();
        } finally { jdbc.execute("ALTER TABLE wallet_transactions DROP CHECK ck_shop_test_fail_ledger"); }
        assertThat(shop.purchase(101, 3, 1, "rollback").balanceAfter()).isEqualTo(95);
    }

    @Test
    void 같은키의다른요청거절과가격판매상태변경뒤재조회가안전하다() {
        var first = shop.purchase(101, 3, 2, "stable");
        assertThatThrownBy(() -> shop.purchase(101, 3, 1, "stable"))
                .isInstanceOf(ShopException.class).hasMessageContaining("같은 키");
        jdbc.update("UPDATE items SET price = 99, is_for_sale = FALSE WHERE id = 3");
        assertThat(shop.purchase(101, 3, 2, "stable")).isEqualTo(first);
        assertThat(balance(101)).isEqualTo(90);
    }

    @Test
    void 다른계정과대소문자키는독립구매다() {
        shop.purchase(101, 3, 1, "Case");
        shop.purchase(101, 3, 1, "case");
        shop.purchase(202, 3, 1, "Case");
        assertThat(count("wallet_transactions")).isEqualTo(3);
        assertThat(balance(101)).isEqualTo(90);
        assertThat(balance(202)).isEqualTo(95);
    }

    @Test
    void 예약엽전과수량초과는차감하지않는다() {
        jdbc.update("UPDATE wallets SET reserved_balance = 99 WHERE user_id = 101");
        assertThatThrownBy(() -> shop.purchase(101, 3, 1, "reserved"))
                .isInstanceOf(ShopException.class);
        jdbc.update("UPDATE wallets SET reserved_balance = 0 WHERE user_id = 101");
        jdbc.update("UPDATE items SET price = ? WHERE id = 3", Long.MAX_VALUE);
        assertThatThrownBy(() -> shop.purchase(101, 3, 2, "overflow"))
                .isInstanceOf(ShopException.class);
        assertThat(balance(101)).isEqualTo(100);
        assertThat(count("wallet_transactions")).isZero();
    }

    @Test
    void 의상중복구매는동시요청도차단하고_동일구매재조회와소비형누적은유지한다() throws Exception {
        String path = "/api/v1/shop/purchases";
        String body = "{\"itemId\":1,\"quantity\":1}";
        var first = request("POST", path, 101, body, "first-equip");
        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(json(request("POST", path, 101, body, "first-equip"))).isEqualTo(json(first));
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var start = new CountDownLatch(1);
            var requests = new ArrayList<java.util.concurrent.Future<HttpResponse<String>>>();
            for (int index = 0; index < 6; index++) {
                String key = "duplicate-" + index;
                requests.add(executor.submit(() -> {
                    if (!start.await(5, TimeUnit.SECONDS)) { throw new AssertionError("구매 대기 초과"); }
                    return request("POST", path, 101, body, key);
                }));
            }
            start.countDown();
            for (var pending : requests) {
                var response = pending.get(10, TimeUnit.SECONDS);
                assertThat(response.statusCode()).isEqualTo(409);
                assertThat(json(response).path("code").asText()).isEqualTo("ITEM_ALREADY_OWNED");
            }
        }
        assertThat(balance(101)).isEqualTo(90);
        assertThat(count("shop_purchases")).isEqualTo(1);
        assertThat(count("wallet_transactions")).isEqualTo(1);
        assertThat(shop.inventory(101).items().getFirst().quantity()).isEqualTo(1);
        shop.purchase(101, 3, 2, "food-one");
        shop.purchase(101, 3, 3, "food-two");
        assertThat(shop.inventory(101).items().stream().filter(item -> item.item().itemId() == 3)
                .findFirst().orElseThrow().quantity()).isEqualTo(5);
        assertThat(balance(101)).isEqualTo(65);
    }

    @Test
    void 타인소유와소비형아이템은장착할수없다() {
        var mine = shop.purchase(101, 1, 1, "mine");
        assertThatThrownBy(() -> shop.equip(202, mine.userItemId())).isInstanceOf(ShopException.class);
        var consumable = shop.purchase(101, 3, 1, "food");
        assertThatThrownBy(() -> shop.equip(101, consumable.userItemId())).isInstanceOf(ShopException.class);
        assertThat(shop.inventory(101).items()).noneMatch(OwnedItemResponse::equipped);
    }

    @Test
    void 외부트랜잭션롤백이면장착변경과후속알림이없다() {
        long owned = shop.purchase(101, 1, 1, "owned").userItemId();
        var events = new ArrayList<Object>();
        var service = new ShopService(repository, manager, events::add, DuplicateEquipmentPolicy.REJECT);
        new TransactionTemplate(manager).execute(status -> {
            service.equip(101, owned);
            assertThat(events).isEmpty();
            status.setRollbackOnly();
            return null;
        });
        assertThat(events).isEmpty();
        assertThat(shop.inventory(101).items()).noneMatch(OwnedItemResponse::equipped);
        service.equip(101, owned);
        assertThat(events).singleElement().isInstanceOf(EquipmentChanged.class);
    }

    @Test
    void READ_COMMITTED에서관리중인지갑이있어도동시커밋된구매를덮어쓰지않는다() {
        readCommittedTransaction().execute(status -> {
            long walletId = jdbc.queryForObject("SELECT id FROM wallets WHERE user_id = 101", Long.class);
            var stale = entities.find(com.ssafy.ontop.wallet.domain.Wallet.class, walletId);
            assertThat(stale.balance()).isEqualTo(100);
            assertThat(shop.inventory(101).items()).isEmpty();
            try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
                var committed = executor.submit(() -> shop.purchase(101, 3, 2, "outside"))
                        .get(10, TimeUnit.SECONDS);
                assertThat(shop.purchase(101, 3, 2, "outside")).isEqualTo(committed);
            } catch (Exception exception) { throw new AssertionError(exception); }
            assertThat(shop.purchase(101, 3, 1, "inside").balanceAfter()).isEqualTo(85);
            return null;
        });
        assertThat(balance(101)).isEqualTo(85);
        assertThat(shop.inventory(101).items().getFirst().quantity()).isEqualTo(3);
        assertThat(count("wallet_transactions")).isEqualTo(2);
    }

    @Test
    void 이전에조회한보유엔티티도잠금후최신수량으로증가한다() {
        shop.purchase(101, 3, 1, "initial");
        readCommittedTransaction().execute(status -> {
            assertThat(shop.inventory(101).items().getFirst().quantity()).isEqualTo(1);
            try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
                executor.submit(() -> shop.purchase(101, 3, 2, "outside-holding")).get(10, TimeUnit.SECONDS);
            } catch (Exception exception) { throw new AssertionError(exception); }
            shop.purchase(101, 3, 1, "inside-holding");
            return null;
        });
        assertThat(shop.inventory(101).items().getFirst().quantity()).isEqualTo(4);
        assertThat(balance(101)).isEqualTo(80);
    }

    @Test
    void 수량0보유는장착불가하고교체시같은부위장착을해제한다() {
        long zero = shop.purchase(101, 1, 1, "zero").userItemId();
        long next = shop.purchase(101, 2, 1, "next").userItemId();
        shop.equip(101, zero);
        jdbc.update("UPDATE user_items SET quantity = 0 WHERE id = ?", zero);
        assertThatThrownBy(() -> shop.equip(101, zero)).isInstanceOf(ShopException.class);
        assertThat(shop.equip(101, next).equipment()).extracting(OwnedItemResponse::userItemId)
                .containsExactly(next);
        assertThat(jdbc.queryForObject("SELECT is_equipped FROM user_items WHERE id = ?", Boolean.class, zero))
                .isFalse();
    }

    @Test
    void 다른사용자의첫구매가보유조회직후겹쳐도둘다성공한다() throws Exception {
        var bothRead = new CountDownLatch(2);
        org.mockito.Mockito.doAnswer(invocation -> {
            Object result = invocation.callRealMethod();
            bothRead.countDown();
            if (!bothRead.await(5, TimeUnit.SECONDS)) { throw new AssertionError("동시 조회 실패"); }
            return result;
        }).when(repository).holding(anyLong(), eq(3L));
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> shop.purchase(101, 3, 1, "first-user"));
            var second = executor.submit(() -> shop.purchase(202, 3, 1, "second-user"));
            assertThat(first.get(10, TimeUnit.SECONDS).balanceAfter()).isEqualTo(95);
            assertThat(second.get(10, TimeUnit.SECONDS).balanceAfter()).isEqualTo(95);
        }
        assertThat(count("shop_purchases")).isEqualTo(2);
        assertThat(count("wallet_transactions")).isEqualTo(2);
        assertThat(count("user_items")).isEqualTo(2);
    }

    private TransactionTemplate readCommittedTransaction() {
        var transaction = new TransactionTemplate(manager);
        transaction.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_READ_COMMITTED);
        return transaction;
    }

    private long balance(long user) {
        return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id = ?", Long.class, user);
    }

    private int count(String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    private JsonNode json(HttpResponse<String> response) throws Exception { return mapper.readTree(response.body()); }

    private HttpResponse<String> request(String method, String path, long userId, String body, String key)
            throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .header("Authorization", "Bearer " + accessTokens.getOrDefault(userId,
                        jwt.issue(userId, TestLoginSessions.ID)))
                .header("Origin", "http://localhost:8080");
        if (key != null) { request.header("Idempotency-Key", key); }
        if (body != null) { request.header("Content-Type", "application/json"); }
        request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body));
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }
}
