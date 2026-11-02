package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.minigame.domain.BungeoppangV5Order;
import com.ssafy.ontop.minigame.dto.BungeoppangV5Responses;
import com.ssafy.ontop.minigame.service.BungeoppangV5Spec;
import com.ssafy.ontop.minigame.dto.BungeoppangV4CompleteDtos;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
import com.ssafy.ontop.minigame.service.BungeoppangV5DeliveryContract;
import com.ssafy.ontop.minigame.service.MinigameException;
import com.ssafy.ontop.minigame.service.MinigameService;
import com.ssafy.ontop.minigame.service.StoredMinigameResponseException;
import jakarta.persistence.EntityManagerFactory;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
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
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** v5 start, order persistence and recovery against an isolated loopback MySQL test database only. */
@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.minigames.enabled=true", "ontop.shop.enabled=true",
        "ontop.minigames.bungeoppang-v5-enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop,classpath:db/minigame",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class BungeoppangV5MySqlTests {
    @Autowired jakarta.persistence.EntityManager budgetEntities;
    @Autowired org.springframework.transaction.PlatformTransactionManager budgetTransactions;

    @org.junit.jupiter.api.AfterEach
    void 공통지급_검증용_점프맵_행을_정리한다() {
        jdbc.update("DELETE FROM jump_gate_rewards WHERE run_id = 'shared-budget-run'");
        jdbc.update("DELETE FROM jump_runs WHERE id = 'shared-budget-run'");
        jdbc.update("DELETE FROM jump_profiles WHERE user_id = 101");
    }

    @Test
    void 붕어빵과_점프맵이_동시에_보상받아도_공통500냥만_지급하고_재시도는_중복지급하지않는다() throws Exception {
        long sessionId = readyV5("shared-budget");
        var request = delivery(sessionId, "1", "shared-one");
        minigames.deliverV5(101, sessionId, "shared-one", request);
        shift(sessionId, TO_SETTLEMENT);
        JsonNode body = mapper.readTree(completion(sessionId, request.log()));
        jdbc.update("""
                INSERT INTO wallet_transactions(wallet_id, transaction_type, balance_delta, reserved_delta, idempotency_key, created_at)
                SELECT id, 'JUMP_GATE_REWARD', 498, 0, 'shared-budget-seed', CURRENT_TIMESTAMP(3) FROM wallets WHERE user_id = 101
                """);
        jdbc.update("UPDATE wallets SET balance = balance + 498 WHERE user_id = 101");
        var jumps = new com.ssafy.ontop.world.jumpmap.JdbcJumpmapStore(jdbc, budgetEntities, budgetTransactions);
        var now = java.time.Instant.now();
        jumps.start("shared-budget-run", 101, "channel-1", now);
        jumps.passGate("shared-budget-run", 101, 1, 2, 10000, now);
        var gate = new CountDownLatch(1);
        BungeoppangV4CompleteDtos.Response result;
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var bread = executor.submit(() -> race(gate, () -> minigames.complete(101, sessionId, "shared-complete", body)));
            var jump = executor.submit(() -> race(gate, () -> jumps.settle("shared-budget-run", 1, now).orElseThrow()));
            gate.countDown();
            result = (BungeoppangV4CompleteDtos.Response) bread.get(10, TimeUnit.SECONDS);
            var paid = (com.ssafy.ontop.world.jumpmap.JumpmapStore.Settled) jump.get(10, TimeUnit.SECONDS);
            assertThat(result.coinsGranted() + paid.coinsGranted()).isEqualTo(2);
        }
        assertThat(balance()).isEqualTo(600);
        assertThat(jumps.status(101, now).todayEarned()).isEqualTo(500);
        assertThat(result.dailyCap()).isEqualTo(500);
        assertThat(minigames.complete(101, sessionId, "shared-complete", body)).isEqualTo(result);
        jumps.settle("shared-budget-run", 1, now);
        assertThat(balance()).isEqualTo(600);
    }
    private static final String START = "{\"minigameType\":\"BUNGEOPPANG\",\"rulesVersion\":\"v5\"}";

    @Autowired JdbcTemplate jdbc;
    @Autowired MinigameService minigames;
    @Autowired AuthExchangePersistenceService issuer;
    @Autowired Flyway flyway;
    @Autowired EntityManagerFactory entities;
    @Autowired com.ssafy.ontop.world.service.WorldChannelRegistry channels;
    private static final java.nio.file.Path FIXTURES = java.nio.file.Path.of("..", "frontend", "tests", "fixtures");
    /** After readyV5 (40 s) this lands 130 s after play start: past a new round's 120 s end, before its 135 s deadline. */
    private static final int TO_SETTLEMENT = 90;
    @LocalServerPort int port;
    private final ObjectMapper mapper = new ObjectMapper();
    private final ObjectMapper json = new ObjectMapper()
            .setSerializationInclusion(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL);
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
        jdbc.execute("DROP TRIGGER IF EXISTS minigame_test_fail_v5_order");
        jdbc.execute("DROP TRIGGER IF EXISTS minigame_test_fail_v5_receipt");
        jdbc.execute("DROP TRIGGER IF EXISTS minigame_test_fail_v5_ledger");
        for (String table : List.of("jump_gate_rewards", "jump_daily_earnings", "jump_profiles", "jump_runs",
                "bungeoppang_v5_orders", "bungeoppang_v4_receipts", "bungeoppang_v4_progress",
                "bungeoppang_v4_orders", "bungeoppang_v4_rounds", "bungeoppang_records", "bungeoppang_profiles",
                "minigame_start_requests", "wallet_transactions", "minigame_sessions", "shop_purchases",
                "user_items", "items", "wallets", "refresh_tokens", "users")) {
            jdbc.update("DELETE FROM " + table);
        }
        for (long user : new long[]{101, 202}) {
            jdbc.update("INSERT INTO users(id, login_provider, provider_user_id, nickname, character_gender,"
                    + " created_at, updated_at) VALUES (?, 'NAVER', ?, ?, 'MALE',"
                    + " CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))", user, "mini-v5-" + user, "v5" + user);
            jdbc.update("INSERT INTO wallets(user_id, balance, reserved_balance) VALUES (?, 100, 10)", user);
            tokens.put(user, issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                    LoginOutcome.Status.EXISTING_MEMBER, user, null)).accessToken());
        }
    }

    @Test
    void V128_적용과_v5_주문_제약과_JPA_validate를_확인한다() {
        assertThat(flyway.info().applied()).extracting(info -> info.getVersion().getVersion())
                .contains("124", "125", "126", "128");
        assertThat(flyway.info().pending()).isEmpty();
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
        assertThat(entities.getProperties()).containsEntry("hibernate.hbm2ddl.auto", "validate");
        assertThat(entities.getMetamodel().getEntities()).extracting(type -> type.getJavaType().getName())
                .contains(BungeoppangV5Order.class.getName());
        assertThat(jdbc.queryForList("""
                SELECT INDEX_NAME FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='bungeoppang_v5_orders'
                """, String.class)).contains("uk_bungeoppang_v5_order_id", "uk_bungeoppang_v5_order_slot");
        assertThat(jdbc.queryForList("""
                SELECT CONSTRAINT_NAME FROM information_schema.REFERENTIAL_CONSTRAINTS
                WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='bungeoppang_v5_orders'
                """, String.class)).containsExactly("fk_bungeoppang_v5_order_round");
    }

    @Test
    void HTTP_v5_시작은_세션_판원본_주문3건을_저장하고_같은_키는_같은_응답을_재생한다() throws Exception {
        var first = request("POST", "", START, "v5-start-one");
        var replay = request("POST", "", START, "v5-start-one");

        assertThat(first.statusCode()).isEqualTo(201);
        assertThat(replay.statusCode()).isEqualTo(201);
        assertThat(replay.body()).isEqualTo(first.body());
        JsonNode issued = mapper.readTree(first.body());
        long sessionId = issued.path("minigameSessionId").asLong();
        assertThat(issued.path("rulesVersion").asText()).isEqualTo("v5");
        assertThat(issued.path("heats")).hasSize(2_048);
        assertThat(issued.at("/rules/heatAssignment").asText()).isEqualTo("FILL");
        assertThat(issued.at("/checkpoint/activeOrders")).hasSize(3);
        assertThat(issued.at("/checkpoint/activeOrders/0/orderId").isTextual()).isTrue();
        assertThat(jdbc.queryForList("SELECT customer_slot FROM bungeoppang_v5_orders"
                + " WHERE minigame_session_id=? AND available_after_seq=0 ORDER BY order_id", Integer.class, sessionId))
                .containsExactly(0, 1, 2);
        assertThat(jdbc.queryForObject("SELECT config_version FROM bungeoppang_v4_rounds"
                + " WHERE minigame_session_id=?", String.class, sessionId)).isEqualTo(BungeoppangV5Spec.CONFIG_VERSION);
        assertThat(jdbc.queryForObject("SELECT JSON_LENGTH(heats) FROM bungeoppang_records"
                + " WHERE minigame_session_id=? AND rules_version='v5'", Integer.class, sessionId)).isEqualTo(2_048);
        assertThat(count("bungeoppang_v4_orders")).isZero();
        assertThat(count("wallet_transactions")).isZero();

        var recovered = mapper.readTree(request("GET", "/" + sessionId + "?includeProgress=true", null, null).body());
        assertThat(recovered.path("rulesVersion").asText()).isEqualTo("v5");
        assertThat(recovered.path("status").asText()).isEqualTo("PLAYING");
        assertThat(recovered.path("checkpoint")).isEqualTo(issued.path("checkpoint"));
        assertThat(recovered.path("timing")).isEqualTo(issued.path("timing"));
        assertThat(recovered.path("issuedOrders")).isEqualTo(issued.at("/checkpoint/activeOrders"));
        assertThat(recovered.path("acceptedLog")).isEmpty();
        var lobby = mapper.readTree(request("GET", "?rulesVersion=v5", null, null).body());
        assertThat(lobby.path("activeSessionId").asLong()).isEqualTo(sessionId);

        var conflict = request("POST", "", "{\"minigameType\":\"BUNGEOPPANG\",\"rulesVersion\":\"v4\"}",
                "v5-start-one");
        assertThat(conflict.statusCode()).isEqualTo(409);
        assertThat(conflict.body()).contains("IDEMPOTENCY_KEY_CONFLICT");
    }

    @Test
    void 같은_키_동시_시작은_한_세션과_주문3건으로_수렴한다() throws Exception {
        BungeoppangV5Responses.StartResponse first;
        BungeoppangV5Responses.StartResponse second;
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var one = executor.submit(() -> { gate.await(); return minigames.startV5(101, "BUNGEOPPANG", "same-v5"); });
            var two = executor.submit(() -> { gate.await(); return minigames.startV5(101, "BUNGEOPPANG", "same-v5"); });
            gate.countDown();
            first = one.get(10, TimeUnit.SECONDS);
            second = two.get(10, TimeUnit.SECONDS);
        }

        assertThat(second).isEqualTo(first);
        assertThat(count("minigame_sessions")).isOne();
        assertThat(count("bungeoppang_v4_rounds")).isOne();
        assertThat(count("bungeoppang_v5_orders")).isEqualTo(3);
        assertThat(count("minigame_start_requests")).isOne();
    }

    @Test
    void 다른_키_동시_시작은_진행_중인_판을_하나만_남긴다() throws Exception {
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var one = executor.submit(() -> { gate.await(); return minigames.startV5(101, "BUNGEOPPANG", "v5-a"); });
            var two = executor.submit(() -> { gate.await(); return minigames.startV5(101, "BUNGEOPPANG", "v5-b"); });
            gate.countDown();
            one.get(10, TimeUnit.SECONDS);
            two.get(10, TimeUnit.SECONDS);
        }

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM minigame_sessions WHERE status='PLAYING'",
                Integer.class)).isOne();
        assertThat(jdbc.queryForList("SELECT terminal_reason FROM bungeoppang_v4_rounds"
                + " WHERE terminal_reason IS NOT NULL", String.class)).containsExactly("SUPERSEDED");
        assertThat(jdbc.queryForList("SELECT COUNT(*) FROM bungeoppang_v5_orders GROUP BY minigame_session_id",
                Integer.class)).containsExactly(3, 3);
    }

    @Test
    void 주문_저장이_실패하면_세션_판원본_불_시작영수증을_모두_롤백하고_같은_키로_재시도한다() {
        jdbc.execute("CREATE TRIGGER minigame_test_fail_v5_order BEFORE INSERT ON bungeoppang_v5_orders"
                + " FOR EACH ROW BEGIN IF NEW.customer_slot = 2 THEN"
                + " SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test v5 order failure'; END IF; END");
        try {
            assertThatThrownBy(() -> minigames.startV5(101, "BUNGEOPPANG", "atomic-v5"))
                    .isInstanceOf(RuntimeException.class);
            for (String table : List.of("minigame_sessions", "bungeoppang_records", "bungeoppang_v4_rounds",
                    "bungeoppang_v4_progress", "bungeoppang_v5_orders", "minigame_start_requests")) {
                assertThat(count(table)).as(table).isZero();
            }
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS minigame_test_fail_v5_order");
        }

        var retried = minigames.startV5(101, "BUNGEOPPANG", "atomic-v5");
        assertThat(retried.checkpoint().activeOrders()).hasSize(3);
        assertThat(count("bungeoppang_v5_orders")).isEqualTo(3);
    }

    @Test
    void DB는_같은_시점의_같은_손님_자리와_주문_ID_중복을_거절한다() {
        long sessionId = Long.parseLong(minigames.startV5(101, "BUNGEOPPANG", "unique-v5").minigameSessionId());

        assertThatThrownBy(() -> insertOrder(sessionId, 4, 0, 0)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertOrder(sessionId, 1, 1, 9)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertOrder(sessionId, 5, 3, 9)).isInstanceOf(DataAccessException.class);
        insertOrder(sessionId, 4, 1, 9);
        assertThat(count("bungeoppang_v5_orders")).isEqualTo(4);
    }

    @Test
    void 만료_시각이_지난_v5_판은_조회할_때_만료되고_같은_키는_원본을_다시_만들지_않는다() {
        var started = minigames.startV5(101, "BUNGEOPPANG", "expire-v5");
        long sessionId = Long.parseLong(started.minigameSessionId());
        jdbc.update("UPDATE bungeoppang_v4_rounds SET"
                + " issued_at=TIMESTAMPADD(MINUTE,-10,issued_at),"
                + " countdown_starts_at=TIMESTAMPADD(MINUTE,-10,countdown_starts_at),"
                + " play_starts_at=TIMESTAMPADD(MINUTE,-10,play_starts_at),"
                + " play_ends_at=TIMESTAMPADD(MINUTE,-10,play_ends_at),"
                + " submit_deadline=TIMESTAMPADD(MINUTE,-10,submit_deadline),"
                + " expires_at=TIMESTAMPADD(MINUTE,-10,expires_at) WHERE minigame_session_id=?", sessionId);

        var expired = (BungeoppangV5Responses.SessionResponse) minigames.loadSession(101, sessionId, true);
        assertThat(expired.status()).isEqualTo("INVALID");
        assertThat(expired.endReason()).isEqualTo("EXPIRED");
        assertThat(expired.heats()).isEqualTo(started.heats());

        var replay = minigames.startV5(101, "BUNGEOPPANG", "expire-v5");
        assertThat(replay.minigameSessionId()).isEqualTo(started.minigameSessionId());
        assertThat(replay.checkpoint()).isEqualTo(started.checkpoint());
        assertThat(count("minigame_sessions")).isOne();
        assertThat(count("bungeoppang_v5_orders")).isEqualTo(3);
        assertThatThrownBy(() -> minigames.deliver(101, sessionId, "late", null))
                .isInstanceOf(MinigameException.class);
    }

    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.CsvSource({"pizza,false", "chocolate,false", "pizza,true", "chocolate,true"})
    void HTTP_특수소_납품은_새판_30퍼센트와_기존판_50퍼센트를_구분하고_재시도에_보존한다(
            String filling, boolean previous) throws Exception {
        long sessionId = readyV5("bonus");
        if (previous) {
            var old = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.valueToTree(BungeoppangV5Spec.rules());
            old.put("specialBonusPercent", 50);
            storedSnapshot(sessionId, "v5-20261101.1", mapper.treeToValue(old, BungeoppangV5Responses.Rules.class));
        }
        jdbc.update("UPDATE bungeoppang_v5_orders SET bean=0, pizza=?, chocolate=?"
                + " WHERE minigame_session_id=? AND order_id=2",
                filling.equals("pizza") ? 1 : 0, filling.equals("chocolate") ? 1 : 0, sessionId);
        var log = List.of(action(1, "POUR", 0, 0, null), action(2, "FILL", 300, 0, filling),
                action(3, "TURN", 6_700, 0, null), action(4, "TURN", 13_100, 0, null),
                new BungeoppangV4DeliveryDtos.Action(5, "DELIVER", 13_150, null, null, null, "2", "bonus-delivery"));
        var body = new BungeoppangV4DeliveryDtos.Request("v5", log.size(),
                BungeoppangV5DeliveryContract.prefixHash(sessionId, config(sessionId), log), log);

        var response = request("POST", "/" + sessionId + "/deliveries", json.writeValueAsString(body), "bonus-delivery");
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        var approved = mapper.readTree(response.body());
        assertThat(approved.path("scoreDelta").asLong()).isEqualTo(previous ? 15 : 13);
        assertThat(approved.path("bonusDelta").asLong()).isEqualTo(previous ? 5 : 3);
        assertThat(request("POST", "/" + sessionId + "/deliveries", json.writeValueAsString(body), "bonus-delivery").body())
                .isEqualTo(response.body());
    }

    @Test
    void HTTP_선택_납품은_충원_주문_checkpoint_영수증을_원자_저장하고_재접속과_완료_정산이_한번만_이뤄진다()
            throws Exception {
        long sessionId = readyV5("flow");
        var request = delivery(sessionId, "2", "deliver-two");

        var first = request("POST", "/" + sessionId + "/deliveries", json.writeValueAsString(request), "deliver-two");
        var replay = request("POST", "/" + sessionId + "/deliveries", json.writeValueAsString(request), "deliver-two");

        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(replay.body()).isEqualTo(first.body());
        JsonNode approved = mapper.readTree(first.body());
        assertThat(approved.path("consumedBreadIds").toString()).isEqualTo("[1]");
        assertThat(approved.at("/replacementOrder/orderId").asText()).isEqualTo("4");
        assertThat(approved.at("/checkpoint/revision").asInt()).isOne();
        assertThat(jdbc.queryForMap("SELECT customer_slot, available_after_seq FROM bungeoppang_v5_orders"
                + " WHERE minigame_session_id=? AND order_id=4", sessionId))
                .containsEntry("customer_slot", 1).containsEntry("available_after_seq", 9);
        assertThat(count("bungeoppang_v5_orders")).isEqualTo(4);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bungeoppang_v4_receipts WHERE outcome='ACCEPTED'"
                + " AND accepted_order_id=2", Integer.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT revision FROM bungeoppang_v4_rounds WHERE minigame_session_id=?",
                Long.class, sessionId)).isOne();

        var recovered = mapper.readTree(request("GET", "/" + sessionId + "?includeProgress=true", null, null).body());
        assertThat(recovered.path("checkpoint")).isEqualTo(approved.path("checkpoint"));
        assertThat(recovered.path("acceptedLog")).hasSize(9);
        assertThat(recovered.path("issuedOrders")).hasSize(4);

        shift(sessionId, TO_SETTLEMENT);
        var complete = completion(sessionId, request.log());
        var settled = request("POST", "/" + sessionId + "/complete", complete, "done-one");
        var again = request("POST", "/" + sessionId + "/complete", complete, "done-two");
        assertThat(settled.statusCode()).isEqualTo(200);
        assertThat(again.body()).isEqualTo(settled.body());
        assertThat(mapper.readTree(settled.body()).path("rulesVersion").asText()).isEqualTo("v5");
        assertThat(mapper.readTree(settled.body()).path("score").asLong()).isEqualTo(10);
        assertThat(balance()).isEqualTo(100);
        assertThat(count("wallet_transactions")).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM minigame_sessions WHERE id=?", String.class, sessionId))
                .isEqualTo("COMPLETED");
        var loaded = mapper.readTree(request("GET", "/" + sessionId, null, null).body());
        assertThat(loaded.path("result").path("settledAt").isTextual()).isTrue();
        assertThat(loaded.path("result").path("rewardDate").asText()).matches("\\d{4}-\\d{2}-\\d{2}");
    }

    @Test
    void 같은_revision의_다른_동시_납품은_하나만_승인하고_다른_요청은_prefix_충돌로_남는다() throws Exception {
        long sessionId = readyV5("race");
        var two = delivery(sessionId, "2", "race-two");
        var one = delivery(sessionId, "1", "race-one");
        var gate = new CountDownLatch(1);
        List<Object> results;
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> race(gate, () -> minigames.deliverV5(101, sessionId, "race-two", two)));
            var second = executor.submit(() -> race(gate, () -> minigames.deliverV5(101, sessionId, "race-one", one)));
            gate.countDown();
            results = List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
        }

        assertThat(results).filteredOn(BungeoppangV5Responses.DeliveryResponse.class::isInstance).hasSize(1);
        assertThat(results).filteredOn(String.class::isInstance).containsExactly("PREFIX_MISMATCH");
        assertThat(count("bungeoppang_v5_orders")).isEqualTo(4);
        assertThat(jdbc.queryForObject("SELECT revision FROM bungeoppang_v4_rounds WHERE minigame_session_id=?",
                Long.class, sessionId)).isOne();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bungeoppang_v4_receipts WHERE outcome='REJECTED'",
                Integer.class)).isOne();
    }

    @Test
    void 같은_키_동시_재전송은_같은_응답과_주문_하나로_수렴한다() throws Exception {
        long sessionId = readyV5("same");
        var request = delivery(sessionId, "1", "same-key");
        var gate = new CountDownLatch(1);
        List<Object> results;
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> race(gate, () -> minigames.deliverV5(101, sessionId, "same-key", request)));
            var second = executor.submit(() -> race(gate, () -> minigames.deliverV5(101, sessionId, "same-key", request)));
            gate.countDown();
            results = List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
        }

        assertThat(results.get(0)).isInstanceOf(BungeoppangV5Responses.DeliveryResponse.class)
                .isEqualTo(results.get(1));
        assertThat(count("bungeoppang_v5_orders")).isEqualTo(4);
        assertThat(count("bungeoppang_v4_receipts")).isOne();
    }

    @Test
    void 영수증_저장이_실패하면_충원_주문_checkpoint_승인로그를_모두_롤백한다() {
        long sessionId = readyV5("rollback");
        var request = delivery(sessionId, "2", "rollback");
        jdbc.execute("CREATE TRIGGER minigame_test_fail_v5_receipt BEFORE INSERT ON bungeoppang_v4_receipts"
                + " FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test v5 receipt failure'");
        try {
            assertThatThrownBy(() -> minigames.deliverV5(101, sessionId, "rollback", request))
                    .isInstanceOf(RuntimeException.class);
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS minigame_test_fail_v5_receipt");
        }

        assertThat(count("bungeoppang_v5_orders")).isEqualTo(3);
        assertThat(count("bungeoppang_v4_receipts")).isZero();
        assertThat(jdbc.queryForMap("SELECT revision, approved_through_seq FROM bungeoppang_v4_rounds"
                + " WHERE minigame_session_id=?", sessionId))
                .containsEntry("revision", 0L).containsEntry("approved_through_seq", 0);
        assertThat(jdbc.queryForObject("SELECT accepted_log_json FROM bungeoppang_v4_progress"
                + " WHERE minigame_session_id=?", String.class, sessionId)).isEqualTo("[]");

        assertThat(minigames.deliverV5(101, sessionId, "rollback", request).replacementOrder().orderId())
                .isEqualTo("4");
    }

    @Test
    void 동시_완료는_한번만_지급하고_같은_결과로_수렴한다() throws Exception {
        long sessionId = readyV5("settle");
        var request = delivery(sessionId, "1", "settle-one");
        minigames.deliverV5(101, sessionId, "settle-one", request);
        shift(sessionId, TO_SETTLEMENT);
        JsonNode body = mapper.readTree(completion(sessionId, request.log()));
        var gate = new CountDownLatch(1);
        List<Object> results;
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = executor.submit(() -> race(gate, () -> minigames.complete(101, sessionId, "a", body)));
            var second = executor.submit(() -> race(gate, () -> minigames.complete(101, sessionId, "b", body)));
            gate.countDown();
            results = List.of(first.get(10, TimeUnit.SECONDS), second.get(10, TimeUnit.SECONDS));
        }

        assertThat(results.get(0)).isInstanceOf(BungeoppangV4CompleteDtos.Response.class).isEqualTo(results.get(1));
        assertThat(((BungeoppangV4CompleteDtos.Response) results.get(0)).coinsGranted()).isOne();
        assertThat(balance()).isEqualTo(101);
        assertThat(count("wallet_transactions")).isOne();
    }

    @Test
    void 완료_중_원장_저장이_실패하면_마지막_납품_승인과_충원까지_롤백하고_재시도는_한번만_지급한다() {
        long sessionId = readyV5("ledger");
        var log = delivery(sessionId, "1", "last-delivery").log();
        shift(sessionId, TO_SETTLEMENT);
        JsonNode body = completionNode(sessionId, log);
        jdbc.execute("CREATE TRIGGER minigame_test_fail_v5_ledger BEFORE INSERT ON wallet_transactions"
                + " FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test v5 ledger failure'");
        try {
            assertThatThrownBy(() -> minigames.complete(101, sessionId, "done", body))
                    .isInstanceOf(RuntimeException.class);
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS minigame_test_fail_v5_ledger");
        }

        // The trailing DELIVER, its replacement order and the settlement all rolled back together.
        assertThat(count("bungeoppang_v5_orders")).isEqualTo(3);
        assertThat(count("bungeoppang_v4_receipts")).isZero();
        assertThat(jdbc.queryForMap("SELECT revision, approved_through_seq, terminal_reason, final_request_hash,"
                + " settled_at FROM bungeoppang_v4_rounds WHERE minigame_session_id=?", sessionId))
                .containsEntry("revision", 0L).containsEntry("approved_through_seq", 0)
                .containsEntry("terminal_reason", null).containsEntry("final_request_hash", null)
                .containsEntry("settled_at", null);
        assertThat(jdbc.queryForObject("SELECT accepted_log_json FROM bungeoppang_v4_progress"
                + " WHERE minigame_session_id=?", String.class, sessionId)).isEqualTo("[]");
        assertThat(jdbc.queryForObject("SELECT JSON_EXTRACT(checkpoint_json, '$.throughSeq')"
                + " FROM bungeoppang_v4_rounds WHERE minigame_session_id=?", Integer.class, sessionId)).isZero();
        assertThat(jdbc.queryForMap("SELECT status, reward_amount FROM minigame_sessions WHERE id=?", sessionId))
                .containsEntry("status", "PLAYING").containsEntry("reward_amount", 0L);
        assertThat(jdbc.queryForObject("SELECT result_json FROM bungeoppang_records WHERE minigame_session_id=?",
                String.class, sessionId)).isNull();
        assertThat(balance()).isEqualTo(100);
        assertThat(count("wallet_transactions")).isZero();

        var settled = (BungeoppangV4CompleteDtos.Response) minigames.complete(101, sessionId, "done", body);
        var replayed = minigames.complete(101, sessionId, "done", body);

        assertThat(replayed).isEqualTo(settled);
        assertThat(settled.score()).isEqualTo(20);
        assertThat(settled.coinsGranted()).isOne();
        assertThat(balance()).isEqualTo(101);
        assertThat(count("wallet_transactions")).isOne();
        assertThat(count("bungeoppang_v5_orders")).isEqualTo(4);
        assertThat(jdbc.queryForList("SELECT operation FROM bungeoppang_v4_receipts ORDER BY id", String.class))
                .containsExactly("DELIVERY", "COMPLETE");
    }

    @Test
    void HTTP_완료에_남은_미승인_납품은_승인과_충원_뒤_최종_재계산에_한번만_반영된다() throws Exception {
        long sessionId = readyV5("pending");
        var log = delivery(sessionId, "1", "pending-delivery").log();
        shift(sessionId, TO_SETTLEMENT);
        String body = completion(sessionId, log);

        var completed = request("POST", "/" + sessionId + "/complete", body, "done-one");
        var sameKey = request("POST", "/" + sessionId + "/complete", body, "done-one");
        var otherKey = request("POST", "/" + sessionId + "/complete", body, "done-two");

        assertThat(completed.statusCode()).isEqualTo(200);
        assertThat(sameKey.body()).isEqualTo(completed.body());
        assertThat(otherKey.body()).isEqualTo(completed.body());
        JsonNode result = mapper.readTree(completed.body());
        assertThat(result.path("score").asLong()).isEqualTo(20);
        assertThat(result.path("customersServed").asInt()).isOne();
        assertThat(result.path("coinsGranted").asLong()).isOne();
        assertThat(result.path("finalThroughSeq").asInt()).isEqualTo(9);

        assertThat(jdbc.queryForMap("SELECT customer_slot, available_after_seq FROM bungeoppang_v5_orders"
                + " WHERE minigame_session_id=? AND order_id=4", sessionId))
                .containsEntry("customer_slot", 0).containsEntry("available_after_seq", 9);
        assertThat(count("bungeoppang_v5_orders")).isEqualTo(4);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bungeoppang_v4_receipts WHERE operation='DELIVERY'"
                + " AND outcome='ACCEPTED' AND request_key='pending-delivery' AND accepted_order_id=1",
                Integer.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM bungeoppang_v4_receipts WHERE operation='COMPLETE'",
                Integer.class)).isOne();
        assertThat(balance()).isEqualTo(101);
        assertThat(count("wallet_transactions")).isOne();

        var recovered = mapper.readTree(request("GET", "/" + sessionId + "?includeProgress=true", null, null).body());
        assertThat(recovered.path("status").asText()).isEqualTo("COMPLETED");
        assertThat(recovered.path("result")).isEqualTo(result);
        assertThat(recovered.at("/checkpoint/revision").asInt()).isOne();
        assertThat(recovered.at("/checkpoint/throughSeq").asInt()).isEqualTo(9);
        assertThat(recovered.at("/checkpoint/activeOrders")).extracting(order -> order.path("orderId").asText())
                .containsExactly("2", "3", "4");
        assertThat(recovered.path("acceptedLog")).hasSize(9);
        assertThat(recovered.path("issuedOrders")).hasSize(4);
    }

    /**
     * The FE shared rounds through the real HTTP API: three selected deliveries with replacements, a lost response
     * retry, a refresh recovery, a stale revision, an early completion, then completion, a lost completion retry and
     * result recovery. bungeoppang-v5-2min-flow.json runs on a newly issued two-minute round and the unchanged
     * bungeoppang-v5-flow.json on a stored three-minute round; both reach the same deliveries, score and reward.
     * The FE test replays the same files.
     */
    @org.junit.jupiter.params.ParameterizedTest(name = "{0}")
    @org.junit.jupiter.params.provider.CsvSource({
            "bungeoppang-v5-2min-flow.json, v5-20261029.1, 120000, 80",
            "bungeoppang-v5-flow.json, v5-20261027.1, 180000, 140"})
    void FE_공유_한판을_HTTP로_진행하고_재전송_재접속_오래된_revision_완료재시도를_복구한다(String fixture,
            String configVersion, long durationMs, int toSettlement) throws Exception {
        JsonNode flow = mapper.readTree(java.nio.file.Files.readString(FIXTURES.resolve(fixture)));
        long sessionId = readyV5("shared-flow");
        if (BungeoppangV5Spec.LEGACY_CONFIG_VERSION.equals(configVersion)) { legacy(sessionId); }
        else {
            var old = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.valueToTree(BungeoppangV5Spec.rules());
            old.put("specialBonusPercent", 50).put("queueComplaintPenalty", 0);
            storedSnapshot(sessionId, configVersion, mapper.treeToValue(old, BungeoppangV5Responses.Rules.class));
        }
        // A start retry returns the round as stored: its config version, rules and play length.
        JsonNode start = mapper.readTree(request("POST", "", START, "shared-flow").body());
        assertThat(start.path("configVersion").asText()).isEqualTo(configVersion);
        assertThat(start.at("/rules/durationMs").asLong()).isEqualTo(durationMs);
        assertThat(java.time.Duration.between(java.time.Instant.parse(start.at("/timing/playStartsAt").asText()),
                java.time.Instant.parse(start.at("/timing/playEndsAt").asText())).toMillis()).isEqualTo(durationMs);
        assertThat(start.at("/checkpoint/prefixHash").asText())
                .isEqualTo(BungeoppangV5Spec.initialPrefixHash(sessionId, configVersion));
        List<BungeoppangV4DeliveryDtos.Action> wire = wire(flow);
        int deliveryIndex = 0;
        for (JsonNode expected : flow.path("deliveries")) {
            int throughSeq = expected.path("throughSeq").asInt();
            List<BungeoppangV4DeliveryDtos.Action> prefix = wire.subList(0, throughSeq);
            String key = prefix.getLast().deliveryKey();
            if (deliveryIndex == 1) { shift(sessionId, 10); }
            String body = json.writeValueAsString(new BungeoppangV4DeliveryDtos.Request("v5", throughSeq,
                    BungeoppangV5DeliveryContract.prefixHash(sessionId, config(sessionId), prefix), prefix));

            var response = request("POST", "/" + sessionId + "/deliveries", body, key);
            assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
            JsonNode approved = mapper.readTree(response.body());
            assertThat(approved.path("orderId").asText()).isEqualTo(expected.path("orderId").asText());
            assertThat(approved.path("consumedBreadIds")).isEqualTo(expected.path("consumedBreadIds"));
            assertThat(approved.path("scoreDelta").asLong()).isEqualTo(expected.path("scoreDelta").asLong());
            assertThat(approved.path("bonusDelta").asLong()).isEqualTo(expected.path("bonusDelta").asLong());
            assertThat(approved.at("/replacementOrder/orderId").asText())
                    .isEqualTo(expected.path("replacementOrderId").asText());
            assertThat(approved.at("/checkpoint/revision").asInt()).isEqualTo(deliveryIndex + 1);
            assertThat(approved.at("/checkpoint/throughSeq").asInt()).isEqualTo(throughSeq);
            assertThat(approved.at("/checkpoint/stats/score").asLong()).isEqualTo(expected.path("score").asLong());
            assertThat(approved.at("/checkpoint/tray")).extracting(bread -> bread.path("breadId").asLong())
                    .containsExactlyElementsOf(longs(expected.path("tray")));
            assertThat(approved.at("/checkpoint/activeOrders")).extracting(order -> order.path("orderId").asText())
                    .containsExactlyElementsOf(texts(expected.path("activeOrders")));
            // Server-drawn replacement items are pinned to the shared file before the next delivery uses them.
            JsonNode replacement = flow.path("orders").get(Integer.parseInt(expected.path("replacementOrderId").asText()) - 1);
            assertThat(approved.at("/replacementOrder/customerSlot")).isEqualTo(replacement.path("customerSlot"));
            assertThat(approved.at("/replacementOrder/availableAfterSeq")).isEqualTo(replacement.path("availableAfterSeq"));
            pinItems(sessionId, replacement);

            if (deliveryIndex == 0) {
                // A: the response was lost, so the same key and body are sent again.
                var retried = request("POST", "/" + sessionId + "/deliveries", body, key);
                assertThat(retried.body()).isEqualTo(response.body());
                assertThat(count("bungeoppang_v5_orders")).isEqualTo(4);
                // B/E: a refresh restores only the approved prefix; unsent local actions are not on the server.
                var recovered = mapper.readTree(request("GET", "/" + sessionId + "?includeProgress=true", null, null).body());
                assertThat(recovered.path("acceptedLog")).hasSize(throughSeq);
                assertThat(recovered.at("/checkpoint/throughSeq").asInt()).isEqualTo(throughSeq);
                assertThat(recovered.at("/checkpoint/prefixHash").asText()).isEqualTo(approved.path("prefixHash").asText());
                // A client still on the opening revision is rejected and pointed back to the approved boundary.
                var staleLog = new java.util.ArrayList<>(wire.subList(0, 8));
                staleLog.add(new BungeoppangV4DeliveryDtos.Action(9, "DELIVER", 26_400, null, null, null, "1", "stale-key"));
                var stale = request("POST", "/" + sessionId + "/deliveries", json.writeValueAsString(
                        new BungeoppangV4DeliveryDtos.Request("v5", 9, BungeoppangV5DeliveryContract.prefixHash(
                                sessionId, config(sessionId), staleLog), staleLog)), "stale-key");
                assertThat(stale.statusCode()).isEqualTo(409);
                JsonNode staleBody = mapper.readTree(stale.body());
                assertThat(staleBody.path("code").asText()).isEqualTo("PREFIX_MISMATCH");
                assertThat(staleBody.at("/recovery/acceptedThroughSeq").asInt()).isEqualTo(throughSeq);
                assertThat(staleBody.at("/recovery/checkpointRevision").asInt()).isOne();
            }
            deliveryIndex++;
        }

        String complete = completion(sessionId, wire);
        // Before playEndsAt the same request is refused without consuming the key.
        var early = request("POST", "/" + sessionId + "/complete", complete, "flow-done");
        assertThat(early.statusCode()).isEqualTo(422);
        assertThat(mapper.readTree(early.body()).path("code").asText()).isEqualTo("TOO_EARLY");
        shift(sessionId, toSettlement);
        var settled = request("POST", "/" + sessionId + "/complete", complete, "flow-done");
        assertThat(settled.statusCode()).as(settled.body()).isEqualTo(200);
        JsonNode result = mapper.readTree(settled.body());
        JsonNode expected = flow.path("expected");
        for (String field : List.of("score", "made", "successfulMade", "golden", "failed", "wasted", "grillDiscarded",
                "trayDiscarded", "maxCombo", "served", "customersServed", "specialServed", "bonusScore",
                "coinsCalculated")) {
            assertThat(result.path(field).asLong()).as(field).isEqualTo(expected.path(field).asLong());
        }
        assertThat(result.path("coinsGranted").asLong()).isEqualTo(2);
        assertThat(result.path("configVersion").asText()).isEqualTo(configVersion);
        assertThat(result.path("finalThroughSeq").asInt()).isEqualTo(wire.size());
        // C: the completion response was lost; both retries return the stored result without paying again.
        assertThat(request("POST", "/" + sessionId + "/complete", complete, "flow-done").body()).isEqualTo(settled.body());
        assertThat(request("POST", "/" + sessionId + "/complete", complete, "flow-done-2").body())
                .isEqualTo(settled.body());
        assertThat(balance()).isEqualTo(102);
        assertThat(count("wallet_transactions")).isOne();
        var finished = mapper.readTree(request("GET", "/" + sessionId + "?includeProgress=true", null, null).body());
        assertThat(finished.path("status").asText()).isEqualTo("COMPLETED");
        assertThat(finished.path("result")).isEqualTo(result);
        assertThat(finished.at("/checkpoint/activeOrders")).extracting(order -> order.path("orderId").asText())
                .containsExactlyElementsOf(texts(expected.path("activeOrders")));
    }

    @Test
    void D_새_판이_이전_판을_교체해도_월드_이용_상태는_새_판으로_남고_포기하면_해제된다() throws Exception {
        long first = mapper.readTree(request("POST", "", START, "replace-a").body()).path("minigameSessionId").asLong();
        long second = mapper.readTree(request("POST", "", START, "replace-b").body()).path("minigameSessionId").asLong();

        var replaced = mapper.readTree(request("GET", "/" + first, null, null).body());
        assertThat(replaced.path("status").asText()).isEqualTo("ABANDONED");
        assertThat(replaced.path("endReason").asText()).isEqualTo("SUPERSEDED");
        assertThat(mapper.readTree(request("GET", "?rulesVersion=v5", null, null).body())
                .path("activeSessionId").asLong()).isEqualTo(second);
        // A's end and B's start were both committed; B stays visible when the user enters the world.
        assertThat(activity()).isEqualTo("BUNGEOPPANG");

        assertThat(request("POST", "/" + second + "/abandon", "{}", null).statusCode()).isEqualTo(200);
        assertThat(activity()).isNull();
    }

    /**
     * Measures a near-maximal valid log per size: the delivery transaction (three replays, receipt, order and
     * checkpoint writes) through the service, one HTTP round trip, and the pure triple replay without the DB.
     * Conditions: local isolated MySQL in the same JVM as the app, no warm-up (sizes run 100 → 3600, so the
     * first sizes include JIT and pool start-up), 3 service runs per size (average and maximum), 1 HTTP run,
     * 20 replay runs. The 3600 target yields about 3515 valid actions: the 50 ms gap allows 3600 in 180 s,
     * but while two breads cook only four slots meet the 300 ms same-slot gap. Only a stored three-minute round
     * can carry such a log (a two-minute round fits at most 2400), so the rounds are rewritten to that snapshot.
     * These are not DEV figures; results go to the test output and only correctness is asserted.
     */
    @Test
    void 성능_로그_길이별_v5_납품_처리_시간을_측정한다() throws Exception {
        var report = new StringBuilder("v5 delivery timing (ms, local isolated MySQL, no warm-up; service x3, http x1,"
                + " replay x20): size, actions, bodyBytes, serviceAvg, serviceMax, http, replay3Avg\n");
        for (int target : new int[]{100, 1_000, 3_000, 3_600}) {
            double serviceTotal = 0;
            double serviceMax = 0;
            int actions = 0;
            int bytes = 0;
            for (int run = 0; run < 3; run++) {
                long sessionId = readyV5("perf-" + target + "-" + run);
                legacy(sessionId);
                shift(sessionId, 150);
                var request = longDelivery(sessionId, target, "perf-" + target + "-" + run);
                actions = request.throughSeq();
                bytes = json.writeValueAsBytes(request).length;
                long started = System.nanoTime();
                var approved = minigames.deliverV5(101, sessionId, "perf-" + target + "-" + run, request);
                double elapsed = (System.nanoTime() - started) / 1e6;
                assertThat(approved.consumedBreadIds()).containsExactly(1L, 2L);
                serviceTotal += elapsed;
                serviceMax = Math.max(serviceMax, elapsed);
            }
            long sessionId = readyV5("perf-http-" + target);
            legacy(sessionId);
            shift(sessionId, 150);
            var request = longDelivery(sessionId, target, "perf-http-" + target);
            long started = System.nanoTime();
            var response = request("POST", "/" + sessionId + "/deliveries", json.writeValueAsString(request),
                    "perf-http-" + target);
            double http = (System.nanoTime() - started) / 1e6;
            assertThat(response.statusCode()).as(response.body()).isEqualTo(200);

            var rules = new com.ssafy.ontop.minigame.service.BungeoppangV5Rules();
            var domain = BungeoppangV5DeliveryContract.domainActions(request.log());
            var heats = java.util.Collections.nCopies(2_048, 100);
            var snapshot = BungeoppangV5Spec.calculationRules(BungeoppangV5Spec.legacyRules());
            var opening = List.of(
                    new com.ssafy.ontop.minigame.service.BungeoppangV5Rules.Order("1", 0, 0,
                            new com.ssafy.ontop.minigame.service.BungeoppangV4Rules.FillingCounts(2, 0, 0, 0)),
                    new com.ssafy.ontop.minigame.service.BungeoppangV5Rules.Order("2", 1, 0,
                            new com.ssafy.ontop.minigame.service.BungeoppangV4Rules.FillingCounts(1, 0, 0, 0)),
                    new com.ssafy.ontop.minigame.service.BungeoppangV5Rules.Order("3", 2, 0,
                            new com.ssafy.ontop.minigame.service.BungeoppangV4Rules.FillingCounts(0, 1, 0, 0)));
            double replayTotal = 0;
            for (int run = 0; run < 20; run++) {
                long replayStarted = System.nanoTime();
                rules.replay(domain.subList(0, domain.size() - 1), heats, opening, snapshot);
                rules.replay(domain, heats, opening, snapshot);
                rules.replay(domain, heats, opening, snapshot);
                replayTotal += (System.nanoTime() - replayStarted) / 1e6;
            }
            report.append(String.format(java.util.Locale.ROOT, "%d, %d, %d, %.1f, %.1f, %.1f, %.2f%n", target, actions,
                    bytes, serviceTotal / 3, serviceMax, http, replayTotal / 20));
        }
        System.out.print(report);
    }

    /** Two golden beans on slots 0 and 1, POUR/DISCARD fillers on the other free slots, then DELIVER order 1. */
    private BungeoppangV4DeliveryDtos.Request longDelivery(long sessionId, int target, String key) {
        var bread = new java.util.TreeMap<Integer, BungeoppangV4DeliveryDtos.Action>();
        bread.put(0, action(0, "POUR", 0, 0, null));
        bread.put(50, action(0, "POUR", 50, 1, null));
        bread.put(300, action(0, "FILL", 300, 0, "bean"));
        bread.put(350, action(0, "FILL", 350, 1, "bean"));
        bread.put(6_700, action(0, "TURN", 6_700, 0, null));
        bread.put(6_750, action(0, "TURN", 6_750, 1, null));
        bread.put(13_100, action(0, "TURN", 13_100, 0, null));
        bread.put(13_150, action(0, "TURN", 13_150, 1, null));
        int fillers = Math.max(0, target - 1 - bread.size());
        int[] lastAt = {-1_000, -1_000, -1_000, -1_000, -1_000, -1_000};
        boolean[] batter = new boolean[6];
        var log = new java.util.ArrayList<BungeoppangV4DeliveryDtos.Action>();
        int t = 0;
        for (; t < 179_900 && (!bread.isEmpty() || fillers > 0); t += 50) {
            var planned = bread.remove(t);
            if (planned != null) {
                log.add(action(log.size() + 1, planned.action(), t, planned.slot(), planned.filling()));
                lastAt[planned.slot()] = t;
                continue;
            }
            if (fillers == 0) { continue; }
            int chosen = -1;
            for (int slot = 0; slot < 6; slot++) {
                boolean cooking = slot == 0 && t <= 13_100 || slot == 1 && t <= 13_150;
                if (!cooking && t - lastAt[slot] >= 300 && (chosen < 0 || lastAt[slot] < lastAt[chosen])) { chosen = slot; }
            }
            if (chosen < 0) { continue; }
            log.add(action(log.size() + 1, batter[chosen] ? "DISCARD" : "POUR", t, chosen, null));
            batter[chosen] = !batter[chosen];
            lastAt[chosen] = t;
            fillers--;
        }
        log.add(new BungeoppangV4DeliveryDtos.Action(log.size() + 1, "DELIVER", t, null, null, null, "1", key));
        return new BungeoppangV4DeliveryDtos.Request("v5", log.size(),
                BungeoppangV5DeliveryContract.prefixHash(sessionId, config(sessionId), log), List.copyOf(log));
    }

    /** Mirrors FE serviceV5: seq from position, DELIVER carries its own key, TRAY_DISCARD its bread ID. */
    private static List<BungeoppangV4DeliveryDtos.Action> wire(JsonNode flow) {
        var actions = new java.util.ArrayList<BungeoppangV4DeliveryDtos.Action>();
        for (JsonNode entry : flow.path("log")) {
            int seq = actions.size() + 1;
            String type = entry.path("action").asText();
            int t = entry.path("t").asInt();
            actions.add(switch (type) {
                case "DELIVER" -> new BungeoppangV4DeliveryDtos.Action(seq, type, t, null, null, null,
                        entry.path("orderId").asText(), flow.path("deliveryKeys").path(Integer.toString(seq)).asText());
                case "TRAY_DISCARD" -> new BungeoppangV4DeliveryDtos.Action(seq, type, t, null, null,
                        entry.path("breadId").asLong(), null, null);
                default -> new BungeoppangV4DeliveryDtos.Action(seq, type, t, entry.path("slot").asInt(),
                        entry.has("filling") ? entry.path("filling").asText() : null, null, null, null);
            });
        }
        return actions;
    }

    private void pinItems(long sessionId, JsonNode order) {
        JsonNode items = order.path("items");
        jdbc.update("UPDATE bungeoppang_v5_orders SET bean=?, custard=?, pizza=?, chocolate=?"
                + " WHERE minigame_session_id=? AND order_id=?", items.path("bean").asInt(), items.path("custard").asInt(),
                items.path("pizza").asInt(), items.path("chocolate").asInt(), sessionId,
                Long.parseLong(order.path("orderId").asText()));
    }

    /**
     * Activity is kept per user, so entering any channel shows it. The local profile configures no world
     * channel, so a private one is added once; the user joins only for this read.
     */
    private String activity() {
        String channelId = "v5-activity-check";
        if (channels.definitions().stream().noneMatch(channel -> channel.channelId().equals(channelId))) {
            channels.addChannel(new com.ssafy.ontop.world.config.WorldChannelProperties.Channel(channelId, "검증", 3));
        }
        channels.join("101", channelId);
        try {
            return channels.worldState(channelId).avatars().stream().filter(avatar -> avatar.userId().equals("101"))
                    .findFirst().orElseThrow().activity();
        } finally {
            channels.disconnect("101");
        }
    }

    private static List<Long> longs(JsonNode values) {
        var result = new java.util.ArrayList<Long>();
        values.forEach(value -> result.add(value.asLong()));
        return result;
    }

    private static List<String> texts(JsonNode values) {
        var result = new java.util.ArrayList<String>();
        values.forEach(value -> result.add(value.asText()));
        return result;
    }

    /** Starts a v5 round with heat 100, known opening items and a play origin 40 seconds in the past. */
    private long readyV5(String key) {
        long sessionId = Long.parseLong(minigames.startV5(101, "BUNGEOPPANG", key).minigameSessionId());
        jdbc.update("UPDATE bungeoppang_records SET heats=? WHERE minigame_session_id=?",
                "[" + "100,".repeat(2_047) + "100]", sessionId);
        for (int[] order : new int[][]{{1, 2, 0}, {2, 1, 0}, {3, 0, 1}}) {
            jdbc.update("UPDATE bungeoppang_v5_orders SET bean=?, custard=?, pizza=0, chocolate=0"
                    + " WHERE minigame_session_id=? AND order_id=?", order[1], order[2], sessionId, order[0]);
        }
        shift(sessionId, 40);
        return sessionId;
    }

    /**
     * Rewrites a freshly started round into the row the previous release stored for a three-minute round: the legacy
     * config version and rules snapshot, play end 180 s after play start (deadline +15 s, expiry +25 s) and the
     * opening hash seeded with the legacy version. Call before any delivery.
     */
    private void legacy(long sessionId) throws Exception {
        storedSnapshot(sessionId, BungeoppangV5Spec.LEGACY_CONFIG_VERSION, BungeoppangV5Spec.legacyRules());
    }

    private void storedSnapshot(long sessionId, String version, BungeoppangV5Responses.Rules rules) throws Exception {
        String hash = BungeoppangV5Spec.initialPrefixHash(sessionId, version);
        var round = jdbc.queryForMap("SELECT config_json, checkpoint_json FROM bungeoppang_v4_rounds"
                + " WHERE minigame_session_id=?", sessionId);
        var config = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree((String) round.get("config_json"));
        config.set("rules", mapper.valueToTree(rules));
        var checkpoint = (com.fasterxml.jackson.databind.node.ObjectNode) mapper.readTree(
                (String) round.get("checkpoint_json"));
        checkpoint.put("prefixHash", hash);
        jdbc.update("UPDATE bungeoppang_v4_rounds SET config_version=?, config_json=?, approved_prefix_hash=?,"
                + " checkpoint_json=?, play_ends_at=TIMESTAMPADD(MICROSECOND,?,play_starts_at),"
                + " submit_deadline=TIMESTAMPADD(MICROSECOND,?,play_starts_at),"
                + " expires_at=TIMESTAMPADD(MICROSECOND,?,play_starts_at) WHERE minigame_session_id=?",
                version, mapper.writeValueAsString(config), hash, mapper.writeValueAsString(checkpoint),
                rules.durationMs() * 1000L, (rules.durationMs() + 15_000L) * 1000L,
                (rules.durationMs() + 25_000L) * 1000L, sessionId);
    }

    private String config(long sessionId) {
        return jdbc.queryForObject("SELECT config_version FROM bungeoppang_v4_rounds WHERE minigame_session_id=?",
                String.class, sessionId);
    }

    private void shift(long sessionId, int seconds) {
        jdbc.update("UPDATE bungeoppang_v4_rounds SET"
                + " issued_at=TIMESTAMPADD(SECOND,?,issued_at),"
                + " countdown_starts_at=TIMESTAMPADD(SECOND,?,countdown_starts_at),"
                + " play_starts_at=TIMESTAMPADD(SECOND,?,play_starts_at),"
                + " play_ends_at=TIMESTAMPADD(SECOND,?,play_ends_at),"
                + " submit_deadline=TIMESTAMPADD(SECOND,?,submit_deadline),"
                + " expires_at=TIMESTAMPADD(SECOND,?,expires_at) WHERE minigame_session_id=?",
                -seconds, -seconds, -seconds, -seconds, -seconds, -seconds, sessionId);
        jdbc.update("UPDATE minigame_sessions SET started_at=TIMESTAMPADD(SECOND,?,started_at) WHERE id=?",
                -seconds, sessionId);
    }

    /** Two golden bean breads, then a DELIVER of the chosen order at 26.4 seconds. */
    private BungeoppangV4DeliveryDtos.Request delivery(long sessionId, String orderId, String key) {
        var log = List.of(
                action(1, "POUR", 0, 0, null), action(2, "FILL", 300, 0, "bean"),
                action(3, "TURN", 6_700, 0, null), action(4, "TURN", 13_100, 0, null),
                action(5, "POUR", 13_200, 1, null), action(6, "FILL", 13_500, 1, "bean"),
                action(7, "TURN", 19_900, 1, null), action(8, "TURN", 26_300, 1, null),
                new BungeoppangV4DeliveryDtos.Action(9, "DELIVER", 26_400, null, null, null, orderId, key));
        return new BungeoppangV4DeliveryDtos.Request("v5", log.size(),
                BungeoppangV5DeliveryContract.prefixHash(sessionId, config(sessionId), log), log);
    }

    private static BungeoppangV4DeliveryDtos.Action action(int seq, String type, int t, int slot, String filling) {
        return new BungeoppangV4DeliveryDtos.Action(seq, type, t, slot, filling, null, null, null);
    }

    private String completion(long sessionId, List<BungeoppangV4DeliveryDtos.Action> log) throws Exception {
        return mapper.writeValueAsString(completionNode(sessionId, log));
    }

    private com.fasterxml.jackson.databind.node.ObjectNode completionNode(long sessionId,
            List<BungeoppangV4DeliveryDtos.Action> log) {
        var body = mapper.createObjectNode();
        body.put("rulesVersion", "v5");
        body.put("throughSeq", log.size());
        body.put("prefixHash", BungeoppangV5DeliveryContract.prefixHash(sessionId, config(sessionId), log));
        body.set("log", json.valueToTree(log));
        body.putArray("seenTips").add("START");
        body.put("clientScore", 0);
        return body;
    }

    private Object race(CountDownLatch gate, java.util.function.Supplier<Object> action) throws Exception {
        gate.await();
        try { return action.get(); }
        catch (StoredMinigameResponseException exception) { return exception.body().code(); }
        catch (MinigameException exception) { return exception.code(); }
    }

    private long balance() { return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=101", Long.class); }

    private void insertOrder(long sessionId, long orderId, int customerSlot, int availableAfterSeq) {
        jdbc.update("INSERT INTO bungeoppang_v5_orders(minigame_session_id, order_id, customer_slot,"
                + " available_after_seq, bean, custard, pizza, chocolate, issued_at)"
                + " VALUES (?, ?, ?, ?, 1, 0, 0, 0, CURRENT_TIMESTAMP(3))",
                sessionId, orderId, customerSlot, availableAfterSeq);
    }

    private int count(String table) { return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class); }

    private HttpResponse<String> request(String method, String path, String body, String key) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/minigames/sessions" + path))
                .header("Authorization", "Bearer " + tokens.get(101L)).header("Origin", "http://localhost:8080");
        if (body != null) { builder.header("Content-Type", "application/json"); }
        if (key != null) { builder.header("Idempotency-Key", key); }
        return http.send(builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
}
