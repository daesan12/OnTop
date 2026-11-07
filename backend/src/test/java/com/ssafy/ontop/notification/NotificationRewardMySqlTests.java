package com.ssafy.ontop.notification;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.notification.repository.NotificationRewardRepository;
import com.ssafy.ontop.notification.service.PersonalNotificationChanged;
import com.ssafy.ontop.user.service.UserWithdrawalPersistenceService;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.event.TransactionalEventListener;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doCallRealMethod;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=dev,db", "ontop.feedback.enabled=true",
        "ontop.admin.read-ids=8101,8303", "ontop.admin.grant-ids=8101",
        "spring.jpa.hibernate.ddl-auto=validate", "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(NotificationRewardMySqlTests.EventsConfiguration.class)
class NotificationRewardMySqlTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired AuthExchangePersistenceService issuer;
    @Autowired UserWithdrawalPersistenceService withdrawal;
    @Autowired Collector collector;
    @Autowired WalletRepository wallets;
    @Autowired PlatformTransactionManager manager;
    @MockitoSpyBean NotificationRewardRepository repository;
    @LocalServerPort int port;
    private final ObjectMapper json = new ObjectMapper();
    private final HttpClient client = HttpClient.newHttpClient();
    private String admin;
    private String member;
    private String other;
    private final Instant expiry = Instant.parse("2030-01-01T00:00:00Z");

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_FEEDBACK_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_feedback_test_reward_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("격리 loopback 보상 테스트 DB가 필요합니다.");
        }
        String dependency = System.getenv("TEST_REWARD_GACHA_LOCATION");
        if (dependency == null || !dependency.endsWith("/output/reward-gacha-dependency")) {
            throw new IllegalStateException("기존 V157 원본의 격리 검증 경로가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_FEEDBACK_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_FEEDBACK_DB_PASSWORD"));
        registry.add("spring.flyway.locations", () -> "classpath:db/migration,classpath:db/minigame,filesystem:" + dependency);
    }

    @BeforeEach
    void 보상_전용_합성_회원과_지갑을_준비한다() {
        cleanup();
        for (long id : new long[]{8101, 8202, 8303}) {
            jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)"
                    + " VALUES(?,'NAVER',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))"
                    + " ON DUPLICATE KEY UPDATE deleted_at=NULL,nickname=VALUES(nickname)", id, "reward-test-" + id, "선물" + id);
            jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES(?,100,0)"
                    + " ON DUPLICATE KEY UPDATE balance=100,reserved_balance=0", id);
        }
        admin = token(8101); member = token(8202); other = token(8303);
        collector.events.clear();
    }

    @AfterEach
    void 검증_보상만_정리한다() { cleanup(); }

    private void cleanup() {
        jdbc.update("DELETE FROM personal_notifications WHERE user_id IN (8101,8202,8303)");
        jdbc.update("DELETE FROM wallet_transactions WHERE idempotency_key LIKE 'notification-reward:%'");
        jdbc.update("DELETE FROM gacha_inventory WHERE user_id IN (8101,8202,8303)");
    }

    @Test
    void 엽전_발송_읽음_수령_재로그인_재확인을_연결한다() throws Exception {
        String id = grant("COIN", 1000);
        assertThat(balance()).isEqualTo(100);
        assertThat(read(request("GET", "/notifications", null, member)).path("items").get(0).path("reward").path("amount").asLong()).isEqualTo(1000);
        var detail = request("PATCH", "/notifications/" + id + "/read", null, member);
        assertThat(detail.statusCode()).isEqualTo(200);
        assertThat(balance()).isEqualTo(100);
        var first = request("POST", claimPath(id), null, member);
        assertThat(first.statusCode()).isEqualTo(200);
        assertThat(read(first).path("balanceAfter").asLong()).isEqualTo(1100);
        assertThat(request("POST", claimPath(id), "{}", token(8202)).body()).isEqualTo(first.body());
        assertThat(balance()).isEqualTo(1100);
        assertThat(ledgerCount()).isEqualTo(1);
        assertThat(collector.events).hasSize(2);
    }

    @Test
    void 지급관리자만_활성회원을_찾고_보상상태를_조회한다() throws Exception {
        var found = request("GET", grantPath() + "/recipients?query=8202", null, admin);
        assertThat(found.statusCode()).isEqualTo(200);
        assertThat(read(found).get(0).path("nickname").asText()).isEqualTo("선물8202");
        assertThat(read(found).get(0).size()).isEqualTo(2);
        String query = java.net.URLEncoder.encode("선물8202", java.nio.charset.StandardCharsets.UTF_8);
        assertThat(read(request("GET", grantPath() + "/recipients?query=" + query, null, admin)).size()).isEqualTo(1);
        assertThat(request("GET", grantPath() + "/recipients?query=8202", null, other).statusCode()).isEqualTo(403);
        assertThat(request("GET", grantPath() + "?userId=8202", null, other).statusCode()).isEqualTo(403);
        assertThat(request("GET", grantPath() + "?userId=0", null, admin).statusCode()).isEqualTo(400);
        assertThat(request("GET", grantPath() + "/recipients?query=", null, admin).statusCode()).isEqualTo(400);
        jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=8303");
        assertThat(read(request("GET", grantPath() + "/recipients?query=8303", null, admin)).isEmpty()).isTrue();
    }

    @Test
    void 발송내역은_회원별로_분리하고_수령과_만료를_구분한다() throws Exception {
        grant("COIN", 1);
        String claimed = grant("COIN", 2), expired = grant("COIN", 3);
        assertThat(request("POST", claimPath(claimed), null, member).statusCode()).isEqualTo(200);
        jdbc.update("UPDATE personal_notifications SET expires_at='2020-01-01' WHERE id=?", expired);
        var rows = read(request("GET", grantPath() + "?userId=8202", null, admin)).path("items");
        assertThat(rows.size()).isEqualTo(3);
        assertThat(rows.get(0).path("status").asText()).isEqualTo("EXPIRED");
        assertThat(rows.get(1).path("status").asText()).isEqualTo("CLAIMED");
        assertThat(rows.get(2).path("status").asText()).isEqualTo("PENDING");
        assertThat(read(request("GET", grantPath() + "?userId=8303", null, admin)).path("items").isEmpty()).isTrue();
        assertThat(balance()).isEqualTo(102);
    }

    @Test
    void 발송내역은_커서로_이전페이지를_중복없이_조회한다() throws Exception {
        for (int i = 0; i < 22; i++) { grant("COIN", 1); }
        var first = read(request("GET", grantPath() + "?userId=8202", null, admin));
        assertThat(first.path("items").size()).isEqualTo(20);
        String cursor = first.path("nextCursor").asText();
        var next = read(request("GET", grantPath() + "?userId=8202&cursor=" + cursor, null, admin));
        assertThat(next.path("items").size()).isEqualTo(2);
        assertThat(next.path("nextCursor").isNull()).isTrue();
        assertThat(Long.parseLong(next.path("items").get(0).path("notificationId").asText())).isLessThan(Long.parseLong(cursor));
    }

    @Test
    void 뽑기권은_별도_잔고_없이_기존_보유함에_원하는_수량만큼_지급한다() throws Exception {
        for (long amount : new long[]{1, 3}) {
            String id = grant("GACHA_TICKET", amount);
            assertThat(request("POST", claimPath(id), null, member).statusCode()).isEqualTo(200);
        }
        assertThat(jdbc.queryForObject("SELECT tickets FROM gacha_inventory WHERE user_id=8202", Long.class)).isEqualTo(4);
        assertThat(balance()).isEqualTo(100);
        assertThat(ledgerCount()).isZero();
        assertThat(jdbc.queryForObject("SELECT first_boxes+second_boxes+third_boxes+fourth_boxes FROM gacha_inventory WHERE user_id=8202", Long.class)).isZero();
    }

    @Test
    void 다중탭_동시수령은_같은_영수증과_한번의_재화증가만_남긴다() throws Exception {
        String id = grant("COIN", 77);
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var one = pool.submit(() -> { start.await(); return request("POST", claimPath(id), null, member); });
            var two = pool.submit(() -> { start.await(); return request("POST", claimPath(id), null, member); });
            start.countDown();
            var first = one.get(); var second = two.get();
            assertThat(first.statusCode()).isEqualTo(200); assertThat(second.statusCode()).isEqualTo(200);
            assertThat(first.body()).isEqualTo(second.body());
        }
        assertThat(balance()).isEqualTo(177); assertThat(ledgerCount()).isEqualTo(1);
        assertThat(collector.events).hasSize(2);
    }

    @Test
    void 동일_발송의_동시요청과_내용변경을_구분한다() throws Exception {
        String key = UUID.randomUUID().toString(), body = command(key, "COIN", 5);
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var one = pool.submit(() -> { start.await(); return request("POST", grantPath(), body, admin); });
            var two = pool.submit(() -> { start.await(); return request("POST", grantPath(), body, admin); });
            start.countDown(); var first = one.get(); var second = two.get();
            assertThat(first.statusCode()).isEqualTo(200); assertThat(second.statusCode()).isEqualTo(200);
            assertThat(first.body()).isEqualTo(second.body());
        }
        assertThat(request("POST", grantPath(), command(key, "COIN", 6), admin).statusCode()).isEqualTo(409);
        assertThat(collector.events).hasSize(1);
    }

    @Test
    void 원장_저장뒤_실패하면_지갑_수령상태_읽음_이벤트를_전부_롤백한다() throws Exception {
        String id = grant("COIN", 5);
        doAnswer(call -> { call.callRealMethod(); throw new jakarta.persistence.PersistenceException("isolated rollback"); })
                .when(repository).coinLedger(anyLong(), any(), any());
        try { assertThat(request("POST", claimPath(id), null, member).statusCode()).isEqualTo(503); }
        finally { doCallRealMethod().when(repository).coinLedger(anyLong(), any(), any()); }
        assertThat(balance()).isEqualTo(100); assertThat(ledgerCount()).isZero();
        assertThat(jdbc.queryForObject("SELECT claimed_at FROM notification_rewards WHERE notification_id=?", java.sql.Timestamp.class, id)).isNull();
        assertThat(jdbc.queryForObject("SELECT read_at FROM personal_notifications WHERE id=?", java.sql.Timestamp.class, id)).isNull();
        assertThat(collector.events).hasSize(1);
        assertThat(request("POST", claimPath(id), null, member).statusCode()).isEqualTo(200);
    }

    @Test
    void 타인수령_미인증_읽기관리자발송_수량위조는_거절한다() throws Exception {
        String id = grant("COIN", 3);
        assertThat(request("POST", claimPath(id), null, other).statusCode()).isEqualTo(404);
        assertThat(request("POST", claimPath(id), null, null).statusCode()).isEqualTo(401);
        assertThat(request("POST", grantPath(), command(UUID.randomUUID().toString(), "COIN", 1), other).statusCode()).isEqualTo(403);
        assertThat(request("POST", claimPath(id), "{\"amount\":9000}", member).statusCode()).isEqualTo(400);
        assertThat(balance()).isEqualTo(100);
    }

    @Test
    void 미수령_만료는_거절하고_이미_수령한_만료보상은_영수증만_재확인한다() throws Exception {
        String expired = grant("COIN", 4), received = grant("COIN", 7);
        var receipt = request("POST", claimPath(received), null, member);
        jdbc.update("UPDATE personal_notifications SET expires_at=TIMESTAMP('2000-01-01 00:00:00') WHERE id IN (?,?)", expired, received);
        assertThat(request("POST", claimPath(expired), null, member).statusCode()).isEqualTo(410);
        assertThat(request("POST", claimPath(received), null, member).body()).isEqualTo(receipt.body());
        assertThat(balance()).isEqualTo(107); assertThat(ledgerCount()).isEqualTo(1);
    }

    @Test
    void 뽑기권_증가뒤_실패와_수량오버플로는_수령완료로_남기지_않는다() throws Exception {
        String id = grant("GACHA_TICKET", 5);
        doAnswer(call -> { call.callRealMethod(); throw new jakarta.persistence.PersistenceException("isolated rollback"); })
                .when(repository).tickets(8202, 5);
        try { assertThat(request("POST", claimPath(id), null, member).statusCode()).isEqualTo(503); }
        finally { doCallRealMethod().when(repository).tickets(8202, 5); }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM gacha_inventory WHERE user_id=8202", Integer.class)).isZero();
        jdbc.update("INSERT INTO gacha_inventory(user_id,tickets) VALUES(8202,9223372036854775807)");
        assertThat(request("POST", claimPath(id), null, member).statusCode()).isEqualTo(409);
        assertThat(jdbc.queryForObject("SELECT claimed_at FROM notification_rewards WHERE notification_id=?", java.sql.Timestamp.class, id)).isNull();
    }

    @Test
    void 지갑_차감과_예약이_동시에_일어나도_보상액을_덮어쓰지_않는다() throws Exception {
        String id = grant("COIN", 40);
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var claim = pool.submit(() -> { start.await(); return request("POST", claimPath(id), null, member); });
            var payment = pool.submit(() -> {
                start.await();
                return new TransactionTemplate(manager).execute(status -> {
                    var wallet = wallets.findForUpdateByUserId(8202).orElseThrow();
                    wallet.debit(30, Instant.now()); wallet.reserveGameEntry(20, Instant.now());
                    return true;
                });
            });
            start.countDown(); assertThat(claim.get().statusCode()).isEqualTo(200); assertThat(payment.get()).isTrue();
        }
        assertThat(balance()).isEqualTo(110);
        assertThat(jdbc.queryForObject("SELECT reserved_balance FROM wallets WHERE user_id=8202", Long.class)).isEqualTo(20);
    }

    @Test
    void 회원탈퇴는_미수령_알림과_보상을_함께_제거한다() throws Exception {
        String id = grant("COIN", 5);
        withdrawal.withdraw(8202);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notification_rewards WHERE notification_id=?", Integer.class, id)).isZero();
        assertThat(request("POST", claimPath(id), null, member).statusCode()).isEqualTo(401);
        assertThat(balance()).isEqualTo(100);
    }

    @Test
    void 화면_안전정수_범위를_넘는_총보유량은_지급하지_않고_원복한다() throws Exception {
        String coin = grant("COIN", 1), ticket = grant("GACHA_TICKET", 1);
        jdbc.update("UPDATE wallets SET balance=9007199254740991 WHERE user_id=8202");
        jdbc.update("INSERT INTO gacha_inventory(user_id,tickets) VALUES(8202,9007199254740991)");
        assertThat(request("POST", claimPath(coin), null, member).statusCode()).isEqualTo(409);
        assertThat(request("POST", claimPath(ticket), null, member).statusCode()).isEqualTo(409);
        assertThat(balance()).isEqualTo(9_007_199_254_740_991L);
        assertThat(jdbc.queryForObject("SELECT tickets FROM gacha_inventory WHERE user_id=8202", Long.class)).isEqualTo(9_007_199_254_740_991L);
        assertThat(ledgerCount()).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM notification_rewards WHERE notification_id IN (?,?) AND claimed_at IS NOT NULL", Integer.class, coin, ticket)).isZero();
    }

    @Test
    void 기존_뽑기권_소비_저장계약과_동시에_수령해도_수량을_덮어쓰지_않는다() throws Exception {
        String id = grant("GACHA_TICKET", 3);
        jdbc.update("INSERT INTO gacha_inventory(user_id,tickets) VALUES(8202,10)");
        CountDownLatch start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var claim = pool.submit(() -> { start.await(); return request("POST", claimPath(id), null, member); });
            var spend = pool.submit(() -> {
                start.await();
                return new TransactionTemplate(manager).execute(status -> {
                    wallets.findForUpdateByUserId(8202).orElseThrow();
                    // 미병합 뽑기 서비스의 지갑 잠금·동일 재고 UPDATE 저장 계약만 검사한다.
                    return jdbc.update("UPDATE gacha_inventory SET tickets=tickets-1 WHERE user_id=8202 AND tickets>=1");
                });
            });
            start.countDown(); assertThat(claim.get().statusCode()).isEqualTo(200); assertThat(spend.get()).isEqualTo(1);
        }
        assertThat(jdbc.queryForObject("SELECT tickets FROM gacha_inventory WHERE user_id=8202", Long.class)).isEqualTo(12);
    }

    private long balance() { return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=8202", Long.class); }
    private int ledgerCount() { return jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE idempotency_key LIKE 'notification-reward:%'", Integer.class); }
    private String token(long id) { return issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER, LoginOutcome.Status.EXISTING_MEMBER, id, null)).accessToken(); }
    private String grant(String kind, long amount) throws Exception {
        var response = request("POST", grantPath(), command(UUID.randomUUID().toString(), kind, amount), admin);
        assertThat(response.statusCode()).as(response.body()).isEqualTo(200);
        return read(response).path("notificationId").asText();
    }
    private String command(String key, String kind, long amount) throws Exception {
        return json.writeValueAsString(Map.of("operationId", key, "userId", "8202", "kind", kind,
                "amount", amount, "title", "소중한 의견 감사합니다", "text", "온탑에서 보내는 작은 선물입니다.", "expiresAt", expiry.toString()));
    }
    private String grantPath() { return "/admin/wallet-grants/rewards"; }
    private String claimPath(String id) { return "/notifications/" + id + "/claim"; }
    private JsonNode read(HttpResponse<String> response) throws Exception { return json.readTree(response.body()); }
    private HttpResponse<String> request(String method, String path, String body, String token) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1" + path))
                .header("Origin", "https://dev.on-top.world").timeout(java.time.Duration.ofSeconds(20));
        if (token != null) { request.header("Authorization", "Bearer " + token); }
        if (body != null) { request.header("Content-Type", "application/json"); }
        return client.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
    @TestConfiguration
    static class EventsConfiguration { @Bean Collector rewardCollector() { return new Collector(); } }
    static class Collector {
        final CopyOnWriteArrayList<PersonalNotificationChanged> events = new CopyOnWriteArrayList<>();
        @TransactionalEventListener public void committed(PersonalNotificationChanged event) { events.add(event); }
    }
}
