package com.ssafy.ontop.minigame;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.minigame.dto.MinigameStartResponse;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.DriverManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=dev,db", "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class MinigameDevMySqlTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired Environment environment;
    @Autowired AuthExchangePersistenceService issuer;
    @LocalServerPort int port;
    private final ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();
    private final HttpClient http = HttpClient.newHttpClient();

    @DynamicPropertySource
    static void existingDatabase(DynamicPropertyRegistry registry) throws Exception {
        String url = System.getenv("TEST_MINIGAME_DEV_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_minigame_test_dev_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_minigame_test_dev_ 전용 DB가 필요합니다.");
        }
        String user = System.getenv("TEST_MINIGAME_DB_USERNAME");
        String password = System.getenv("TEST_MINIGAME_DB_PASSWORD");
        // 공통 DB와 기존 회원/잔액이 있는 상태에서 앱이 V110/V111만 추가하는지 확인한다.
        Flyway.configure().dataSource(url, user, password).locations("classpath:db/migration").load().migrate();
        try (var connection = DriverManager.getConnection(url, user, password); var statement = connection.createStatement()) {
            statement.executeUpdate("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,"
                    + "created_at,updated_at) VALUES (909,'NAVER','dev-mini-preserve','보존회원','MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))");
            statement.executeUpdate("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES (909,123,10)");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> user);
        registry.add("spring.datasource.password", () -> password);
    }

    @Test
    void 실제_dev설정으로_기존데이터를_보존하며_시작부터_보상까지_연결한다() throws Exception {
        assertThat(environment.getProperty("ontop.minigames.enabled", Boolean.class)).isTrue();
        assertThat(environment.getProperty("spring.flyway.locations"))
                .isEqualTo("classpath:db/migration,classpath:db/minigame");
        assertThat(jdbc.queryForObject("SELECT nickname FROM users WHERE id=909", String.class)).isEqualTo("보존회원");
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=909", Long.class)).isEqualTo(123);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM flyway_schema_history WHERE version IN ('110','111') AND success=1",
                Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='items'",
                Integer.class)).isZero();
        jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)"
                + " VALUES(101,'NAVER','dev-mini-player','테스트회원','MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))");
        jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES(101,100,0)");
        String token = issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.EXISTING_MEMBER, 101L, null)).accessToken();
        var start = request("POST", "", "{\"minigameType\":\"BUNGEOPPANG\"}", token);
        assertThat(start.statusCode()).isEqualTo(201);
        var issued = mapper.readValue(start.body(), MinigameStartResponse.class);
        assertThat(request("GET", "/" + issued.minigameSessionId(), null, token).statusCode()).isEqualTo(200);
        jdbc.update("UPDATE minigame_sessions SET started_at=CURRENT_TIMESTAMP(3)-INTERVAL 65 SECOND WHERE id=?",
                issued.minigameSessionId());
        var input = BungeoppangFixtures.sevenGolden(issued.heats()).toString();
        var complete = request("POST", "/" + issued.minigameSessionId() + "/complete", input, token);
        assertThat(complete.statusCode()).isEqualTo(200);
        assertThat(mapper.readTree(complete.body()).path("coinsGranted").asInt()).isEqualTo(5);
        assertThat(request("POST", "/" + issued.minigameSessionId() + "/complete", input, token).body())
                .isEqualTo(complete.body());
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=101", Long.class)).isEqualTo(105);
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=909", Long.class)).isEqualTo(123);
        assertThat(jdbc.queryForObject("SELECT reserved_balance FROM wallets WHERE user_id=909", Long.class)).isEqualTo(10);
        assertThat(request("GET", "", null, token).body()).contains("\"todayEarned\":5");
        assertThat(complete.headers().firstValue("Access-Control-Allow-Origin")).contains("https://dev.on-top.world");
    }

    private HttpResponse<String> request(String method, String suffix, String body, String token) throws Exception {
        var request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/minigames/sessions" + suffix))
                .header("Origin", "https://dev.on-top.world").header("Authorization", "Bearer " + token)
                .header("Idempotency-Key", "dev-start");
        if (body != null) { request.header("Content-Type", "application/json"); }
        return http.send(request.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(body)).build(), HttpResponse.BodyHandlers.ofString());
    }
}
