package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.minigame.service.MinigameException;
import com.ssafy.ontop.minigame.service.MinigameService;
import com.ssafy.ontop.minigame.service.VerifiedMinigameResultSource;
import com.ssafy.ontop.shop.service.ShopService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.OptionalLong;
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
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.minigames.enabled=true", "ontop.shop.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop-fixture,classpath:db/shop,classpath:db/minigame",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class MinigameMySqlTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired MinigameService minigames;
    @Autowired ShopService shop;
    @Autowired AuthExchangePersistenceService issuer;
    @MockitoBean VerifiedMinigameResultSource verified;
    @LocalServerPort int port;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient http = HttpClient.newHttpClient();
    private final Map<Long, String> tokens = new HashMap<>();

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_MINIGAME_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_minigame_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_minigame_test_ 전용 검증 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_MINIGAME_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_MINIGAME_DB_PASSWORD"));
    }

    @BeforeEach
    void setup() {
        tokens.clear();
        jdbc.execute("DROP TRIGGER IF EXISTS minigame_test_fail_ledger");
        for (String table : List.of("minigame_start_requests", "minigame_sessions", "shop_purchases",
                "wallet_transactions", "user_items", "items", "wallets", "refresh_tokens", "users")) {
            jdbc.update("DELETE FROM " + table);
        }
        for (long user : new long[]{101, 202}) {
            jdbc.update("INSERT INTO users(id, login_provider, provider_user_id, nickname, character_gender,"
                    + " created_at, updated_at) VALUES (?, 'NAVER', ?, ?, 'MALE',"
                    + " CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))", user, "mini-test-" + user, "mini" + user);
            jdbc.update("INSERT INTO wallets(user_id, balance, reserved_balance) VALUES (?, 100, 10)", user);
            tokens.put(user, issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                    LoginOutcome.Status.EXISTING_MEMBER, user, null)).accessToken());
        }
        when(verified.findCompletedCount(anyLong(), anyLong())).thenReturn(OptionalLong.empty());
    }

    @Test
    void 시작_조회_미검증차단_서버결과지급_중복완료를HTTP와DB로확인한다() throws Exception {
        var start = request("POST", "", 101, "{\"minigameType\":\"BUNGEOPPANG\"}", "start-one");
        assertThat(start.statusCode()).isEqualTo(201);
        assertThat(start.headers().firstValue("Cache-Control").orElseThrow()).contains("no-store");
        long id = json(start).path("minigameSessionId").asLong();
        assertThat(request("POST", "", 101, "{\"minigameType\":\"BUNGEOPPANG\"}", "start-one").body())
                .isEqualTo(start.body());
        var playing = json(request("GET", "/" + id, 101, null, null));
        assertThat(playing.path("status").asText()).isEqualTo("PLAYING");
        assertThat(playing.path("score").isNull()).isTrue();
        assertThat(playing.path("endedAt").isNull()).isTrue();
        assertThat(balance()).isEqualTo(100);
        assertThat(request("GET", "/" + id, 202, null, null).statusCode()).isEqualTo(404);
        var rejected = request("POST", "/" + id + "/complete", 101, "{}", null);
        assertThat(rejected.statusCode()).isEqualTo(409);
        assertThat(rejected.body()).contains("MINIGAME_NOT_VERIFIED");
        assertThat(balance()).isEqualTo(100);
        when(verified.findCompletedCount(101, id)).thenReturn(OptionalLong.of(3));
        var completed = request("POST", "/" + id + "/complete", 101, "{}", null);
        assertThat(completed.statusCode()).isEqualTo(200);
        assertThat(json(completed).path("verifiedCompletedCount").asLong()).isEqualTo(3);
        assertThat(json(completed).path("rewardAmount").asLong()).isEqualTo(2);
        assertThat(request("POST", "/" + id + "/complete", 101, "{}", null).body()).isEqualTo(completed.body());
        assertThat(balance()).isEqualTo(102);
        assertThat(count("wallet_transactions")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT minigame_session_id FROM wallet_transactions", Long.class))
                .isEqualTo(id);
        assertThat(jdbc.queryForObject("SELECT reserved_balance FROM wallets WHERE user_id=101", Long.class))
                .isEqualTo(10);
        assertThat(json(request("GET", "/" + id, 101, null, null)).path("score").asLong()).isEqualTo(3);
        assertThat(request("POST", "/" + id + "/abandon", 101, "{}", null).statusCode()).isEqualTo(409);
    }

    @Test
    void 같은키동시시작은세션하나만만든다() throws Exception {
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> minigames.start(101, "BUNGEOPPANG", "same"));
            var second = executor.submit(() -> minigames.start(101, "BUNGEOPPANG", "same"));
            assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(second.get(10, TimeUnit.SECONDS));
        }
        assertThat(count("minigame_sessions")).isEqualTo(1);
        assertThat(balance()).isEqualTo(100);
    }

    @Test
    void 동시완료6건은보상을한번만지급한다() throws Exception {
        long id = start();
        when(verified.findCompletedCount(101, id)).thenReturn(OptionalLong.of(6));
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var futures = new ArrayList<java.util.concurrent.Future<Long>>();
            for (int i = 0; i < 6; i++) {
                futures.add(executor.submit(() -> {
                    gate.await(5, TimeUnit.SECONDS);
                    return minigames.complete(101, id).rewardAmount();
                }));
            }
            gate.countDown();
            for (var future : futures) {
                assertThat(future.get(10, TimeUnit.SECONDS)).isEqualTo(4);
            }
        }
        assertThat(balance()).isEqualTo(104);
        assertThat(count("wallet_transactions")).isEqualTo(1);
    }

    @Test
    void 완료포기경합은상태와지급을하나로확정한다() throws Exception {
        long id = start();
        when(verified.findCompletedCount(101, id)).thenReturn(OptionalLong.of(3));
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var complete = executor.submit(() -> race(gate, () -> minigames.complete(101, id).status()));
            var abandon = executor.submit(() -> race(gate, () -> minigames.abandon(101, id).status()));
            var outcomes = List.of(complete, abandon);
            gate.countDown();
            var result = new ArrayList<String>();
            for (var outcome : outcomes) {
                result.add(outcome.get(10, TimeUnit.SECONDS));
            }
            assertThat(result.stream().filter(s -> s.startsWith("MINIGAME_ALREADY_")).count()).isEqualTo(1);
        }
        var session = minigames.load(101, id);
        long expected = session.status().equals("COMPLETED") ? 2 : 0;
        assertThat(balance()).isEqualTo(100 + expected);
        assertThat(count("wallet_transactions")).isEqualTo(expected == 0 ? 0 : 1);
    }

    @Test
    void 원장실패는세션완료와지갑지급도롤백하고재시도할수있다() {
        long id = start();
        when(verified.findCompletedCount(101, id)).thenReturn(OptionalLong.of(3));
        jdbc.execute("CREATE TRIGGER minigame_test_fail_ledger BEFORE INSERT ON wallet_transactions"
                + " FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test ledger failure'");
        assertThatThrownBy(() -> minigames.complete(101, id)).isInstanceOf(RuntimeException.class);
        assertThat(balance()).isEqualTo(100);
        assertThat(minigames.load(101, id).status()).isEqualTo("PLAYING");
        assertThat(count("wallet_transactions")).isZero();
        jdbc.execute("DROP TRIGGER minigame_test_fail_ledger");
        assertThat(minigames.complete(101, id).rewardAmount()).isEqualTo(2);
    }

    @Test
    void 포기재시도와미확정잔여정책은돈을지급하지않는다() {
        long id = start();
        when(verified.findCompletedCount(101, id)).thenReturn(OptionalLong.of(4));
        assertThatThrownBy(() -> minigames.complete(101, id)).isInstanceOfSatisfying(MinigameException.class,
                error -> assertThat(error.code()).isEqualTo("MINIGAME_POLICY_REQUIRED"));
        assertThat(minigames.load(101, id).status()).isEqualTo("PLAYING");
        assertThat(minigames.abandon(101, id)).isEqualTo(minigames.abandon(101, id));
        assertThatThrownBy(() -> minigames.complete(101, id)).isInstanceOf(MinigameException.class);
        assertThat(balance()).isEqualTo(100);
        assertThat(count("wallet_transactions")).isZero();
    }

    @Test
    void 구매와보상이동시에와도같은지갑에증감이함께남는다() throws Exception {
        long id = start();
        when(verified.findCompletedCount(101, id)).thenReturn(OptionalLong.of(3));
        jdbc.update("INSERT INTO items(id,item_code,name,item_type,equip_slot,price,image_key,is_for_sale)"
                + " VALUES (1,'MINI_TEST','테스트','CONSUMABLE',NULL,5,'test',1)");
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var reward = executor.submit(() -> minigames.complete(101, id));
            var purchase = executor.submit(() -> shop.purchase(101, 1, 1, "mini-shop"));
            reward.get(10, TimeUnit.SECONDS);
            purchase.get(10, TimeUnit.SECONDS);
        }
        assertThat(balance()).isEqualTo(97);
        assertThat(count("wallet_transactions")).isEqualTo(2);
    }

    private long start() {
        return Long.parseLong(minigames.start(101, "BUNGEOPPANG", "one").minigameSessionId());
    }

    private String race(CountDownLatch gate, java.util.function.Supplier<String> action) throws Exception {
        gate.await(5, TimeUnit.SECONDS);
        try {
            return action.get();
        } catch (MinigameException exception) {
            return exception.code();
        }
    }

    private long balance() {
        return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=101", Long.class);
    }

    private int count(String table) { return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class); }
    private JsonNode json(HttpResponse<String> response) throws Exception { return mapper.readTree(response.body()); }

    private HttpResponse<String> request(String method, String path, long user, String body, String key)
            throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/minigames/sessions" + path))
                .header("Authorization", "Bearer " + tokens.get(user)).header("Origin", "http://localhost:8080");
        if (body != null) { builder.header("Content-Type", "application/json"); }
        if (key != null) { builder.header("Idempotency-Key", key); }
        return http.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
}
