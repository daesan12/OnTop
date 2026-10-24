package com.ssafy.ontop.table;

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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** Actual FE transport/auth/profile diagnostics. Facility service/UI wiring is reported separately. */
@Tag("mysql")
@EnabledIfEnvironmentVariable(named = "TEST_WORLD_FRONTEND", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.websocket.authenticated=true",
        "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=연동검증",
        "ontop.world.channels[0].capacity=4"
})
@Import(WorldFrontendMySqlTests.FixtureConfiguration.class)
class WorldFrontendMySqlTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired AuthExchangePersistenceService issuer;
    @Autowired FixtureWorld world;
    @LocalServerPort int port;
    @TempDir Path temporary;

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_WORLD_FRONTEND_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_world_test_frontend_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_world_test_frontend_ 전용 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_WORLD_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_WORLD_DB_PASSWORD"));
    }

    @Test
    void 실제_프론트와_회원DB로_프로필과_시설통신을_검증하고_미연결을_구분한다() throws Exception {
        assertThat(Path.of("../frontend/node_modules/vitest/vitest.mjs")).exists();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class)).isZero();
        for (long id : new long[]{101, 202, 909}) {
            jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)"
                    + " VALUES(?,'NAVER',?,?,?,CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))",
                    id, "world-frontend-" + id, "검증회원" + id, id == 202 ? "FEMALE" : "MALE");
            jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES(?,123,10)", id);
        }
        var player = issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.EXISTING_MEMBER, 101L, null));
        var other = issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.EXISTING_MEMBER, 202L, null));
        world.spawn(-9, .8, 34.75);
        runFrontend("profile-bench", player.accessToken(), player.refreshToken(), other.accessToken());
        world.spawn(-65, .855, 33);
        runFrontend("fitness", player.accessToken(), player.refreshToken(), other.accessToken());
        world.spawn(49.1, 18.92, 48.2);
        runFrontend("telescope", player.accessToken(), player.refreshToken(), other.accessToken());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=909", Long.class)).isEqualTo(123);
        assertThat(jdbc.queryForObject("SELECT reserved_balance FROM wallets WHERE user_id=909", Long.class)).isEqualTo(10);
    }

    private void runFrontend(String phase, String access, String refresh, String other) throws Exception {
        Path output = temporary.resolve(phase + ".txt");
        var builder = new ProcessBuilder("node", "../frontend/node_modules/vitest/vitest.mjs", "run", "--config",
                "src/test/js/world-frontend/vitest.config.mts").redirectErrorStream(true).redirectOutput(output.toFile());
        builder.environment().put("TEST_WORLD_PHASE", phase);
        builder.environment().put("TEST_WORLD_API_BASE_URL", "http://127.0.0.1:" + port);
        builder.environment().put("TEST_WORLD_ACCESS_TOKEN", access);
        builder.environment().put("TEST_WORLD_REFRESH_TOKEN", refresh);
        builder.environment().put("TEST_WORLD_OTHER_TOKEN", other);
        builder.environment().put("TEST_WORLD_DIAGNOSTICS_FILE", temporary.resolve("diagnostics.jsonl").toString());
        Process process = builder.start();
        try {
            assertThat(process.waitFor(60, TimeUnit.SECONDS)).as("frontend phase %s timeout", phase).isTrue();
            String report = Files.readString(output).replace(access, "[redacted]")
                    .replace(refresh, "[redacted]").replace(other, "[redacted]");
            System.out.println(report);
            assertThat(process.exitValue()).as("frontend phase %s: %s", phase, report).isZero();
            if (phase.equals("profile-bench")) {
                System.out.println("[WORLD_INTEGRATION_DIAGNOSTICS]\n"
                        + Files.readString(temporary.resolve("diagnostics.jsonl")));
            }
        } finally {
            if (process.isAlive()) {
                process.destroyForcibly();
            }
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FixtureConfiguration {
        @Bean @Primary
        FixtureWorld fixtureWorld(WorldChannelProperties properties) {
            return new FixtureWorld(properties);
        }
    }

    /** Trusted test placement on join; no HTTP/WS teleport API and no walking/physics-timing claim. */
    static class FixtureWorld extends WorldChannelRegistry {
        private double x;
        private double y;
        private double z;

        FixtureWorld(WorldChannelProperties properties) {
            super(properties, Duration.ofNanos(1), new AtomicLong()::incrementAndGet);
        }

        synchronized void spawn(double x, double y, double z) {
            this.x = x;
            this.y = y;
            this.z = z;
        }

        @Override
        public synchronized Change join(String userId, String channelId) {
            Change change = super.join(userId, channelId);
            if (change.changed()) {
                super.move(userId, new Position(1, x, y, z, 0));
            }
            return change;
        }
    }
}
