package com.ssafy.ontop.world.fitness;

import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=공원",
        "ontop.world.channels[0].capacity=20",
        "ontop.world.map.source=generated", "ontop.world.map.require-match=true",
        "ontop.world.map.json-path=../frontend/generated/park/server-map.json",
        "ontop.world.map.manifest-path=../frontend/generated/park/manifest.json"
})
class FitnessRewardMySqlTests {
    @Autowired private JdbcTemplate jdbc;
    @Autowired private FitnessRewardStore store;
    @MockitoSpyBean private WalletTransactionRepository transactions;
    private long userId;

    @DynamicPropertySource
    static void database(DynamicPropertyRegistry properties) {
        String url = System.getenv("TEST_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_users80_test_fitness_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("운동 보상 검증은 전용 loopback MySQL DB만 사용합니다.");
        }
        properties.add("spring.datasource.url", () -> url);
        properties.add("spring.datasource.username", () -> System.getenv("TEST_DB_USERNAME"));
        properties.add("spring.datasource.password", () -> System.getenv("TEST_DB_PASSWORD"));
    }

    @BeforeEach
    void setup() {
        String suffix = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO users(login_provider, provider_user_id, nickname, character_gender, created_at, updated_at)"
                + " VALUES ('NAVER', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))",
                suffix, suffix.substring(0, 8));
        userId = jdbc.queryForObject("SELECT id FROM users WHERE provider_user_id = ?", Long.class, suffix);
        jdbc.update("INSERT INTO wallets(user_id, balance, reserved_balance) VALUES (?, 100, 10)", userId);
    }

    @Test
    void 동일_탑승구간_동시요청도_한번만_지급하고_예약잔액은_보존한다() throws Exception {
        String lease = UUID.randomUUID().toString();
        try (var executor = Executors.newFixedThreadPool(8)) {
            var calls = new java.util.ArrayList<java.util.concurrent.Future<?>>();
            for (int i = 0; i < 8; i++) {
                calls.add(executor.submit(() -> store.grant(userId, lease, 1, Instant.now())));
            }
            for (var call : calls) {
                call.get(20, TimeUnit.SECONDS);
            }
        }
        store.grant(userId, lease, 2, Instant.now());

        assertThat(balance()).isEqualTo(102);
        assertThat(jdbc.queryForObject("SELECT reserved_balance FROM wallets WHERE user_id = ?", Long.class, userId))
                .isEqualTo(10);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE idempotency_key LIKE ?",
                Long.class, "fitness:" + lease + ":%")).isEqualTo(2);
    }

    @Test
    void 원장_저장이_실패하면_잔액도_롤백한다() {
        doThrow(new DataIntegrityViolationException("test rollback"))
                .when(transactions).save(any(WalletTransaction.class));

        assertThatThrownBy(() -> store.grant(userId, UUID.randomUUID().toString(), 1, Instant.now()))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThat(balance()).isEqualTo(100);
    }

    private long balance() {
        return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id = ?", Long.class, userId);
    }
}
