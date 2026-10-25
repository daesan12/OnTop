package com.ssafy.ontop.minigame;

import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** Opt-in: actual frontend service -> authenticated Spring HTTP -> isolated MySQL. No UI/OAuth-provider claim. */
@Tag("mysql")
@EnabledIfEnvironmentVariable(named = "TEST_MINIGAME_FRONTEND", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=dev,db", "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class MinigameFrontendMySqlTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired AuthExchangePersistenceService issuer;
    @LocalServerPort int port;
    @TempDir Path temporary;

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_MINIGAME_FRONTEND_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_minigame_test_frontend_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_minigame_test_frontend_ 전용 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_MINIGAME_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_MINIGAME_DB_PASSWORD"));
    }

    @Test
    void 실제_프론트서비스로_시작_재시도_보상_포기까지_검증한다() throws Exception {
        assertThat(Path.of("../frontend/node_modules/vitest/vitest.mjs")).exists();
        // Fail on a reused database instead of deleting previous data.
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class)).isZero();
        for (long id : new long[]{101, 202, 909}) {
            jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)"
                    + " VALUES(?,'NAVER',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))",
                    id, "frontend-mini-" + id, "mini" + id);
            jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES(?,?,?)",
                    id, id == 101 ? 100 : id == 202 ? 50 : 123, id == 909 ? 10 : 0);
        }
        String player = token(101);
        String other = token(202);
        runFrontend("start", player, other);
        assertThat(jdbc.queryForObject("SELECT status FROM minigame_sessions WHERE user_id=101", String.class)).isEqualTo("PLAYING");
        // Avoid waiting a minute. Only this isolated session's timestamp is advanced; production clocks are unchanged.
        jdbc.update("UPDATE minigame_sessions SET started_at=CURRENT_TIMESTAMP(3)-INTERVAL 65 SECOND WHERE user_id=101");
        runFrontend("finish", player, other);
        runFrontend("abandon", player, other);
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=101", Long.class)).isEqualTo(105);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE transaction_type='MINIGAME_REWARD'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM minigame_sessions WHERE status='COMPLETED'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM minigame_sessions WHERE status='ABANDONED'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=909", Long.class)).isEqualTo(123);
        assertThat(jdbc.queryForObject("SELECT reserved_balance FROM wallets WHERE user_id=909", Long.class)).isEqualTo(10);
    }

    private String token(long id) {
        return issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER, LoginOutcome.Status.EXISTING_MEMBER, id, null)).accessToken();
    }

    private void runFrontend(String phase, String player, String other) throws Exception {
        Path output = temporary.resolve(phase + ".txt");
        var builder = new ProcessBuilder("node", "../frontend/node_modules/vitest/vitest.mjs", "run", "--config",
                "src/test/js/minigame-frontend/vitest.config.mts").redirectErrorStream(true).redirectOutput(output.toFile());
        builder.environment().put("TEST_MINIGAME_PHASE", phase);
        builder.environment().put("TEST_MINIGAME_API_BASE_URL", "http://127.0.0.1:" + port);
        builder.environment().put("TEST_MINIGAME_RECEIPT_FILE", temporary.resolve("receipt.json").toString());
        // Credentials stay in child environment, never command arguments or receipt/report files.
        builder.environment().put("TEST_MINIGAME_ACCESS_TOKEN", player);
        builder.environment().put("TEST_MINIGAME_OTHER_TOKEN", other);
        Process process = builder.start();
        try {
            assertThat(process.waitFor(60, TimeUnit.SECONDS)).as("frontend phase %s timeout", phase).isTrue();
            String report = Files.readString(output);
            System.out.println(report);
            assertThat(process.exitValue()).as("frontend phase %s: %s", phase, report).isZero();
        } finally {
            if (process.isAlive()) { process.destroyForcibly(); }
        }
    }
}
