package com.ssafy.ontop.minigame;

import com.ssafy.ontop.auth.domain.LoginOutcome;
import com.ssafy.ontop.auth.domain.OAuthProvider;
import com.ssafy.ontop.auth.service.AuthExchangePersistenceService;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** 실제 FE 플레이 상태→회원 인증/RawWS→REST/JPA/MySQL. 3D·원격 배포 검사는 아니다. */
@Tag("mysql")
@EnabledIfEnvironmentVariable(named = "TEST_BUNGEOPPANG_FLOW", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=dev,db", "ontop.websocket.authenticated=true",
        "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
@Import(BungeoppangFrontendFlowMySqlTests.Placement.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class BungeoppangFrontendFlowMySqlTests {
    @Autowired private JdbcTemplate jdbc;
    @Autowired private AuthExchangePersistenceService issuer;
    @LocalServerPort private int port;
    @TempDir private Path temporary;

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_BUNGEOPPANG_FLOW_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_minigame_test_flow_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_minigame_test_flow_ 전용 빈 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_MINIGAME_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_MINIGAME_DB_PASSWORD"));
    }

    @Test
    void 실제_FE의_60초플레이_응답유실_재확인과_보상잔액_포기_복귀를_검증한다() throws Exception {
        assertThat(Path.of("../frontend/node_modules/vitest/vitest.mjs")).exists();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class)).isZero();
        for (long id : new long[]{101, 202}) {
            jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)"
                    + " VALUES(?,'NAVER',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))",
                    id, "bungeoppang-flow-" + id, "검증회원" + id);
            jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES(?,100,10)", id);
        }
        var login = issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.EXISTING_MEMBER, 101L, null));
        Path reportPath = temporary.resolve("frontend-output.txt");
        Path diagnostics = temporary.resolve("diagnostics.jsonl");
        var builder = new ProcessBuilder("node", "../frontend/node_modules/vitest/vitest.mjs", "run", "--config",
                "src/test/js/bungeoppang-flow/vitest.config.mts")
                .redirectErrorStream(true).redirectOutput(reportPath.toFile());
        builder.environment().put("TEST_BUNGEOPPANG_API_BASE_URL", "http://127.0.0.1:" + port);
        builder.environment().put("TEST_BUNGEOPPANG_REFRESH_TOKEN", login.refreshToken());
        builder.environment().put("TEST_BUNGEOPPANG_DIAGNOSTICS_FILE", diagnostics.toString());
        Process process = builder.start();
        try {
            assertThat(process.waitFor(120, TimeUnit.SECONDS)).as("실제 60초 플레이 포함 FE 검사 제한").isTrue();
            String report = Files.readString(reportPath).replace(login.accessToken(), "[redacted]")
                    .replace(login.refreshToken(), "[redacted]");
            System.out.println(report);
            assertThat(process.exitValue()).as("FE 붕어빵 흐름: %s", report).isZero();
            System.out.println("[BUNGEOPPANG_FLOW_DIAGNOSTICS]\n" + Files.readString(diagnostics));
        } finally {
            if (process.isAlive()) {
                process.destroyForcibly();
            }
        }
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=101", Long.class)).isEqualTo(105);
        assertThat(jdbc.queryForObject("SELECT reserved_balance FROM wallets WHERE user_id=101", Long.class))
                .isEqualTo(10);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM minigame_sessions WHERE status='COMPLETED'",
                Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM minigame_sessions WHERE status='ABANDONED'",
                Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM minigame_sessions", Integer.class)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT balance_delta FROM wallet_transactions WHERE transaction_type='MINIGAME_REWARD'",
                Long.class)).isEqualTo(5);
        assertThat(jdbc.queryForObject("SELECT minigame_session_id FROM wallet_transactions", Long.class))
                .isEqualTo(jdbc.queryForObject("SELECT id FROM minigame_sessions WHERE status='COMPLETED'", Long.class));
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=202", Long.class)).isEqualTo(100);
        assertThat(jdbc.queryForObject("SELECT reserved_balance FROM wallets WHERE user_id=202", Long.class))
                .isEqualTo(10);
    }

    /** 위치/물리 시간만 고정한다. 게임/서버 시계·DB started_at은 실제 값 그대로 사용한다. */
    @TestConfiguration(proxyBeanMethods = false)
    static class Placement {
        @Bean @Primary
        WorldChannelRegistry cartPlacement(WorldChannelProperties properties) {
            return new WorldChannelRegistry(properties, Duration.ofNanos(1), new AtomicLong()::incrementAndGet) {
                @Override
                public synchronized Change join(String userId, String channelId) {
                    Change change = super.join(userId, channelId);
                    if (change.changed()) {
                        super.move(userId, new Position(1, -36, .8, 16.3, 0));
                    }
                    return change;
                }
            };
        }
    }
}
