package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** Combined dev activation only in a fresh test DB; no shared-database migration/deployment. */
@Tag("mysql")
@EnabledIfEnvironmentVariable(named = "TEST_PARK_CONTENT", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=dev,db", "ontop.websocket.authenticated=true",
        "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(FrozenWorldFixture.class)
class ParkContentDevMySqlTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired Environment environment;
    @Autowired AuthExchangePersistenceService issuer;
    @Autowired WorldChannelRegistry channels;
    @LocalServerPort int port;
    private final HttpClient http = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper().findAndRegisterModules();

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_PARK_CONTENT_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_content_test_dev_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_content_test_dev_ 전용 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_PARK_CONTENT_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_PARK_CONTENT_DB_PASSWORD"));
        // Exercise the actual application-dev.yml placeholders, not direct ontop.* overrides.
        registry.add("FEEDBACK_ENABLED", () -> "true");
        registry.add("ADMIN_READ_IDS", () -> "101");
        registry.add("NOTES_ENABLED", () -> "true");
        registry.add("NOTES_PRIVACY_SECRET", () -> "synthetic-content-note-privacy-key-only");
        // Flyway locations는 application-db.yml의 dev 경로 그대로 사용한다(메모 스키마는 공통 V133).
    }

    @Test
    void dev_환경변수로_세기능을_함께켜고_비공개의견과_익명메모를_분리한다() throws Exception {
        for (String feature : new String[]{"feedback", "notes", "minigames"}) {
            assertThat(environment.getProperty("ontop." + feature + ".enabled", Boolean.class)).isTrue();
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class)).isZero();
        assertThat(jdbc.queryForList("SELECT version FROM flyway_schema_history WHERE success=1", String.class))
                .contains("110", "111", "127", "133").doesNotContain("120", "121", "129");
        for (long id : new long[]{101, 202, 909}) {
            jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)"
                    + " VALUES(?,'NAVER',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))",
                    id, "content-dev-" + id, "콘텐츠회원" + id);
            jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES(?,123,10)", id);
        }
        String admin = token(101);
        String member = token(202);
        try (var writer = connect(member); var viewer = connect(admin)) {
            writer.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            viewer.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            locate("202", -10.8, .8, 14.5);
            String feedbackBody = json.writeValueAsString(Map.of("operationId", "combined-feedback",
                    "channelId", "channel-1", "text", "비공개 의견 테스트입니다"));
            var receipt = request("POST", "/feedback", feedbackBody, member);
            assertThat(receipt.statusCode()).isEqualTo(201);
            assertThat(request("POST", "/feedback", feedbackBody, member).body()).isEqualTo(receipt.body());
            assertThat(request("GET", "/admin/feedback", null, member).statusCode()).isEqualTo(403);
            var privateList = request("GET", "/admin/feedback", null, admin);
            assertThat(privateList.statusCode()).isEqualTo(200);
            assertThat(privateList.body()).contains("비공개 의견 테스트입니다", "\"authorUserId\":202");

            locate("202", 54.5, 18.92, 48.5);
            locate("101", 54.5, 18.92, 48.5);
            String notesBody = json.writeValueAsString(Map.of("operationId", Instant.now().toEpochMilli() + "_" + UUID.randomUUID(),
                    "channelId", "channel-1", "text", "공개 익명 메모입니다"));
            var note = request("POST", "/notes", notesBody, member);
            assertThat(note.statusCode()).isEqualTo(201);
            assertThat(request("POST", "/notes", notesBody, member).body()).isEqualTo(note.body());
            var publicList = request("GET", "/notes?channelId=channel-1", null, admin);
            assertThat(publicList.statusCode()).isEqualTo(200);
            JsonNode published = json.readTree(publicList.body()).path("notes");
            assertThat(published).hasSize(1);
            assertThat(published.get(0).properties()).extracting(Map.Entry::getKey)
                    .containsExactlyInAnyOrder("id", "text", "createdAt", "category");
            assertThat(publicList.body()).contains("공개 익명 메모입니다")
                    .doesNotContain("비공개 의견", "authorUserId", "nickname", "channelId", "operationId");
            assertThat(publicList.headers().firstValue("Cache-Control")).contains("no-store");
            assertThat(publicList.headers().firstValue("Access-Control-Allow-Origin"))
                    .contains("https://dev.on-top.world");

            assertThat(request("GET", "/minigames/sessions", null, member).statusCode()).isEqualTo(200);
            var start = request("POST", "/minigames/sessions", "{\"minigameType\":\"BUNGEOPPANG\"}", member);
            assertThat(start.statusCode()).isEqualTo(201);
            String gameId = json.readTree(start.body()).path("minigameSessionId").asText();
            assertThat(request("GET", "/minigames/sessions/" + gameId, null, member).statusCode()).isEqualTo(200);
            assertThat(request("POST", "/minigames/sessions/" + gameId + "/abandon", "{}", member).statusCode())
                    .isEqualTo(200);
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM feedback_messages", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM anonymous_notes", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=909", Long.class)).isEqualTo(123);
        assertThat(jdbc.queryForObject("SELECT reserved_balance FROM wallets WHERE user_id=909", Long.class)).isEqualTo(10);
    }

    private String token(long id) {
        return issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.EXISTING_MEMBER, id, null)).accessToken();
    }

    private ScenarioClient connect(String token) throws Exception {
        var response = request("POST", "/auth/websocket-ticket", null, token);
        assertThat(response.statusCode()).isEqualTo(200);
        return new ScenarioClient(port, "member", json.readTree(response.body()).path("ticket").asText(),
                "https://dev.on-top.world", "127.0.0.1:" + port);
    }

    private void locate(String id, double x, double y, double z) {
        channels.move(id, new WorldChannelRegistry.Position(channels.positionOf(id).sequence() + 1, x, y, z, 0));
    }

    private HttpResponse<String> request(String method, String path, String body, String token) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1" + path))
                .header("Origin", "https://dev.on-top.world").header("Authorization", "Bearer " + token);
        if (path.equals("/minigames/sessions") && method.equals("POST")) {
            request.header("Idempotency-Key", "combined-minigame");
        }
        if (body != null) {
            request.header("Content-Type", "application/json");
        }
        return http.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
}
