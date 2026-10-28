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
    private static final String START = "{\"minigameType\":\"BUNGEOPPANG\",\"rulesVersion\":\"v5\"}";

    @Autowired JdbcTemplate jdbc;
    @Autowired MinigameService minigames;
    @Autowired AuthExchangePersistenceService issuer;
    @Autowired Flyway flyway;
    @Autowired EntityManagerFactory entities;
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
        for (String table : List.of("bungeoppang_v5_orders", "bungeoppang_v4_receipts", "bungeoppang_v4_progress",
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

        shift(sessionId, 150);
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
        shift(sessionId, 150);
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
        shift(sessionId, 150);
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
        shift(sessionId, 150);
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
                BungeoppangV5DeliveryContract.prefixHash(sessionId, BungeoppangV5Spec.CONFIG_VERSION, log), log);
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
        body.put("prefixHash", BungeoppangV5DeliveryContract.prefixHash(sessionId, BungeoppangV5Spec.CONFIG_VERSION, log));
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
