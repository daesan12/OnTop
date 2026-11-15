package com.ssafy.ontop.game.spotdifference;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

@Tag("mysql")
@SpringBootTest(properties = {"spring.profiles.active=local,db", "ontop.minigames.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="})
class SpotDifferenceMySqlTests {
    @Autowired private JdbcTemplate jdbc;
    @Autowired private SpotDifferenceRewards rewards;

    @DynamicPropertySource
    static void dedicatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_SPOT_DIFFERENCE_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_spot_difference_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("A dedicated loopback ontop_spot_difference_test_ database is required");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_SPOT_DIFFERENCE_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_SPOT_DIFFERENCE_DB_PASSWORD"));
    }

    @Test
    void 다른_게임의_엽전과_합산하여_동시_정산에도_지갑_원장에_잔여_한도만_한_번_기록한다() throws Exception {
        var key = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO users (login_provider, provider_user_id, nickname, character_gender, created_at, updated_at)
                VALUES ('NAVER', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
                """, key, key.substring(0, 6));
        long user = jdbc.queryForObject("SELECT id FROM users WHERE provider_user_id = ?", Long.class, key);
        jdbc.update("INSERT INTO wallets (user_id, balance, reserved_balance) VALUES (?, 995, 0)", user);
        jdbc.update("""
                INSERT INTO wallet_transactions (wallet_id, transaction_type, balance_delta, reserved_delta, idempotency_key, created_at)
                SELECT id, 'MOLE_REWARD', 995, 0, ?, UTC_TIMESTAMP(3) FROM wallets WHERE user_id = ?
                """, "previous:" + key, user);
        assertThat(rewards.status(user).todayEarned()).isEqualTo(995L);
        var id = UUID.randomUUID();
        var concurrent = UUID.randomUUID();
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var first = pool.submit(() -> { start.await(); return rewards.settle(user, id, 72); });
            var second = pool.submit(() -> { start.await(); return rewards.settle(user, concurrent, 108); });
            start.countDown();
            var receipt = first.get(15, TimeUnit.SECONDS);
            var otherReceipt = second.get(15, TimeUnit.SECONDS);
            assertThat(receipt.granted() + otherReceipt.granted()).isEqualTo(5);
            assertThat(rewards.settle(user, id, 72).granted()).isEqualTo(receipt.granted());
            assertThat(rewards.settle(user, concurrent, 108).granted()).isEqualTo(otherReceipt.granted());
        }
        assertThat(rewards.status(user).todayEarned()).isEqualTo(1000L);
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id = ?", Long.class, user)).isEqualTo(1000L);
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM wallet_transactions WHERE idempotency_key IN (?, ?)
                """, Long.class, "spot-difference:reward:" + id, "spot-difference:reward:" + concurrent)).isEqualTo(1L);
    }
}
