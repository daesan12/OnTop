package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.minigame.dto.MinigameStartResponse;
import com.ssafy.ontop.minigame.service.MinigameException;
import com.ssafy.ontop.minigame.service.MinigameService;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.minigames.enabled=true", "ontop.shop.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop,classpath:db/minigame",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class MinigameMySqlTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired MinigameService minigames;
    @Autowired ShopService shop;
    @Autowired AuthExchangePersistenceService issuer;
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
        for (String table : List.of("bungeoppang_records", "bungeoppang_profiles", "minigame_start_requests",
                "wallet_transactions", "minigame_sessions", "shop_purchases", "user_items", "items",
                "wallets", "refresh_tokens", "users")) {
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
    }

    @Test
    void 시작_조회_실제입력검증_보상_중복완료를_HTTP와_DB로_확인한다() throws Exception {
        assertThat(request("GET", "", 101, null, null).body()).contains("\"isFirstGame\":true");
        var start = request("POST", "", 101, "{\"minigameType\":\"BUNGEOPPANG\"}", "start-one");
        assertThat(start.statusCode()).isEqualTo(201);
        var node = mapper.readTree(start.body());
        long id = node.path("minigameSessionId").asLong();
        assertThat(node.path("rulesVersion").asText()).isEqualTo("v2");
        assertThat(node.path("heats").size()).isEqualTo(64);
        assertThat(request("POST", "", 101, "{\"minigameType\":\"BUNGEOPPANG\"}", "start-one").body())
                .isEqualTo(start.body());
        assertThat(request("GET", "/" + id, 202, null, null).statusCode()).isEqualTo(404);
        var body = BungeoppangFixtures.sevenGolden(mapper.convertValue(node.path("heats"),
                new com.fasterxml.jackson.core.type.TypeReference<List<Integer>>() { }));
        assertThat(request("POST", "/" + id + "/complete", 101, body.toString(), null).statusCode()).isEqualTo(422);
        age(id, 65);
        var completed = request("POST", "/" + id + "/complete", 101, body.toString(), null);
        assertThat(completed.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(completed.body()).path("score").asInt()).isEqualTo(86);
        assertThat(request("POST", "/" + id + "/complete", 101, body.toString(), null).body())
                .isEqualTo(completed.body());
        assertThat(balance()).isEqualTo(105);
        assertThat(count("wallet_transactions")).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT reserved_balance FROM wallets WHERE user_id=101", Long.class)).isEqualTo(10);
        assertThat(request("GET", "", 101, null, null).body()).contains("\"isFirstGame\":false", "GOLD", "START");
        assertThat(jdbc.queryForObject("SELECT submission FROM bungeoppang_records", String.class)).contains("clientScore");
    }

    @Test
    void 같은키_동시시작은_같은불세기와_하나의세션을_반환한다() throws Exception {
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> minigames.start(101, "BUNGEOPPANG", "same"));
            var second = executor.submit(() -> minigames.start(101, "BUNGEOPPANG", "same"));
            assertThat(first.get(10, TimeUnit.SECONDS)).isEqualTo(second.get(10, TimeUnit.SECONDS));
        }
        assertThat(count("minigame_sessions")).isEqualTo(1);
    }

    @Test
    void 새키로_시작하면_이전판은_포기하고_한판만_활성상태로_남긴다() {
        var first = start("first");
        var second = start("second");
        assertThat(minigames.load(101, id(first)).status()).isEqualTo("ABANDONED");
        assertThat(minigames.load(101, id(second)).status()).isEqualTo("PLAYING");
    }

    @Test
    void 동시완료_6건은_동일한결과를_반환하고_한번만_지급한다() throws Exception {
        var start = ready("one");
        JsonNode body = BungeoppangFixtures.sevenGolden(start.heats());
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var futures = new ArrayList<java.util.concurrent.Future<Long>>();
            for (int i = 0; i < 6; i++) {
                futures.add(executor.submit(() -> { gate.await(); return minigames.complete(101, id(start), body).rewardAmount(); }));
            }
            gate.countDown();
            for (var future : futures) { assertThat(future.get(10, TimeUnit.SECONDS)).isEqualTo(5); }
        }
        assertThat(balance()).isEqualTo(105);
        assertThat(count("wallet_transactions")).isEqualTo(1);
    }

    @Test
    void 완료와_포기_경합은_최종상태를_하나로_확정한다() throws Exception {
        var start = ready("one");
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var complete = executor.submit(() -> race(gate,
                    () -> minigames.complete(101, id(start), BungeoppangFixtures.sevenGolden(start.heats())).status()));
            var abandon = executor.submit(() -> race(gate, () -> minigames.abandon(101, id(start)).status()));
            gate.countDown();
            var results = List.of(complete.get(10, TimeUnit.SECONDS), abandon.get(10, TimeUnit.SECONDS));
            assertThat(results.stream().filter(s -> s.startsWith("MINIGAME_ALREADY_")).count()).isEqualTo(1);
        }
        long reward = minigames.load(101, id(start)).status().equals("COMPLETED") ? 5 : 0;
        assertThat(balance()).isEqualTo(100 + reward);
        assertThat(count("wallet_transactions")).isEqualTo(reward == 0 ? 0 : 1);
    }

    @Test
    void 원장실패시_세션_지갑_안내기록을_롤백하고_재시도한다() {
        var start = ready("one");
        JsonNode body = BungeoppangFixtures.sevenGolden(start.heats());
        jdbc.execute("CREATE TRIGGER minigame_test_fail_ledger BEFORE INSERT ON wallet_transactions"
                + " FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test ledger failure'");
        try {
            assertThatThrownBy(() -> minigames.complete(101, id(start), body)).isInstanceOf(RuntimeException.class);
            assertThat(balance()).isEqualTo(100);
            assertThat(minigames.load(101, id(start)).status()).isEqualTo("PLAYING");
            assertThat(count("bungeoppang_profiles")).isZero();
        } finally { jdbc.execute("DROP TRIGGER minigame_test_fail_ledger"); }
        assertThat(minigames.complete(101, id(start), body).rewardAmount()).isEqualTo(5);
    }

    @Test
    void 잘못된기록은_DB에_거부사유와함께_남고_다시보내도_지급하지않는다() throws Exception {
        var start = ready("one");
        String path = "/" + id(start) + "/complete";
        var invalid = request("POST", path, 101,
                "{\"log\":[{\"slot\":0,\"action\":\"TURN\",\"t\":0}]}", null);
        assertThat(invalid.statusCode()).isEqualTo(422);
        assertThat(invalid.body()).contains("ACTION_STATE_MISMATCH");
        assertThat(request("POST", path, 101, BungeoppangFixtures.sevenGolden(start.heats()).toString(), null).body())
                .isEqualTo(invalid.body());
        assertThat(minigames.load(101, id(start)).status()).isEqualTo("INVALID");
        assertThat(balance()).isEqualTo(100);
    }

    @Test
    void 하루상한_남은2냥만_지급하고_다음판은_0냥으로_정상완료한다() {
        historyReward(98);
        var first = ready("first");
        var result = minigames.complete(101, id(first), BungeoppangFixtures.sevenGolden(first.heats()));
        assertThat(result.coinsGranted()).isEqualTo(2);
        assertThat(result.todayEarned()).isEqualTo(100);
        var second = ready("second");
        assertThat(minigames.complete(101, id(second), BungeoppangFixtures.sevenGolden(second.heats())).coinsGranted()).isZero();
        assertThat(balance()).isEqualTo(102);
    }

    @Test
    void KST자정_전날보상은_오늘상한에_포함하지않는다() {
        historyReward(100);
        jdbc.update("UPDATE minigame_sessions SET ended_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 DAY)");
        var start = ready("one");
        assertThat(minigames.complete(101, id(start), BungeoppangFixtures.sevenGolden(start.heats())).coinsGranted()).isEqualTo(5);
    }

    @Test
    void 구매와_보상이_동시에와도_같은지갑에_증감이_남는다() throws Exception {
        var start = ready("one");
        jdbc.update("INSERT INTO items(id,item_code,name,item_type,equip_slot,price,image_key,is_for_sale)"
                + " VALUES (1,'MINI_TEST','테스트','CONSUMABLE',NULL,5,'test',1)");
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var reward = executor.submit(() -> minigames.complete(101, id(start), BungeoppangFixtures.sevenGolden(start.heats())));
            var purchase = executor.submit(() -> shop.purchase(101, 1, 1, "mini-shop"));
            reward.get(10, TimeUnit.SECONDS);
            purchase.get(10, TimeUnit.SECONDS);
        }
        assertThat(balance()).isEqualTo(100);
        assertThat(count("wallet_transactions")).isEqualTo(2);
    }

    @Test
    void 십분경과한_세션은_조회시_만료하고_보상은없다() {
        var start = start("one");
        age(id(start), 601);
        assertThat(minigames.load(101, id(start)).status()).isEqualTo("INVALID");
        assertThatThrownBy(() -> minigames.complete(101, id(start), BungeoppangFixtures.body("{\"log\":[]}")))
                .isInstanceOf(MinigameException.class);
        assertThat(balance()).isEqualTo(100);
    }

    private void historyReward(int reward) {
        jdbc.update("INSERT INTO minigame_sessions(user_id,minigame_type,status,score,reward_amount,started_at,ended_at)"
                + " VALUES (101,'BUNGEOPPANG','COMPLETED',1500,?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))", reward);
    }

    @Test
    void 시작횟수제한은_같은키재시도를_차단하지않는다() {
        for (int i = 0; i < 10; i++) { start("rate-" + i); }
        assertThatThrownBy(() -> start("eleventh")).isInstanceOfSatisfying(MinigameException.class,
                e -> assertThat(e.status()).isEqualTo(429));
        assertThat(start("rate-9").heats()).hasSize(64);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM minigame_sessions WHERE status='PLAYING'", Integer.class))
                .isEqualTo(1);
    }
    private MinigameStartResponse start(String key) { return minigames.start(101, "BUNGEOPPANG", key); }
    private MinigameStartResponse ready(String key) { var result = start(key); age(id(result), 65); return result; }
    private long id(MinigameStartResponse start) { return Long.parseLong(start.minigameSessionId()); }
    private void age(long id, int seconds) {
        jdbc.update("UPDATE minigame_sessions SET started_at = TIMESTAMPADD(SECOND, ?, UTC_TIMESTAMP(3)) WHERE id=?", -seconds, id);
    }
    private String race(CountDownLatch gate, java.util.function.Supplier<String> action) throws Exception {
        gate.await();
        try { return action.get(); } catch (MinigameException exception) { return exception.code(); }
    }
    private long balance() { return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=101", Long.class); }
    private int count(String table) { return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class); }
    private HttpResponse<String> request(String method, String path, long user, String body, String key) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/minigames/sessions" + path))
                .header("Authorization", "Bearer " + tokens.get(user)).header("Origin", "http://localhost:8080");
        if (body != null) { builder.header("Content-Type", "application/json"); }
        if (key != null) { builder.header("Idempotency-Key", key); }
        return http.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
}
