package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Order;
import com.ssafy.ontop.minigame.domain.BungeoppangV4Round;
import com.ssafy.ontop.minigame.dto.MinigameStartResponse;
import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
import com.ssafy.ontop.minigame.dto.BungeoppangV4CompleteDtos;
import com.ssafy.ontop.minigame.service.BungeoppangV4DeliveryContract;
import com.ssafy.ontop.minigame.service.BungeoppangV4Spec;
import com.ssafy.ontop.minigame.service.MinigameException;
import com.ssafy.ontop.minigame.service.MinigameService;
import com.ssafy.ontop.shop.service.ShopService;
import jakarta.persistence.EntityManagerFactory;
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
import org.flywaydb.core.Flyway;
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
    @Autowired Flyway flyway;
    @Autowired EntityManagerFactory entities;
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
        jdbc.execute("DROP TRIGGER IF EXISTS minigame_test_fail_delivery_receipt");
        for (String table : List.of("bungeoppang_v5_orders", "bungeoppang_v4_receipts", "bungeoppang_v4_progress",
                "bungeoppang_v4_orders", "bungeoppang_v4_rounds",
                "bungeoppang_records", "bungeoppang_profiles", "minigame_start_requests",
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
    void V124_V125_V126_신규_DB_적용과_v4_테이블_JPA_validate를_확인한다() {
        assertThat(flyway.info().applied()).extracting(info -> info.getVersion().getVersion())
                .contains("110", "111", "124", "125", "126");
        assertThat(flyway.info().pending()).isEmpty();
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(flyway.migrate().migrationsExecuted).isZero();
        assertThat(entities.getProperties()).containsEntry("hibernate.hbm2ddl.auto", "validate");
        assertThat(entities.getMetamodel().getEntities()).extracting(type -> type.getJavaType().getName())
                .contains(BungeoppangV4Round.class.getName(), BungeoppangV4Order.class.getName(),
                        com.ssafy.ontop.minigame.domain.BungeoppangV4Progress.class.getName(),
                        com.ssafy.ontop.minigame.domain.BungeoppangV4Receipt.class.getName());
        assertThat(jdbc.queryForList("""
                SELECT TABLE_NAME FROM information_schema.TABLES
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME IN
                  ('bungeoppang_v4_rounds','bungeoppang_v4_orders','bungeoppang_v4_progress','bungeoppang_v4_receipts')
                ORDER BY TABLE_NAME
                """, String.class)).containsExactly("bungeoppang_v4_orders", "bungeoppang_v4_progress",
                        "bungeoppang_v4_receipts", "bungeoppang_v4_rounds");
        assertThat(jdbc.queryForList("""
                SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
                WHERE CONSTRAINT_SCHEMA=DATABASE()
                  AND TABLE_NAME IN ('bungeoppang_v4_rounds','bungeoppang_v4_orders')
                """, String.class)).contains("fk_bungeoppang_v4_round_session", "fk_bungeoppang_v4_order_round");
        assertThat(jdbc.queryForList("""
                SELECT INDEX_NAME FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bungeoppang_v4_orders'
                """, String.class)).contains("uk_bungeoppang_v4_order_id", "uk_bungeoppang_v4_order_index");
        assertThat(jdbc.queryForList("""
                SELECT COLUMN_NAME FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bungeoppang_v4_rounds'
                  AND COLUMN_NAME IN ('final_request_hash','final_through_seq','final_prefix_hash','settled_at','reward_date')
                ORDER BY ORDINAL_POSITION
                """, String.class)).containsExactly("final_request_hash", "final_through_seq",
                        "final_prefix_hash", "settled_at", "reward_date");
    }

    @Test
    void v4_시작원본과_첫주문을_영속화하고_동일키는_같은응답을_재생한다() throws Exception {
        String body = "{\"minigameType\":\"BUNGEOPPANG\",\"rulesVersion\":\"v4\"}";
        var first = request("POST", "", 101, body, "v4-start-one");
        var replay = request("POST", "", 101, body, "v4-start-one");

        assertThat(first.statusCode()).isEqualTo(201);
        assertThat(replay.statusCode()).isEqualTo(201);
        assertThat(replay.body()).isEqualTo(first.body());
        JsonNode issued = mapper.readTree(first.body());
        long sessionId = issued.path("minigameSessionId").asLong();
        assertThat(issued.path("rulesVersion").asText()).isEqualTo("v4");
        assertThat(issued.path("phase").asText()).isEqualTo("WAITING_START");
        assertThat(issued.path("heats")).hasSize(512);
        assertThat(issued.at("/checkpoint/currentOrder/items/bean").asInt()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bungeoppang_v4_rounds WHERE minigame_session_id=?",
                Integer.class, sessionId)).isOne();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bungeoppang_v4_orders"
                + " WHERE minigame_session_id=? AND order_id=1 AND order_index=0 AND bean=2",
                Integer.class, sessionId)).isOne();
        assertThat(jdbc.queryForObject("SELECT JSON_LENGTH(heats) FROM bungeoppang_records"
                + " WHERE minigame_session_id=?", Integer.class, sessionId)).isEqualTo(512);
        assertThat(balance()).isEqualTo(100);
        assertThat(count("wallet_transactions")).isZero();

        var lobby = request("GET", "?rulesVersion=v4", 101, null, null);
        assertThat(lobby.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(lobby.body()).path("activeSessionId").asLong()).isEqualTo(sessionId);
        var compact = mapper.readTree(request("GET", "/" + sessionId, 101, null, null).body());
        assertThat(compact.has("heats")).isFalse();
        var source = mapper.readTree(request("GET", "/" + sessionId + "?includeSource=true",
                101, null, null).body());
        assertThat(source.path("heats")).hasSize(512);
        assertThat(source.path("issuedOrders")).hasSize(1);

        var conflict = request("POST", "", 101, "{\"minigameType\":\"BUNGEOPPANG\"}",
                "v4-start-one");
        assertThat(conflict.statusCode()).isEqualTo(409);
        assertThat(conflict.body()).contains("IDEMPOTENCY_KEY_CONFLICT");
    }

    @Test
    void v4_동시시작은_한세션으로_수렴하고_만료시_원본은_재생성하지_않는다() throws Exception {
        BungeoppangV4Responses.StartResponse first;
        BungeoppangV4Responses.StartResponse second;
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var one = executor.submit(() -> {
                gate.await();
                return minigames.startV4(101, "BUNGEOPPANG", "same-v4");
            });
            var two = executor.submit(() -> {
                gate.await();
                return minigames.startV4(101, "BUNGEOPPANG", "same-v4");
            });
            gate.countDown();
            first = one.get(10, TimeUnit.SECONDS);
            second = two.get(10, TimeUnit.SECONDS);
        }
        assertThat(second).isEqualTo(first);
        long sessionId = Long.parseLong(first.minigameSessionId());
        assertThat(count("minigame_sessions")).isOne();
        assertThat(count("bungeoppang_v4_rounds")).isOne();
        assertThat(count("bungeoppang_v4_orders")).isOne();

        jdbc.update("UPDATE bungeoppang_v4_rounds SET"
                + " issued_at=TIMESTAMPADD(MINUTE,-10,issued_at),"
                + " countdown_starts_at=TIMESTAMPADD(MINUTE,-10,countdown_starts_at),"
                + " play_starts_at=TIMESTAMPADD(MINUTE,-10,play_starts_at),"
                + " play_ends_at=TIMESTAMPADD(MINUTE,-10,play_ends_at),"
                + " submit_deadline=TIMESTAMPADD(MINUTE,-10,submit_deadline),"
                + " expires_at=TIMESTAMPADD(MINUTE,-10,expires_at) WHERE minigame_session_id=?", sessionId);
        jdbc.update("UPDATE minigame_sessions SET started_at=TIMESTAMPADD(MINUTE,-10,started_at) WHERE id=?",
                sessionId);
        var expired = (BungeoppangV4Responses.SessionResponse) minigames.loadSession(101, sessionId, true);
        assertThat(expired.status()).isEqualTo("INVALID");
        assertThat(expired.endReason()).isEqualTo("EXPIRED");
        assertThat(expired.heats()).isEqualTo(first.heats());
        var replay = minigames.startV4(101, "BUNGEOPPANG", "same-v4");
        assertThat(replay.minigameSessionId()).isEqualTo(first.minigameSessionId());
        assertThat(replay.heats()).isEqualTo(first.heats());
        assertThat(replay.issuedAt()).isEqualTo(expired.issuedAt());
        assertThat(replay.checkpoint()).isEqualTo(first.checkpoint());
        assertThat(count("minigame_sessions")).isOne();
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
        assertThat(balance()).isEqualTo(117);
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
            for (var future : futures) { assertThat(future.get(10, TimeUnit.SECONDS)).isEqualTo(17); }
        }
        assertThat(balance()).isEqualTo(117);
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
        assertThat(minigames.complete(101, id(start), body).rewardAmount()).isEqualTo(17);
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
        historyReward(998);
        var first = ready("first");
        var result = minigames.complete(101, id(first), BungeoppangFixtures.sevenGolden(first.heats()));
        assertThat(result.coinsGranted()).isEqualTo(2);
        assertThat(result.todayEarned()).isEqualTo(1000);
        var second = ready("second");
        assertThat(minigames.complete(101, id(second), BungeoppangFixtures.sevenGolden(second.heats())).coinsGranted()).isZero();
        assertThat(balance()).isEqualTo(102);
    }

    @Test
    void KST자정_전날보상은_오늘상한에_포함하지않는다() {
        historyReward(1000);
        jdbc.update("UPDATE minigame_sessions SET ended_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 DAY)");
        jdbc.update("UPDATE wallet_transactions SET created_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 DAY)");
        var start = ready("one");
        assertThat(minigames.complete(101, id(start), BungeoppangFixtures.sevenGolden(start.heats())).coinsGranted()).isEqualTo(17);
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
        assertThat(balance()).isEqualTo(112);
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
        // 공통 한도는 세션의 계산 보상이 아니라 실제 지급 원장을 기준으로 한다.
        jdbc.update("""
                INSERT INTO wallet_transactions(wallet_id, transaction_type, balance_delta, reserved_delta,
                    idempotency_key, created_at)
                SELECT id, 'MINIGAME_REWARD', ?, 0, 'history-reward', UTC_TIMESTAMP(3)
                FROM wallets WHERE user_id = 101
                """, reward);
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

    @Test
    void v4_납품_다음주문_checkpoint_영수증을_원자저장하고_재시작후_같은응답을_재생한다() throws Exception {
        var started = readyV4("delivery-start");
        long sessionId = Long.parseLong(started.minigameSessionId());
        var request = delivery(sessionId, "delivery-one");

        var first = minigames.deliver(101, sessionId, "delivery-one", request);
        var replay = minigames.deliver(101, sessionId, "delivery-one", request);

        assertThat(replay).isEqualTo(first);
        assertThat(first.scoreDelta()).isEqualTo(20);
        assertThat(first.consumedBreadIds()).containsExactly(1L, 2L);
        assertThat(count("bungeoppang_v4_receipts")).isOne();
        assertThat(count("bungeoppang_v4_orders")).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT approved_through_seq FROM bungeoppang_v4_rounds"
                + " WHERE minigame_session_id=?", Integer.class, sessionId)).isEqualTo(9);
        assertThat(jdbc.queryForObject("SELECT JSON_LENGTH(accepted_log_json) FROM bungeoppang_v4_progress"
                + " WHERE minigame_session_id=?", Integer.class, sessionId)).isEqualTo(9);
        assertThat(balance()).isEqualTo(100);
        assertThat(count("wallet_transactions")).isZero();

        var loaded = (BungeoppangV4Responses.SessionResponse) minigames.loadSession(
                101, sessionId, false, true, "delivery-one");
        assertThat(loaded.acceptedLog()).hasSize(9);
        assertThat(loaded.issuedOrders()).hasSize(2);
        assertThat(mapper.valueToTree(loaded.deliveryLookup()).path("outcome").asText()).isEqualTo("ACCEPTED");
        assertThat(mapper.valueToTree(loaded.deliveryLookup()).at("/response/scoreDelta").asLong()).isEqualTo(20);
    }

    @Test
    void v4_납품_동시중복과_키본문충돌_같은주문다른키를_차단한다() throws Exception {
        var started = readyV4("delivery-race");
        long sessionId = Long.parseLong(started.minigameSessionId());
        var request = delivery(sessionId, "same-delivery");
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var gate = new CountDownLatch(1);
            var one = executor.submit(() -> { gate.await(); return minigames.deliver(101, sessionId, "same-delivery", request); });
            var two = executor.submit(() -> { gate.await(); return minigames.deliver(101, sessionId, "same-delivery", request); });
            gate.countDown();
            assertThat(two.get(10, TimeUnit.SECONDS)).isEqualTo(one.get(10, TimeUnit.SECONDS));
        }
        assertThat(count("bungeoppang_v4_receipts")).isOne();
        assertThat(count("bungeoppang_v4_orders")).isEqualTo(2);

        var changed = delivery(sessionId, "other-body");
        assertThatThrownBy(() -> minigames.deliver(101, sessionId, "same-delivery", changed))
                .isInstanceOfSatisfying(MinigameException.class,
                        error -> assertThat(error.code()).isEqualTo("IDEMPOTENCY_KEY_CONFLICT"));
        assertThatThrownBy(() -> minigames.deliver(101, sessionId, "other-body", changed))
                .isInstanceOfSatisfying(MinigameException.class,
                        error -> assertThat(error.code()).isEqualTo("ORDER_ALREADY_DELIVERED"));
        assertThat(count("bungeoppang_v4_receipts")).isEqualTo(2);
    }

    @Test
    void v4_납품_영수증저장실패는_주문_checkpoint_prefix를_전부롤백한다() {
        var started = readyV4("delivery-rollback");
        long sessionId = Long.parseLong(started.minigameSessionId());
        var request = delivery(sessionId, "rollback-delivery");
        jdbc.execute("CREATE TRIGGER minigame_test_fail_delivery_receipt BEFORE INSERT ON bungeoppang_v4_receipts"
                + " FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test delivery receipt failure'");
        try {
            assertThatThrownBy(() -> minigames.deliver(101, sessionId, "rollback-delivery", request))
                    .isInstanceOf(RuntimeException.class);
            assertThat(count("bungeoppang_v4_receipts")).isZero();
            assertThat(count("bungeoppang_v4_orders")).isOne();
            assertThat(jdbc.queryForObject("SELECT approved_through_seq FROM bungeoppang_v4_rounds"
                    + " WHERE minigame_session_id=?", Integer.class, sessionId)).isZero();
            assertThat(jdbc.queryForObject("SELECT JSON_LENGTH(accepted_log_json) FROM bungeoppang_v4_progress"
                    + " WHERE minigame_session_id=?", Integer.class, sessionId)).isZero();
            assertThat(balance()).isEqualTo(100);
        } finally { jdbc.execute("DROP TRIGGER minigame_test_fail_delivery_receipt"); }
        assertThat(minigames.deliver(101, sessionId, "rollback-delivery", request).accepted()).isTrue();
    }

    @Test
    void v4_완료는_최종결과_Wallet_원장을_원자적으로_한번만_저장한다() {
        var started = completionReadyV4("complete-start");
        long sessionId = Long.parseLong(started.minigameSessionId());
        var delivery = delivery(sessionId, "delivery-one");
        minigames.deliver(101, sessionId, "delivery-one", delivery);
        JsonNode body = completionBody(sessionId, delivery.log(), 999_999);

        var first = (BungeoppangV4CompleteDtos.Response) minigames.complete(
                101, sessionId, "complete-one", body);
        var replay = minigames.complete(101, sessionId, "complete-one", body);
        var anotherKey = minigames.complete(101, sessionId, "complete-two", body);

        assertThat(replay).isEqualTo(first);
        assertThat(anotherKey).isEqualTo(first);
        assertThat(first).satisfies(result -> {
            assertThat(result.score()).isEqualTo(20);
            assertThat(result.served()).isEqualTo(2);
            assertThat(result.coinsCalculated()).isEqualTo(4);
            assertThat(result.coinsGranted()).isEqualTo(4);
            assertThat(result.rewardAmount()).isEqualTo(4);
            assertThat(result.finalThroughSeq()).isEqualTo(9);
        });
        assertThat(balance()).isEqualTo(104);
        assertThat(jdbc.queryForObject("SELECT reserved_balance FROM wallets WHERE user_id=101", Long.class))
                .isEqualTo(10);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions"
                + " WHERE transaction_type='MINIGAME_REWARD' AND minigame_session_id=?", Integer.class, sessionId))
                .isOne();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bungeoppang_v4_receipts"
                + " WHERE operation='COMPLETE'", Integer.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT terminal_reason FROM bungeoppang_v4_rounds"
                + " WHERE minigame_session_id=?", String.class, sessionId)).isEqualTo("VERIFIED");

        var loaded = (BungeoppangV4Responses.SessionResponse) minigames.loadSession(101, sessionId, false);
        assertThat(loaded.result()).isEqualTo(first);
        assertThat(loaded.checkpoint()).isNull();
        assertThat(loaded.acceptedLog()).isEmpty();
        assertThat(loaded.issuedOrders()).isEmpty();
    }

    @Test
    void v4_완료가_먼저_와도_마지막_미승인납품을_승인하고_후속납품은_같은영수증을_재생한다() {
        var started = completionReadyV4("complete-before-delivery");
        long sessionId = Long.parseLong(started.minigameSessionId());
        var delivery = delivery(sessionId, "lost-delivery");

        var result = (BungeoppangV4CompleteDtos.Response) minigames.complete(101, sessionId,
                "complete-one", completionBody(sessionId, delivery.log(), 20));
        var deliveryReplay = minigames.deliver(101, sessionId, "lost-delivery", delivery);

        assertThat(result.score()).isEqualTo(20);
        assertThat(deliveryReplay.accepted()).isTrue();
        assertThat(count("bungeoppang_v4_orders")).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bungeoppang_v4_receipts"
                + " WHERE operation='DELIVERY'", Integer.class)).isOne();
        assertThat(balance()).isEqualTo(104);
        assertThat(count("wallet_transactions")).isOne();
    }

    @Test
    void v4_불법_suffix는_완료중_생성한_납품_주문_영수증까지_롤백한다() {
        var started = completionReadyV4("invalid-suffix");
        long sessionId = Long.parseLong(started.minigameSessionId());
        var original = delivery(sessionId, "pending-delivery");
        var actions = new ArrayList<>(original.log());
        actions.add(new BungeoppangV4DeliveryDtos.Action(10, "POUR", 100, 2, null, null, null, null));

        assertThatThrownBy(() -> minigames.complete(101, sessionId, "complete-one",
                completionBody(sessionId, actions, 20)))
                .isInstanceOfSatisfying(MinigameException.class,
                        error -> assertThat(error.code()).isEqualTo("LOG_INVALID"));
        assertThat(count("bungeoppang_v4_receipts")).isZero();
        assertThat(count("bungeoppang_v4_orders")).isOne();
        assertThat(jdbc.queryForObject("SELECT approved_through_seq FROM bungeoppang_v4_rounds"
                + " WHERE minigame_session_id=?", Integer.class, sessionId)).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM minigame_sessions WHERE id=?", String.class, sessionId))
                .isEqualTo("PLAYING");
        assertThat(balance()).isEqualTo(100);
        assertThat(count("wallet_transactions")).isZero();
    }

    @Test
    void v4_원장실패는_완료_납품_지갑을_모두롤백하고_같은요청으로_재시도한다() {
        var started = completionReadyV4("complete-rollback");
        long sessionId = Long.parseLong(started.minigameSessionId());
        var delivery = delivery(sessionId, "delivery-one");
        JsonNode body = completionBody(sessionId, delivery.log(), 20);
        jdbc.execute("CREATE TRIGGER minigame_test_fail_ledger BEFORE INSERT ON wallet_transactions"
                + " FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test ledger failure'");
        try {
            assertThatThrownBy(() -> minigames.complete(101, sessionId, "complete-one", body))
                    .isInstanceOf(RuntimeException.class);
            assertThat(balance()).isEqualTo(100);
            assertThat(count("wallet_transactions")).isZero();
            assertThat(count("bungeoppang_v4_receipts")).isZero();
            assertThat(count("bungeoppang_v4_orders")).isOne();
            assertThat(jdbc.queryForObject("SELECT status FROM minigame_sessions WHERE id=?",
                    String.class, sessionId)).isEqualTo("PLAYING");
        } finally { jdbc.execute("DROP TRIGGER minigame_test_fail_ledger"); }
        assertThat(((BungeoppangV4CompleteDtos.Response) minigames.complete(
                101, sessionId, "complete-one", body)).coinsGranted()).isEqualTo(4);
        assertThat(balance()).isEqualTo(104);
    }

    @Test
    void v4_동시완료는_같은결과로_수렴하고_완료와포기는_하나의_terminal만_확정한다() throws Exception {
        var started = completionReadyV4("complete-race");
        final long firstSessionId = Long.parseLong(started.minigameSessionId());
        JsonNode body = completionBody(firstSessionId, delivery(firstSessionId, "delivery-one").log(), 20);
        var completeGate = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var one = executor.submit(() -> raceObject(completeGate,
                    () -> minigames.complete(101, firstSessionId, "complete-one", body)));
            var two = executor.submit(() -> raceObject(completeGate,
                    () -> minigames.complete(101, firstSessionId, "complete-one", body)));
            completeGate.countDown();
            assertThat(two.get(10, TimeUnit.SECONDS)).isEqualTo(one.get(10, TimeUnit.SECONDS));
        }
        assertThat(balance()).isEqualTo(104);
        assertThat(count("wallet_transactions")).isOne();

        setup();
        started = completionReadyV4("terminal-race");
        final long racingSessionId = Long.parseLong(started.minigameSessionId());
        JsonNode empty = completionBody(racingSessionId, List.of(), 0);
        var terminalGate = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var complete = executor.submit(() -> raceObject(terminalGate,
                    () -> minigames.complete(101, racingSessionId, "complete-one", empty)));
            var abandon = executor.submit(() -> raceObject(terminalGate,
                    () -> minigames.abandon(101, racingSessionId)));
            terminalGate.countDown();
            var values = List.of(complete.get(10, TimeUnit.SECONDS), abandon.get(10, TimeUnit.SECONDS));
            assertThat(values.stream().filter(value -> value instanceof MinigameException).count()).isOne();
        }
        assertThat(jdbc.queryForObject("SELECT status FROM minigame_sessions WHERE id=?", String.class, racingSessionId))
                .isIn("COMPLETED", "ABANDONED");
        assertThat(balance()).isEqualTo(100);
    }

    @Test
    void v4_drain중_늦은완료는_판을_바꾸지_않고_만료와_완료가_경합해도_만료판은_지급하지_않는다() throws Exception {
        var started = completionReadyV4("expire-race");
        final long sessionId = Long.parseLong(started.minigameSessionId());
        JsonNode body = completionBody(sessionId, delivery(sessionId, "delivery-one").log(), 20);
        shiftV4(sessionId, 16);
        assertThatThrownBy(() -> minigames.complete(101, sessionId, "complete-late", body))
                .isInstanceOfSatisfying(MinigameException.class,
                        error -> assertThat(error.code()).isEqualTo("GAME_NOT_ACTIVE"));
        assertThat(jdbc.queryForObject("SELECT status FROM minigame_sessions WHERE id=?", String.class, sessionId))
                .isEqualTo("PLAYING");

        shiftV4(sessionId, 10);
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var complete = executor.submit(() -> raceObject(gate,
                    () -> minigames.complete(101, sessionId, "complete-expired", body)));
            var expire = executor.submit(() -> raceObject(gate,
                    () -> minigames.loadSession(101, sessionId, false)));
            gate.countDown();
            assertThat(complete.get(10, TimeUnit.SECONDS)).isInstanceOf(MinigameException.class);
            expire.get(10, TimeUnit.SECONDS);
        }
        assertThat(jdbc.queryForObject("SELECT status FROM minigame_sessions WHERE id=?", String.class, sessionId))
                .isEqualTo("INVALID");
        assertThat(jdbc.queryForObject("SELECT terminal_reason FROM bungeoppang_v4_rounds WHERE minigame_session_id=?",
                String.class, sessionId)).isIn("EXPIRED", "SUBMISSION_EXPIRED");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bungeoppang_v4_rounds WHERE minigame_session_id=?"
                + " AND final_request_hash IS NULL AND settled_at IS NULL", Integer.class, sessionId)).isOne();
        assertThat(balance()).isEqualTo(100);
        assertThat(count("wallet_transactions")).isZero();
        assertThat(count("bungeoppang_v4_receipts")).isZero();
    }

    private BungeoppangV4Responses.StartResponse readyV4(String key) {
        var start = minigames.startV4(101, "BUNGEOPPANG", key);
        long sessionId = Long.parseLong(start.minigameSessionId());
        try {
            jdbc.update("UPDATE bungeoppang_records SET heats=? WHERE minigame_session_id=?",
                    mapper.writeValueAsString(java.util.Collections.nCopies(512, 100)), sessionId);
        } catch (com.fasterxml.jackson.core.JsonProcessingException exception) {
            throw new IllegalStateException(exception);
        }
        jdbc.update("UPDATE bungeoppang_v4_rounds SET"
                + " issued_at=TIMESTAMPADD(SECOND,-35,issued_at),"
                + " countdown_starts_at=TIMESTAMPADD(SECOND,-35,countdown_starts_at),"
                + " play_starts_at=TIMESTAMPADD(SECOND,-35,play_starts_at),"
                + " play_ends_at=TIMESTAMPADD(SECOND,-35,play_ends_at),"
                + " submit_deadline=TIMESTAMPADD(SECOND,-35,submit_deadline),"
                + " expires_at=TIMESTAMPADD(SECOND,-35,expires_at) WHERE minigame_session_id=?", sessionId);
        return start;
    }

    private BungeoppangV4Responses.StartResponse completionReadyV4(String key) {
        var start = readyV4(key);
        shiftV4(Long.parseLong(start.minigameSessionId()), 31);
        return start;
    }

    private void shiftV4(long sessionId, int seconds) {
        jdbc.update("UPDATE bungeoppang_v4_rounds SET"
                + " issued_at=TIMESTAMPADD(SECOND,?,issued_at),"
                + " countdown_starts_at=TIMESTAMPADD(SECOND,?,countdown_starts_at),"
                + " play_starts_at=TIMESTAMPADD(SECOND,?,play_starts_at),"
                + " play_ends_at=TIMESTAMPADD(SECOND,?,play_ends_at),"
                + " submit_deadline=TIMESTAMPADD(SECOND,?,submit_deadline),"
                + " expires_at=TIMESTAMPADD(SECOND,?,expires_at) WHERE minigame_session_id=?",
                -seconds, -seconds, -seconds, -seconds, -seconds, -seconds, sessionId);
    }

    private BungeoppangV4DeliveryDtos.Request delivery(long sessionId, String key) {
        var actions = List.of(
                new BungeoppangV4DeliveryDtos.Action(1, "POUR", 0, 0, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(2, "FILL", 300, 0, "bean", null, null, null),
                new BungeoppangV4DeliveryDtos.Action(3, "TURN", 6700, 0, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(4, "TURN", 13100, 0, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(5, "POUR", 13200, 1, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(6, "FILL", 13500, 1, "bean", null, null, null),
                new BungeoppangV4DeliveryDtos.Action(7, "TURN", 19900, 1, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(8, "TURN", 26300, 1, null, null, null, null),
                new BungeoppangV4DeliveryDtos.Action(9, "DELIVER", 26400, null, null, null, "1", key));
        return new BungeoppangV4DeliveryDtos.Request("v4", actions.size(),
                BungeoppangV4DeliveryContract.prefixHash(sessionId, BungeoppangV4Spec.CONFIG_VERSION, actions),
                actions);
    }
    private JsonNode completionBody(long sessionId, List<BungeoppangV4DeliveryDtos.Action> actions,
            long clientScore) {
        var body = mapper.createObjectNode();
        body.put("rulesVersion", "v4");
        body.put("throughSeq", actions.size());
        body.put("prefixHash", BungeoppangV4DeliveryContract.prefixHash(
                sessionId, BungeoppangV4Spec.CONFIG_VERSION, actions));
        var log = body.putArray("log");
        actions.forEach(action -> {
            var node = log.addObject().put("seq", action.seq()).put("action", action.action()).put("t", action.t());
            if (action.slot() != null) { node.put("slot", action.slot()); }
            if (action.filling() != null) { node.put("filling", action.filling()); }
            if (action.breadId() != null) { node.put("breadId", action.breadId()); }
            if (action.orderId() != null) { node.put("orderId", action.orderId()); }
            if (action.deliveryKey() != null) { node.put("deliveryKey", action.deliveryKey()); }
        });
        body.putArray("seenTips").add("START");
        body.put("clientScore", clientScore);
        return body;
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
    private Object raceObject(CountDownLatch gate, java.util.function.Supplier<Object> action) throws Exception {
        gate.await();
        try { return action.get(); } catch (MinigameException exception) { return exception; }
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
