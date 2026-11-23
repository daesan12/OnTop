package com.ssafy.ontop.game.spotdifference;

import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
@SpringBootTest(properties = {"spring.profiles.active=local,db", "ontop.minigames.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="})
class SpotDifferenceMySqlTests {
    @Autowired private JdbcTemplate jdbc;
    @Autowired private SpotDifferenceRewards rewards;
    @Autowired private EntityManager entities;

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
    void 일일누계와_무관하게_동시_정산도_각_보상을_전액_한번씩_기록한다() throws Exception {
        long user = createUser();
        addEntry(user, "MOLE_REWARD", 995, Instant.now());
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
            assertThat(receipt.granted() + otherReceipt.granted()).isEqualTo(180);
            assertThat(rewards.settle(user, id, 72).granted()).isEqualTo(receipt.granted());
            assertThat(rewards.settle(user, concurrent, 108).granted()).isEqualTo(otherReceipt.granted());
        }
        assertThat(rewards.status(user).todayEarned()).isEqualTo(1175L);
        assertThat(jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id = ?", Long.class, user)).isEqualTo(1175L);
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM wallet_transactions WHERE idempotency_key IN (?, ?)
                """, Long.class, "spot-difference:reward:" + id, "spot-difference:reward:" + concurrent)).isEqualTo(2L);
    }

    @ParameterizedTest
    @ValueSource(strings = {"MINIGAME_REWARD", "JUMP_GATE_REWARD", "SKEWER_REWARD", "MOLE_REWARD", "GAME_RANK_REWARD"})
    void 공통_상한의_모든_지급_타입이_사격정_정산에_합산된다(String transactionType) {
        long user = createUser();
        addEntry(user, transactionType, 995, Instant.now());
        assertThat(rewards.status(user).todayEarned()).isEqualTo(995);

        var receipt = rewards.settle(user, UUID.randomUUID(), 108);

        assertThat(receipt.granted()).isEqualTo(108);
        assertThat(receipt.todayEarned()).isEqualTo(1103);
    }

    @Test
    void 지급_타입을_합산하고_별도_정책과_차감_타인_한국_날짜_밖의_원장을_제외한다() {
        long user = createUser();
        var date = LocalDate.of(2026, 11, 15);
        var from = date.atStartOfDay(MinigameRewardBudget.KST).toInstant();
        var until = date.plusDays(1).atStartOfDay(MinigameRewardBudget.KST).toInstant();
        var during = from.plusSeconds(3600);
        for (var type : List.of("MINIGAME_REWARD", "JUMP_GATE_REWARD", "SKEWER_REWARD", "MOLE_REWARD", "GAME_RANK_REWARD")) {
            addEntry(user, type, 199, during);
        }
        for (var type : List.of("RPS_ROULETTE_PAYOUT", "PLUS_MINUS_PAYOUT", "FITNESS_REWARD", "GACHA_PAYOUT",
                "GAME_SETTLEMENT", "GAME_TIE_BONUS", "SIGNUP_BONUS", "ADMIN_BULK_GRANT", "NOTIFICATION_REWARD")) {
            addEntry(user, type, 100, during);
        }
        for (var type : List.of("MOBILITY_RENTAL_FEE", "MINIGAME_ENTRY_FEE", "SHOP_PURCHASE", "RAFFLE_PURCHASE",
                "GACHA_PURCHASE", "MINIGAME_REWARD")) {
            addEntry(user, type, -100, during);
        }
        addEntry(user, "MINIGAME_REWARD", 0, during);
        addEntry(user, "MINIGAME_REWARD", 500, from.minusMillis(1));
        addEntry(user, "MINIGAME_REWARD", 500, until);
        addEntry(createUser(), "MINIGAME_REWARD", 500, during);

        long earned = MinigameRewardBudget.earned(entities, user, from, until);
        assertThat(earned).isEqualTo(995);
        assertThat(MinigameRewardBudget.grant(108, earned)).isEqualTo(108);

        addEntry(user, "MINIGAME_REWARD", 2, from);
        addEntry(user, "MINIGAME_REWARD", 3, until.minusMillis(1));
        earned = MinigameRewardBudget.earned(entities, user, from, until);
        assertThat(earned).isEqualTo(1000);
        assertThat(MinigameRewardBudget.grant(108, earned)).isEqualTo(108);
    }

    private long createUser() {
        var key = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO users (login_provider, provider_user_id, nickname, character_gender, created_at, updated_at)
                VALUES ('NAVER', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
                """, key, key.substring(0, 6));
        long user = jdbc.queryForObject("SELECT id FROM users WHERE provider_user_id = ?", Long.class, key);
        jdbc.update("INSERT INTO wallets (user_id, balance, reserved_balance) VALUES (?, 0, 0)", user);
        return user;
    }

    private void addEntry(long user, String type, long amount, Instant at) {
        jdbc.update("""
                INSERT INTO wallet_transactions (wallet_id, transaction_type, balance_delta, reserved_delta, idempotency_key, created_at)
                SELECT id, ?, ?, 0, ?, ? FROM wallets WHERE user_id = ?
                """, type, amount, "budget-audit:" + UUID.randomUUID(), Timestamp.from(at), user);
        jdbc.update("UPDATE wallets SET balance = balance + ? WHERE user_id = ?", amount, user);
    }
}
