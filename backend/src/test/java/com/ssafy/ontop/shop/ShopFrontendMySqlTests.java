package com.ssafy.ontop.shop;

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
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

/** 실제 FE 상점 controller/service와 회원 인증·RawWS·JPA·격리 MySQL을 연결한다. 3D UI 검사는 아니다. */
@Tag("mysql")
@EnabledIfEnvironmentVariable(named = "TEST_SHOP_FRONTEND", matches = "true")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.shop.enabled=true", "ontop.websocket.authenticated=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/shop",
        "ontop.auth.allowed-origins=https://dev.on-top.world",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=상점검증",
        "ontop.world.channels[0].capacity=4", "ontop.world.channels[1].channel-id=channel-2",
        "ontop.world.channels[1].name=분리검증", "ontop.world.channels[1].capacity=4"
})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class ShopFrontendMySqlTests {
    @Autowired private JdbcTemplate jdbc;
    @Autowired private AuthExchangePersistenceService issuer;
    @LocalServerPort private int port;
    @TempDir private Path temporary;

    @DynamicPropertySource
    static void isolated(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_SHOP_FRONTEND_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_shop_test_frontend_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_shop_test_frontend_ 전용 빈 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_SHOP_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_SHOP_DB_PASSWORD"));
    }

    @Test
    void 실제_FE에서_응답유실_구매재확인_장착전파_재접속과_현재잔액을_검증한다() throws Exception {
        assertThat(Path.of("../frontend/node_modules/vitest/vitest.mjs")).exists();
        // 기존 회원/상품이 있는 DB에서는 실행하지 않으며 삭제·초기화를 하지 않는다.
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM items", Integer.class)).isZero();
        for (long id : new long[]{101, 202, 505, 909}) {
            jdbc.update("INSERT INTO users(id,login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)"
                    + " VALUES(?,'NAVER',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))",
                    id, "shop-frontend-" + id, "검증회원" + id);
            jdbc.update("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES(?,100,10)", id);
        }
        item(1, "RED_TOP", "EQUIPMENT", "TOP", 10);
        item(2, "BLUE_TOP", "EQUIPMENT", "TOP", 20);
        item(3, "SNACK", "CONSUMABLE", null, 5);
        item(4, "EXPENSIVE_HAIR", "EQUIPMENT", "HAIR", 80);
        var player = issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.EXISTING_MEMBER, 101L, null));
        String observer = token(202);
        String separated = token(505);
        Path output = temporary.resolve("frontend-output.txt");
        Path diagnostics = temporary.resolve("diagnostics.jsonl");
        var builder = new ProcessBuilder("node", "../frontend/node_modules/vitest/vitest.mjs", "run", "--config",
                "src/test/js/shop-frontend/vitest.config.mts").redirectErrorStream(true).redirectOutput(output.toFile());
        builder.environment().put("TEST_SHOP_API_BASE_URL", "http://127.0.0.1:" + port);
        // 토큰은 명령행·진단 파일 대신 자식 프로세스 환경으로만 전달한다.
        builder.environment().put("TEST_SHOP_ACCESS_TOKEN", player.accessToken());
        builder.environment().put("TEST_SHOP_REFRESH_TOKEN", player.refreshToken());
        builder.environment().put("TEST_SHOP_OBSERVER_TOKEN", observer);
        builder.environment().put("TEST_SHOP_SEPARATED_TOKEN", separated);
        builder.environment().put("TEST_SHOP_DIAGNOSTICS_FILE", diagnostics.toString());
        Process process = builder.start();
        try {
            assertThat(process.waitFor(90, TimeUnit.SECONDS)).as("FE 상점 검증 시간 제한").isTrue();
            String report = Files.readString(output).replace(player.accessToken(), "[redacted]")
                    .replace(player.refreshToken(), "[redacted]").replace(observer, "[redacted]")
                    .replace(separated, "[redacted]");
            System.out.println(report);
            assertThat(process.exitValue()).as("실제 FE 상점 흐름: %s", report).isZero();
            System.out.println("[SHOP_FRONTEND_DIAGNOSTICS]\n" + Files.readString(diagnostics));
        } finally {
            if (process.isAlive()) {
                process.destroyForcibly();
            }
        }
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=101", Long.class)).isEqualTo(60);
        assertThat(jdbc.queryForObject("SELECT reserved_balance FROM wallets WHERE user_id=101", Long.class))
                .isEqualTo(10);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM shop_purchases", Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions", Integer.class)).isEqualTo(3);
        assertThat(jdbc.queryForObject("SELECT quantity FROM user_items WHERE user_id=101 AND item_id=3", Integer.class))
                .isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT item_id FROM user_items WHERE user_id=101 AND is_equipped=TRUE",
                Long.class)).isEqualTo(2);
        for (long id : new long[]{202, 505, 909}) {
            assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id=?", Long.class, id))
                    .isEqualTo(100);
            assertThat(jdbc.queryForObject("SELECT reserved_balance FROM wallets WHERE user_id=?", Long.class, id))
                    .isEqualTo(10);
        }
    }

    private String token(long id) {
        return issuer.issueExisting(new LoginOutcome(OAuthProvider.NAVER,
                LoginOutcome.Status.EXISTING_MEMBER, id, null)).accessToken();
    }

    private void item(long id, String code, String type, String slot, long price) {
        jdbc.update("INSERT INTO items(id,item_code,name,item_type,equip_slot,price,image_key,is_for_sale)"
                + " VALUES(?,?,?,?,?,?,?,TRUE)", id, code, "검증 " + code, type, slot, price, "demo-" + code);
    }
}
