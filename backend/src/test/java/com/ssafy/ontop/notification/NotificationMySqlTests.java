package com.ssafy.ontop.notification;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.notification.repository.NotificationRepository;
import com.ssafy.ontop.event.contact.WinnerContactRepository;
import com.ssafy.ontop.feedback.repository.FeedbackRepository;
import com.ssafy.ontop.notification.service.PersonalNotificationChanged;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.user.service.UserWithdrawalPersistenceService;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
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
import org.springframework.transaction.event.TransactionalEventListener;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doNothing;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=dev,db", "ontop.feedback.enabled=true",
        "ontop.admin.read-ids=101", "ontop.admin.operation-ids=101",
        "ontop.feedback.administrator-ids=101", "spring.jpa.hibernate.ddl-auto=validate",
        "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop",
        "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(NotificationMySqlTests.EventsConfiguration.class)
class NotificationMySqlTests {
    private static final LocalDate EVENT_WEEK = LocalDate.of(2025, 12, 1);
    @Autowired JdbcTemplate jdbc;
    @Autowired AuthExchangePersistenceService issuer;
    @Autowired UserWithdrawalPersistenceService withdrawal;
    @Autowired DeliveryCollector collector;
    @MockitoSpyBean TableHub hub;
    @MockitoSpyBean NotificationRepository repository;
    @MockitoSpyBean FeedbackRepository feedback;
    @LocalServerPort int port;
    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient client = HttpClient.newHttpClient();
    private String administrator;
    private String member;
    private String other;

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_FEEDBACK_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_feedback_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("격리 loopback 소리함 테스트 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_FEEDBACK_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv().getOrDefault("TEST_FEEDBACK_DB_PASSWORD",""));
    }

    @BeforeEach
    void 격리_의견과_회원만_초기화한다() {
        cleanupEventFixture();
        jdbc.update("DELETE FROM feedback_messages");
        collector.events.clear();
        for (long id : new long[]{101, 202, 303}) {
            jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)"
                    + " VALUES(?,'NAVER',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))"
                    + " ON DUPLICATE KEY UPDATE deleted_at=NULL,nickname=VALUES(nickname)",
                    id, "inbox-test-" + id, "산책자" + id);
        }
        administrator = token(101);
        member = token(202);
        other = token(303);
        doNothing().when(hub).requireFeedbackAccess(anyLong(), anyString(), anyDouble(), anyDouble(), anyDouble());
    }

    @Test
    void 발표된_당첨만_주차별_알림으로_연결하고_지급_후에도_다시_확인한다() throws Exception {
        Instant now = Instant.now();
        long first = eventAward("JUMPMAP", now.minusSeconds(3600), now);
        eventAward("BUNGEOPPANG", now.plusSeconds(3600), now);
        try {
            var firstList = json(request("GET", "/notifications", null, member));
            assertThat(firstList.path("items")).hasSize(1);
            String id = firstList.path("items").get(0).path("id").asText();
            assertThat(firstList.path("items").get(0).path("type").asText()).isEqualTo("EVENT_WINNER");
            assertThat(firstList.path("items").get(0).path("eventWeekStartDate").asText())
                    .isEqualTo(EVENT_WEEK.toString());
            assertThat(firstList.toString()).doesNotContain("01012345678");
            assertThat(json(request("GET", "/notifications", null, member)).path("items").get(0)
                    .path("id").asText()).isEqualTo(id);
            assertThat(request("GET", "/notifications/" + id, null, other).statusCode()).isEqualTo(404);

            var initial = json(request("PATCH", "/notifications/" + id + "/read", null, member));
            assertThat(initial.path("event").path("awards")).hasSize(1);
            assertThat(initial.path("event").path("contactActionRequired").asBoolean()).isTrue();
            assertThat(initial.path("readAt").isNull()).isFalse();

            jdbc.update("INSERT INTO event_prize_deliveries(winner_id, delivered_by_user_id, delivered_at)"
                    + " VALUES (?, 101, ?)", first, Timestamp.from(now));
            var contacts = new WinnerContactRepository(jdbc);
            assertThat(contacts.publishedDeliveryByWeek(202, Instant.now()).get(EVENT_WEEK)).isTrue();
            assertThat(json(request("GET", "/notifications/" + id, null, member))
                    .path("event").path("contactActionRequired").asBoolean()).isFalse();

            jdbc.update("UPDATE event_rounds SET announces_at = ? WHERE event_type = 'BUNGEOPPANG'"
                    + " AND week_start_date = ?", Timestamp.from(now.minusSeconds(1800)),
                    java.sql.Date.valueOf(EVENT_WEEK));
            assertThat(contacts.publishedDeliveryByWeek(202, Instant.now()).get(EVENT_WEEK)).isFalse();
            var refreshed = json(request("GET", "/notifications", null, member));
            assertThat(refreshed.path("items")).hasSize(1);
            assertThat(refreshed.path("items").get(0).path("id").asText()).isEqualTo(id);
            var multiple = json(request("GET", "/notifications/" + id, null, member));
            assertThat(multiple.path("event").path("awards")).hasSize(2);
            assertThat(multiple.path("event").path("allPrizesDelivered").asBoolean()).isFalse();
            assertThat(multiple.path("event").path("contactActionRequired").asBoolean()).isTrue();

            jdbc.update("INSERT INTO event_contact_receipts(user_id, week_start_date,"
                    + " first_submitted_at, expires_at, last_updated_at) VALUES (202, ?, ?, ?, ?)",
                    java.sql.Date.valueOf(EVENT_WEEK), Timestamp.from(now.minusSeconds(1200)),
                    Timestamp.from(now.plusSeconds(14 * 86400L)), Timestamp.from(now.minusSeconds(600)));
            jdbc.update("INSERT INTO event_winner_contacts(user_id, week_start_date, encrypted_phone,"
                    + " encryption_key_id, phone_last_four, submitted_at, expires_at)"
                    + " VALUES (202, ?, ?, 'fixture-key', '5678', ?, ?)",
                    java.sql.Date.valueOf(EVENT_WEEK), new byte[]{1, 2, 3},
                    Timestamp.from(now.minusSeconds(1200)), Timestamp.from(now.plusSeconds(14 * 86400L)));
            var edited = json(request("GET", "/notifications/" + id, null, member));
            assertThat(edited.path("event").path("contactStatus").asText()).isEqualTo("SUBMITTED");
            assertThat(edited.path("event").path("contactEdited").asBoolean()).isTrue();
            assertThat(edited.toString()).doesNotContain("5678", "encryptedPhone");

            assertThat(json(request("GET", "/notifications/" + id, null, member))
                    .path("event").path("contactEditable").asBoolean()).isTrue();
            jdbc.update("INSERT INTO event_prize_deliveries(winner_id, delivered_by_user_id, delivered_at)"
                    + " SELECT w.id, 101, ? FROM event_winners w JOIN event_rounds r"
                    + " ON r.id = w.event_round_id WHERE r.event_type = 'BUNGEOPPANG'"
                    + " AND r.week_start_date = ?", Timestamp.from(now), java.sql.Date.valueOf(EVENT_WEEK));
            var delivered = json(request("GET", "/notifications/" + id, null, member));
            assertThat(delivered.path("event").path("allPrizesDelivered").asBoolean()).isTrue();
            assertThat(delivered.path("event").path("contactActionRequired").asBoolean()).isFalse();
            assertThat(delivered.path("event").path("contactEditable").asBoolean()).isFalse();
            assertThat(delivered.path("event").path("awards")).hasSize(2);
            assertThat(json(request("GET", "/notifications", null, member)).path("items"))
                    .hasSize(1);
        } finally {
            cleanupEventFixture();
        }
    }

    private long eventAward(String type, Instant announcement, Instant now) {
        jdbc.update("""
                INSERT INTO event_rounds(event_type, week_start_date, starts_at, ends_at,
                    announces_at, finalized_at, finalization_source, finalized_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?, 'ADMIN', 101)
                """, type, java.sql.Date.valueOf(EVENT_WEEK), Timestamp.from(now.minusSeconds(10800)),
                Timestamp.from(now.minusSeconds(7200)), Timestamp.from(announcement),
                Timestamp.from(now.minusSeconds(5400)));
        long round = jdbc.queryForObject("SELECT id FROM event_rounds WHERE event_type = ?"
                + " AND week_start_date = ?", Long.class, type, java.sql.Date.valueOf(EVENT_WEEK));
        jdbc.update("INSERT INTO event_prize_slots(event_round_id, place, slot_number, prize_name)"
                + " VALUES (?, 1, 1, '테스트 상품')", round);
        long slot = jdbc.queryForObject("SELECT id FROM event_prize_slots WHERE event_round_id = ?",
                Long.class, round);
        jdbc.update("INSERT INTO event_winners(event_round_id, prize_slot_id, user_id, selected_at)"
                + " VALUES (?, ?, 202, ?)", round, slot, Timestamp.from(now.minusSeconds(5000)));
        return jdbc.queryForObject("SELECT id FROM event_winners WHERE event_round_id = ?", Long.class, round);
    }

    private void cleanupEventFixture() {
        var week = java.sql.Date.valueOf(EVENT_WEEK);
        List<Long> rounds = jdbc.queryForList("SELECT id FROM event_rounds WHERE week_start_date = ?",
                Long.class, week);
        jdbc.update("DELETE FROM personal_notifications WHERE user_id = 202"
                + " AND event_week_start_date = ?", week);
        jdbc.update("DELETE FROM event_winner_contacts WHERE user_id = 202 AND week_start_date = ?", week);
        jdbc.update("DELETE FROM event_contact_receipts WHERE user_id = 202 AND week_start_date = ?", week);
        for (long round : rounds) {
            List<Long> winners = jdbc.queryForList("SELECT id FROM event_winners WHERE event_round_id = ?",
                    Long.class, round);
            for (long winner : winners) {
                jdbc.update("DELETE FROM event_prize_deliveries WHERE winner_id = ?", winner);
                jdbc.update("DELETE FROM event_winners WHERE id = ?", winner);
            }
            jdbc.update("DELETE FROM event_prize_slots WHERE event_round_id = ?", round);
            jdbc.update("DELETE FROM event_rounds WHERE id = ?", round);
        }
    }

    @Test
    void 의견_닉네임_답변_알림_읽음과_재접속_재조회까지_연결한다() throws Exception {
        String receipt = submit();
        var before = json(request("GET", "/admin/feedback", null, administrator));
        assertThat(before.path("items").get(0).path("authorNickname").asText()).isEqualTo("산책자202");
        assertThat(before.path("items").get(0).path("status").asText()).isEqualTo("RECEIVED");
        var sent = request("POST", replyPath(receipt), reply(UUID.randomUUID().toString(), "말씀해주신 문제를 고쳤어요.", 0), administrator);
        assertThat(sent.statusCode()).isEqualTo(200);
        String notification = json(sent).path("notificationId").asText();
        assertThat(collector.events).hasSize(1);
        assertThat(collector.events.getFirst().userId()).isEqualTo(202);
        var listed = request("GET", "/notifications", null, member);
        assertThat(listed.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(json(listed).path("unreadCount").asInt()).isEqualTo(1);
        assertThat(listed.body()).doesNotContain("문제를 고쳤", "authorUserId", "산책자202");
        var detail = request("PATCH", "/notifications/" + notification + "/read", null, member);
        assertThat(detail.statusCode()).isEqualTo(200);
        assertThat(detail.body()).contains("말씀해주신 문제를 고쳤어요.", "공원 개선 의견입니다", "RESOLVED");
        assertThat(json(request("GET", "/notifications", null, token(202))).path("unreadCount").asInt()).isZero();
        assertThat(json(request("PATCH", "/notifications/" + notification + "/read", null, member)).path("readAt"))
                .isEqualTo(json(detail).path("readAt"));
        jdbc.update("UPDATE users SET nickname='변경닉네임' WHERE id=202");
        assertThat(request("GET", "/admin/feedback", null, administrator).body()).contains("변경닉네임", "말씀해주신 문제를 고쳤어요.");
    }

    @Test
    void 동일_답변_동시요청도_한번만_저장하고_발송한다() throws Exception {
        String receipt = submit();
        String body = reply(UUID.randomUUID().toString(), "동시 요청 답변입니다", 0);
        CountDownLatch start = new CountDownLatch(1);
        CountDownLatch loaded = new CountDownLatch(2);
        doAnswer(call -> {
            Object result = call.callRealMethod();
            loaded.countDown();
            if (!loaded.await(10, java.util.concurrent.TimeUnit.SECONDS)) {
                throw new IllegalStateException("두 요청의 잠금 전 조회가 완료되지 않았습니다.");
            }
            return result;
        }).when(feedback).find(Long.parseLong(receipt), false);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> { start.await(); return request("POST", replyPath(receipt), body, administrator); });
            var second = pool.submit(() -> { start.await(); return request("POST", replyPath(receipt), body, administrator); });
            start.countDown();
            assertThat(first.get().statusCode()).isEqualTo(200);
            assertThat(second.get().statusCode()).isEqualTo(200);
        } finally { doCallRealMethod().when(feedback).find(Long.parseLong(receipt), false); }
        assertThat(count("feedback_replies")).isEqualTo(1);
        assertThat(count("personal_notifications")).isEqualTo(1);
        assertThat(collector.events).hasSize(1);
    }

    @Test
    void 다른_회원은_답변과_알림에_접근하지_못한다() throws Exception {
        String receipt = submit();
        var sent = json(request("POST", replyPath(receipt), reply(UUID.randomUUID().toString(), "비공개 답변", 0), administrator));
        String notification = sent.path("notificationId").asText();
        assertThat(request("GET", "/notifications/" + notification, null, other).statusCode()).isEqualTo(404);
        assertThat(request("PATCH", "/notifications/" + notification + "/read", null, other).statusCode()).isEqualTo(404);
        assertThat(json(request("GET", "/notifications", null, other)).path("items")).isEmpty();
        assertThat(request("POST", replyPath(receipt), reply(UUID.randomUUID().toString(), "위조 답변", 1), member).statusCode()).isEqualTo(403);
        assertThat(request("GET", "/notifications", null, null).statusCode()).isEqualTo(401);
    }

    @Test
    void 저장_실패는_답변_알림_상태와_이벤트를_함께_취소한다() throws Exception {
        String receipt = submit();
        doAnswer(call -> {
            call.callRealMethod();
            throw new jakarta.persistence.PersistenceException("isolated rollback");
        }).when(repository).save(any(), any());
        try {
            assertThat(request("POST", replyPath(receipt), reply(UUID.randomUUID().toString(), "실패 답변", 0), administrator).statusCode()).isEqualTo(503);
            assertThat(count("feedback_replies")).isZero();
            assertThat(count("personal_notifications")).isZero();
            assertThat(collector.events).isEmpty();
            assertThat(jdbc.queryForObject("SELECT status FROM feedback_messages WHERE id=?", String.class, receipt)).isEqualTo("RECEIVED");
        } finally { doCallRealMethod().when(repository).save(any(), any()); }
    }

    @Test
    void 오래된_상태버전과_동일키_내용변경은_충돌로_거절한다() throws Exception {
        String receipt = submit();
        String key = UUID.randomUUID().toString();
        assertThat(request("POST", replyPath(receipt), reply(key, "처음 답변", 0), administrator).statusCode()).isEqualTo(200);
        assertThat(request("POST", replyPath(receipt), reply(key, "바뀐 답변", 0), administrator).statusCode()).isEqualTo(409);
        assertThat(request("PATCH", "/admin/operations/feedback/" + receipt + "/status", "{\"status\":\"REVIEWING\",\"expectedVersion\":0}", administrator).statusCode()).isEqualTo(409);
        assertThat(count("personal_notifications")).isEqualTo(1);
    }

    @Test
    void 보관만료와_회원탈퇴_후에는_개인알림을_노출하지_않는다() throws Exception {
        String receipt = submit();
        String notification = json(request("POST", replyPath(receipt), reply(UUID.randomUUID().toString(), "보관 답변", 0), administrator)).path("notificationId").asText();
        jdbc.update("UPDATE personal_notifications SET expires_at=TIMESTAMP('2000-01-01 00:00:00')");
        assertThat(json(request("GET", "/notifications", null, member)).path("unreadCount").asInt()).isZero();
        assertThat(request("GET", "/notifications/" + notification, null, member).statusCode()).isEqualTo(404);
        withdrawal.withdraw(202);
        assertThat(count("personal_notifications")).isZero();
        assertThat(jdbc.queryForObject("SELECT user_id FROM feedback_messages WHERE id=?", Long.class, receipt)).isNull();
        assertThat(request("POST", replyPath(receipt), reply(UUID.randomUUID().toString(), "탈퇴 후 답변", 1), administrator).statusCode()).isEqualTo(409);
    }

    private int count(String table) { return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class); }
    private String token(long user) {
        return issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER, LoginOutcome.Status.EXISTING_MEMBER, user, null)).accessToken();
    }
    private String submit() throws Exception {
        return json(request("POST", "/feedback", "{\"operationId\":\"inbox-op\",\"channelId\":\"channel-1\",\"text\":\"공원 개선 의견입니다\"}", member)).path("receiptId").asText();
    }
    private String replyPath(String id) { return "/admin/operations/feedback/" + id + "/replies"; }
    private String reply(String id, String text, long version) throws Exception {
        return mapper.writeValueAsString(Map.of("operationId", id, "text", text, "status", "RESOLVED", "expectedVersion", version));
    }
    private com.fasterxml.jackson.databind.JsonNode json(HttpResponse<String> response) throws Exception {
        return mapper.readTree(response.body());
    }
    private HttpResponse<String> request(String method, String path, String body, String token) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1" + path))
                .header("Origin", "https://dev.on-top.world");
        if (token != null) { request.header("Authorization", "Bearer " + token); }
        if (body != null) { request.header("Content-Type", "application/json"); }
        return client.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
    @TestConfiguration
    static class EventsConfiguration {
        @Bean DeliveryCollector deliveryCollector() { return new DeliveryCollector(); }
    }
    static class DeliveryCollector {
        final CopyOnWriteArrayList<PersonalNotificationChanged> events = new CopyOnWriteArrayList<>();
        @TransactionalEventListener
        public void committed(PersonalNotificationChanged event) { events.add(event); }
    }
}
