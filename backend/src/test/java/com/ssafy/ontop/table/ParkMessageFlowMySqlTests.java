package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.feedback.config.FeedbackProperties;
import com.ssafy.ontop.notes.config.NotesProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/** 실제 JWT/HTTP/RawWS/JPA/MySQL 연결. 물리 시간과 신뢰된 서버 위치만 fixture다. */
@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=dev,db", "ontop.notes.enabled=true", "ontop.feedback.enabled=true",
        "ontop.notes.privacy-secret=synthetic-park-messages-key-32-bytes-only",
        "ontop.feedback.administrator-ids=909",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=검증 공원1",
        "ontop.world.channels[0].capacity=40",
        "ontop.world.channels[1].channel-id=channel-2", "ontop.world.channels[1].name=검증 공원2",
        "ontop.world.channels[1].capacity=40",
        "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/feedback,classpath:db/notes",
        "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(FrozenWorldFixture.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ParkMessageFlowMySqlTests {
    private static final String ORIGIN = "https://dev.on-top.world";
    @Autowired JdbcTemplate jdbc;
    @Autowired AuthExchangePersistenceService issuer;
    @Autowired WorldChannelRegistry channels;
    @Autowired NotesProperties notes;
    @Autowired FeedbackProperties feedback;
    @LocalServerPort int port;
    private final HttpClient http = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private final Map<Long, String> tokens = new HashMap<>();
    private long sequence;

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry properties) {
        String url = System.getenv("TEST_PARK_MESSAGES_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_park_messages_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback ontop_park_messages_test_ 전용 DB가 필요합니다.");
        }
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.username", () -> System.getenv("TEST_PARK_MESSAGES_DB_USERNAME"));
        properties.add("spring.datasource.password", () -> System.getenv("TEST_PARK_MESSAGES_DB_PASSWORD"));
    }

    @BeforeEach
    void 격리DB의_공개메모와_비공개의견을_준비한다() {
        jdbc.update("DELETE FROM anonymous_note_requests");
        jdbc.update("DELETE FROM anonymous_note_rates");
        jdbc.update("DELETE FROM anonymous_notes");
        jdbc.update("DELETE FROM feedback_messages");
        for (long user : new long[]{101, 202, 909}) {
            jdbc.update("""
                    INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)
                    VALUES(?,'NAVER',?,?,'MALE',NOW(3),NOW(3))
                    ON DUPLICATE KEY UPDATE deleted_at=NULL
                    """, user, "park-message-" + user, "검증회원" + user);
            tokens.put(user, issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                    LoginOutcome.Status.EXISTING_MEMBER, user, null)).accessToken());
        }
    }

    @AfterEach
    void 서버에서도_검증소켓의_채널정리가끝나야_다음검사를진행한다() {
        awaitDisconnected(101);
        awaitDisconnected(202);
    }

    @Test
    void 익명메모는_실제채널과위치를검사하고_단절후복귀해도한번만저장한다() throws Exception {
        String key = System.currentTimeMillis() + "_0123456789abcdef_retry";
        String body = body(key, "공개 검증 메모");
        expect(send(101, "POST", "/api/v1/notes", body), 409, "NOT_IN_CHANNEL");
        try (var writer = connect(101); var reader = connect(202)) {
            join(writer, "channel-1");
            join(reader, "channel-2");
            pose(101, notes.x() + 2.61, notes.y(), notes.z());
            expect(send(101, "POST", "/api/v1/notes", body), 403, "NOTES_OUT_OF_RANGE");
            pose(101, notes.x(), notes.y() + 0.71, notes.z());
            expect(send(101, "POST", "/api/v1/notes", body), 403, "NOTES_OUT_OF_RANGE");
            assertThat(count("anonymous_notes")).isZero();
            pose(101, notes.x(), notes.y(), notes.z());
            var first = send(101, "POST", "/api/v1/notes", body);
            expect(first, 201, null);
            assertThat(json.readTree(first.body()).path("note").fieldNames()).toIterable()
                    .containsExactlyInAnyOrder("id", "text", "createdAt");
            assertThat(send(101, "POST", "/api/v1/notes", body).body()).isEqualTo(first.body());
            pose(202, notes.x(), notes.y(), notes.z());
            var list = send(202, "GET", "/api/v1/notes?channelId=channel-2", null);
            expect(list, 200, null);
            assertThat(list.headers().firstValue("Cache-Control")).contains("no-store");
            JsonNode published = json.readTree(list.body()).path("notes");
            assertThat(published).hasSize(1);
            assertThat(published.get(0)).isEqualTo(json.readTree(first.body()).path("note"));

            writer.close();
            awaitDisconnected(101);
            expect(send(101, "POST", "/api/v1/notes", body), 409, "NOT_IN_CHANNEL");
            try (var returned = connect(101)) {
                join(returned, "channel-1");
                // 재접속은 서버 스폰이므로 근처까지 돌아온 조건을 서버 fixture로 준비한다.
                pose(101, notes.x(), notes.y(), notes.z());
                var retried = send(101, "POST", "/api/v1/notes", body);
                expect(retried, 201, null);
                assertThat(retried.body()).isEqualTo(first.body());
                assertThat(count("anonymous_notes")).isEqualTo(1);
                assertThat(count("anonymous_note_requests")).isEqualTo(1);
            }
        }
    }

    @Test
    void 소리함은_근처에서비공개접수하고_단절중재확인과관리자조회만허용한다() throws Exception {
        String body = body("private-request", "소리함 비공개 검증 의견");
        expect(send(101, "POST", "/api/v1/feedback", body), 409, "NOT_IN_CHANNEL");
        try (var writer = connect(101); var other = connect(202)) {
            join(writer, "channel-1");
            join(other, "channel-1");
            pose(101, feedback.x() + 2.61, feedback.y(), feedback.z());
            expect(send(101, "POST", "/api/v1/feedback", body), 403, "FEEDBACK_OUT_OF_RANGE");
            pose(101, feedback.x(), feedback.y() + 0.71, feedback.z());
            expect(send(101, "POST", "/api/v1/feedback", body), 403, "FEEDBACK_OUT_OF_RANGE");
            assertThat(count("feedback_messages")).isZero();
            pose(101, feedback.x(), feedback.y(), feedback.z());
            var first = other.assertNoMessageDuring(message -> message.toString().contains("비공개 검증 의견"),
                    () -> send(101, "POST", "/api/v1/feedback", body));
            expect(first, 201, null);
            assertThat(first.body()).doesNotContain("비공개 검증 의견");
            expect(send(202, "GET", "/api/v1/admin/feedback", null), 403, "FEEDBACK_ADMIN_REQUIRED");
            var admin = send(909, "GET", "/api/v1/admin/feedback", null);
            expect(admin, 200, null);
            assertThat(json.readTree(admin.body()).path("items").get(0).path("text").asText())
                    .isEqualTo("소리함 비공개 검증 의견");

            writer.close();
            awaitDisconnected(101);
            var retry = send(101, "POST", "/api/v1/feedback", body);
            expect(retry, 201, null);
            assertThat(retry.body()).isEqualTo(first.body());
            expect(send(101, "POST", "/api/v1/feedback", body("new-request", "새로운 비공개 검증 의견")),
                    409, "NOT_IN_CHANNEL");
            try (var returned = connect(101)) {
                join(returned, "channel-1");
                pose(101, feedback.x(), feedback.y(), feedback.z());
                assertThat(send(101, "POST", "/api/v1/feedback", body).body()).isEqualTo(first.body());
                assertThat(count("feedback_messages")).isEqualTo(1);
            }
        }
    }

    private ScenarioClient connect(long user) throws Exception {
        var ticket = send(user, "POST", "/api/v1/auth/websocket-ticket", null);
        expect(ticket, 200, null);
        return new ScenarioClient(port, Long.toString(user), json.readTree(ticket.body()).path("ticket").asText(), ORIGIN);
    }

    private void join(ScenarioClient socket, String channel) throws Exception {
        assertThat(socket.request("CHANNEL_JOIN", Map.of("channelId", channel)).path("type").asText())
                .isEqualTo("CHANNEL_STATE");
    }

    private void pose(long user, double x, double y, double z) {
        channels.move(Long.toString(user), new WorldChannelRegistry.Position(++sequence, x, y, z, 0));
    }

    private void awaitDisconnected(long user) {
        await().atMost(Duration.ofSeconds(5)).until(() -> channels.channelOf(Long.toString(user)) == null);
    }

    private int count(String table) { return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class); }
    private String body(String operation, String text) throws Exception {
        return json.writeValueAsString(Map.of("operationId", operation, "channelId", "channel-1", "text", text));
    }

    private void expect(HttpResponse<String> response, int status, String code) throws Exception {
        assertThat(response.statusCode()).isEqualTo(status);
        if (code != null) { assertThat(json.readTree(response.body()).path("code").asText()).isEqualTo(code); }
    }

    private HttpResponse<String> send(long user, String method, String path, String body) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .header("Authorization", "Bearer " + tokens.get(user)).header("Origin", ORIGIN)
                .timeout(Duration.ofSeconds(10));
        if (body != null) { request.header("Content-Type", "application/json"); }
        return http.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
}
