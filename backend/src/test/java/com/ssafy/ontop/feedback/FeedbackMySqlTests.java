package com.ssafy.ontop.feedback;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.feedback.domain.FeedbackText;
import com.ssafy.ontop.feedback.service.FeedbackService;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.user.service.UserWithdrawalPersistenceService;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.Map;
import java.util.concurrent.Callable;
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
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doCallRealMethod;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doThrow;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=dev,db", "ontop.feedback.enabled=true", "ontop.feedback.administrator-ids=101",
        "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/feedback",
        "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class FeedbackMySqlTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired FeedbackService feedback;
    @Autowired AuthExchangePersistenceService issuer;
    @Autowired UserWithdrawalPersistenceService withdrawal;
    @Autowired PlatformTransactionManager manager;
    @Autowired WorldChannelRegistry channels;
    @MockitoSpyBean TableHub hub;
    @MockitoSpyBean com.ssafy.ontop.feedback.repository.FeedbackRepository repository;
    @LocalServerPort int port;
    private final HttpClient http = HttpClient.newHttpClient();
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private String memberToken;
    private String adminToken;

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_FEEDBACK_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_feedback_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_feedback_test_ 전용 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_FEEDBACK_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_FEEDBACK_DB_PASSWORD"));
    }

    @BeforeEach
    void 검증_전용_회원과_소리함만_준비한다() {
        jdbc.update("DELETE FROM feedback_messages");
        for (long id : new long[]{101, 202, 909}) {
            jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)"
                    + " VALUES(?,'NAVER',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))"
                    + " ON DUPLICATE KEY UPDATE deleted_at=NULL,provider_user_id=VALUES(provider_user_id),"
                    + "nickname=VALUES(nickname)", id, "feedback-test-" + id, "소리함회원" + id);
        }
        memberToken = issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.EXISTING_MEMBER, 202L, null)).accessToken();
        adminToken = issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.EXISTING_MEMBER, 101L, null)).accessToken();
        // DB 정합성 검증에서는 위치만 대역. 아래 별도 테스트는 실제 서버 위치 검사까지 호출한다.
        doNothing().when(hub).requireFeedbackAccess(anyLong(), anyString(), anyDouble(), anyDouble(), anyDouble());
    }

    @Test
    void 접수_재요청_관리자조회_일반회원차단까지_실제HTTP로_확인한다() throws Exception {
        var accepted = request("POST", "/feedback", body("same", "공원을 개선해주세요"), memberToken);
        assertThat(accepted.statusCode()).isEqualTo(201);
        assertThat(accepted.body()).doesNotContain("공원", "userId", "authorUserId", "text");
        assertThat(request("POST", "/feedback", body("same", "공원을 개선해주세요"), memberToken).body())
                .isEqualTo(accepted.body());
        assertThat(request("GET", "/admin/feedback", null, memberToken).statusCode()).isEqualTo(403);
        var listed = request("GET", "/admin/feedback", null, adminToken);
        assertThat(listed.statusCode()).isEqualTo(200);
        assertThat(listed.body()).contains("공원을 개선해주세요", "\"authorUserId\":202");
        assertThat(listed.headers().firstValue("Cache-Control")).contains("no-store");
        assertThat(listed.headers().firstValue("Access-Control-Allow-Origin")).contains("https://dev.on-top.world");
        assertThat(count()).isEqualTo(1);
    }

    @Test
    void 같은키_다른본문은_충돌하고_새키는_15초_작성간격을_적용한다() throws Exception {
        assertThat(request("POST", "/feedback", body("one", "첫번째 의견입니다"), memberToken).statusCode())
                .isEqualTo(201);
        assertThat(request("POST", "/feedback", body("one", "다른 의견입니다"), memberToken).statusCode())
                .isEqualTo(409);
        var cooldown = request("POST", "/feedback", body("two", "두번째 의견입니다"), memberToken);
        assertThat(cooldown.statusCode()).isEqualTo(429);
        assertThat(mapper.readTree(cooldown.body()).path("nextAllowedAt").isTextual()).isTrue();
        jdbc.update("UPDATE feedback_messages SET created_at=CURRENT_TIMESTAMP(3)-INTERVAL 16 SECOND");
        assertThat(request("POST", "/feedback", body("two", "두번째 의견입니다"), memberToken).statusCode())
                .isEqualTo(201);
    }

    @Test
    void 같은요청_동시8회에도_한건만_접수하고_모두_같은영수증을_반환한다() throws Exception {
        CountDownLatch gate = new CountDownLatch(1);
        var tasks = new ArrayList<Callable<String>>();
        for (int i = 0; i < 8; i++) {
            tasks.add(() -> {
                gate.await(5, TimeUnit.SECONDS);
                var response = request("POST", "/feedback", body("parallel", "동시 접수 의견입니다"), memberToken);
                assertThat(response.statusCode()).isEqualTo(201);
                return response.body();
            });
        }
        try (var pool = Executors.newFixedThreadPool(8)) {
            var futures = tasks.stream().map(pool::submit).toList();
            gate.countDown();
            var bodies = new ArrayList<String>();
            for (var future : futures) { bodies.add(future.get(15, TimeUnit.SECONDS)); }
            assertThat(bodies.stream().distinct()).hasSize(1);
        }
        assertThat(count()).isEqualTo(1);
    }

    @Test
    void 다른키_동시요청도_한건만_접수한다() throws Exception {
        CountDownLatch gate = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var futures = java.util.stream.IntStream.range(0, 2).mapToObj(index -> pool.submit(() -> {
                gate.await(5, TimeUnit.SECONDS);
                return request("POST", "/feedback", body("different-" + index, "별도 요청 의견입니다"), memberToken)
                        .statusCode();
            })).toList();
            gate.countDown();
            assertThat(java.util.List.of(futures.getFirst().get(15, TimeUnit.SECONDS),
                    futures.getLast().get(15, TimeUnit.SECONDS))).containsExactlyInAnyOrder(201, 429);
        }
        assertThat(count()).isEqualTo(1);
    }

    @Test
    void 탈퇴_트랜잭션에_작성자와_요청키_연결이_함께_제거된다() {
        feedback.submit(202, "withdraw", "channel-1", new FeedbackText("탈퇴 전 의견입니다"));
        withdrawal.withdraw(202);

        var row = jdbc.queryForMap("SELECT user_id,request_key,body FROM feedback_messages");
        assertThat(row.get("user_id")).isNull();
        assertThat(row.get("request_key")).isNull();
        assertThat(row.get("body")).isEqualTo("탈퇴 전 의견입니다");
        assertThatThrownBy(() -> feedback.submit(202, "after", "channel-1", new FeedbackText("탈퇴 후 의견입니다")))
                .hasMessageContaining("활성 회원");
    }

    @Test
    void 탈퇴가_롤백되면_작성자_연결도_보존된다() {
        feedback.submit(202, "rollback", "channel-1", new FeedbackText("보존할 의견입니다"));
        assertThatThrownBy(() -> new TransactionTemplate(manager).execute(status -> {
            jdbc.update("UPDATE users SET deleted_at=CURRENT_TIMESTAMP(3) WHERE id=202");
            // 실제 탈퇴 이벤트를 동일 트랜잭션 안에서 발행하되 커밋하지 않는다.
            new com.ssafy.ontop.auth.service.AuthenticationRevocations(events)
                    .memberDeactivated(202);
            throw new IllegalStateException("검증용 롤백");
        })).hasMessageContaining("롤백");
        assertThat(jdbc.queryForObject("SELECT user_id FROM feedback_messages", Long.class)).isEqualTo(202);
    }

    @Autowired org.springframework.context.ApplicationEventPublisher events;

    @Test
    void 만료의견은_조회에서_즉시제외하고_90일보관_정리한다() {
        feedback.submit(202, "expire", "channel-1", new FeedbackText("오래된 의견입니다"));
        jdbc.update("UPDATE feedback_messages SET created_at=CURRENT_TIMESTAMP(3)-INTERVAL 90 DAY");
        assertThat(feedback.list(101, Long.MAX_VALUE, 20).items()).isEmpty();
        assertThat(feedback.deleteExpired()).isEqualTo(1);
        assertThat(count()).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id=909", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version='120' AND success=1",
                Integer.class)).isEqualTo(1);
    }

    @Test
    void 페이지_커서와_이동후_동일키_복구를_확인한다() throws Exception {
        feedback.submit(202, "page-1", "channel-1", new FeedbackText("첫번째 페이지 의견"));
        jdbc.update("UPDATE feedback_messages SET created_at=CURRENT_TIMESTAMP(3)-INTERVAL 16 SECOND");
        var second = feedback.submit(202, "page-2", "channel-1", new FeedbackText("두번째 페이지 의견"));
        var page = feedback.list(101, Long.MAX_VALUE, 1);
        assertThat(page.items()).hasSize(1);
        assertThat(page.items().getFirst().receiptId()).isEqualTo(second.receiptId());
        assertThat(feedback.list(101, Long.parseLong(page.nextCursor()), 1).items().getFirst().text())
                .isEqualTo("첫번째 페이지 의견");
        doThrow(new IllegalStateException("이미 이동함")).when(hub)
                .requireFeedbackAccess(anyLong(), anyString(), anyDouble(), anyDouble(), anyDouble());
        assertThat(feedback.submit(202, "page-2", "channel-1", new FeedbackText("두번째 페이지 의견")))
                .isEqualTo(second);
    }

    @Test
    void 서버위치_고정대역으로_접수와_거리이탈을_검사한다() throws Exception {
        doCallRealMethod().when(hub).requireFeedbackAccess(anyLong(), anyString(), anyDouble(), anyDouble(), anyDouble());
        channels.join("202", "channel-1");
        // 위치 판정 검증용 서버 고정 좌표. 물리 이동이나 실제 시설 점유 검증이 아니다.
        channels.holdFacility("202", new com.ssafy.ontop.world.service.WorldFacilityService.Pose(-9.3, 0.84, 14.5, 0));
        assertThat(request("POST", "/feedback", body("position", "서버 좌표 의견입니다"), memberToken).statusCode())
                .isEqualTo(201);
        channels.holdFacility("202", new com.ssafy.ontop.world.service.WorldFacilityService.Pose(20, 0.84, 20, 0));
        var rejected = request("POST", "/feedback", body("far", "멀리서 쓰는 의견입니다"), memberToken);
        assertThat(rejected.statusCode()).isEqualTo(403);
        assertThat(rejected.body()).contains("FEEDBACK_OUT_OF_RANGE");
    }

    @Test
    void 저장후_실패하면_롤백하고_같은키로_재접수한다() throws Exception {
        org.mockito.Mockito.doAnswer(invocation -> {
            invocation.callRealMethod();
            throw new org.springframework.dao.DataAccessResourceFailureException("검증용 저장 실패");
        }).when(repository).save(org.mockito.ArgumentMatchers.any());
        var failed = request("POST", "/feedback", body("retry-failure", "저장 실패 검증입니다"), memberToken);
        assertThat(failed.statusCode()).isEqualTo(503);
        assertThat(count()).isZero();
        doCallRealMethod().when(repository).save(org.mockito.ArgumentMatchers.any());
        assertThat(request("POST", "/feedback", body("retry-failure", "저장 실패 검증입니다"), memberToken)
                .statusCode()).isEqualTo(201);
        assertThat(count()).isEqualTo(1);
    }

    private int count() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM feedback_messages", Integer.class);
    }

    private String body(String key, String text) throws Exception {
        return mapper.writeValueAsString(Map.of("operationId", key, "channelId", "channel-1", "text", text));
    }

    private HttpResponse<String> request(String method, String path, String body, String token) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1" + path))
                .header("Origin", "https://dev.on-top.world").header("Authorization", "Bearer " + token);
        if (body != null) { request.header("Content-Type", "application/json"); }
        return http.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
}
