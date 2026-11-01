package com.ssafy.ontop.game.skewer;

import com.ssafy.ontop.game.skewer.service.SkewerAdmissionException;
import com.ssafy.ontop.game.skewer.service.SkewerAdmissionService;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.minigames.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class SkewerAdmissionMySqlTests {
    private static final AtomicLong USERS = new AtomicLong(700000);
    @Autowired private SkewerAdmissionService service;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private Flyway flyway;

    @DynamicPropertySource
    static void 격리_DB만_사용한다(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_SKEWER_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_skewer_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_skewer_test_ 전용 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_SKEWER_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_SKEWER_DB_PASSWORD"));
    }

    @Test
    void 기존_스키마에서_새_마이그레이션_없이_영수증을_재조회한다() {
        long user = 회원(100, 20);
        var first = service.start(user, "lost-response");

        var restored = service.start(user, "lost-response");

        assertThat(restored.id()).isEqualTo(first.id());
        assertThat(restored.availableBalance()).isEqualTo(70);
        assertThat(잔액(user)).isEqualTo(90);
        assertThat(원장수(user)).isEqualTo(1);
        assertThat(flyway.info().pending()).isEmpty();
    }

    @Test
    void 같은_키의_동시_구매는_원장과_차감이_하나이다() throws Exception {
        long user = 회원(100, 0);
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(6)) {
            var results = new ArrayList<java.util.concurrent.Future<String>>();
            for (int i = 0; i < 6; i++) {
                results.add(pool.submit(() -> { start.await(); return service.start(user, "same-key").id(); }));
            }
            start.countDown();
            var ids = new ArrayList<String>();
            for (var result : results) {
                ids.add(result.get(15, TimeUnit.SECONDS));
            }
            assertThat(ids.stream().distinct().count()).isEqualTo(1);
        }
        assertThat(잔액(user)).isEqualTo(90);
        assertThat(원장수(user)).isEqualTo(1);
    }

    @Test
    void 다른_키의_동시_구매도_예약_잔액을_침범하지_않는다() throws Exception {
        long user = 회원(35, 20);
        var start = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(4)) {
            var results = new ArrayList<java.util.concurrent.Future<Boolean>>();
            for (int i = 0; i < 4; i++) {
                String key = "round-" + i;
                results.add(pool.submit(() -> {
                    start.await();
                    try {
                        service.start(user, key);
                        return true;
                    } catch (SkewerAdmissionException error) {
                        assertThat(error.code()).isEqualTo("INSUFFICIENT_COINS");
                        return false;
                    }
                }));
            }
            start.countDown();
            int approved = 0;
            for (var result : results) {
                if (result.get(15, TimeUnit.SECONDS)) {
                    approved++;
                }
            }
            assertThat(approved).isEqualTo(1);
        }
        assertThat(잔액(user)).isEqualTo(25);
        assertThat(원장수(user)).isEqualTo(1);
    }

    @Test
    void 다른_회원의_같은_키는_각자_영수증으로_구분한다() {
        long first = 회원(100, 0);
        long second = 회원(100, 0);

        var one = service.start(first, "shared-key");
        var two = service.start(second, "shared-key");

        assertThat(one.id()).isNotEqualTo(two.id());
        assertThat(잔액(first)).isEqualTo(90);
        assertThat(잔액(second)).isEqualTo(90);
    }

    @Test
    void 원장_저장이_실패하면_지갑_차감도_롤백된다() {
        long user = 회원(100, 0);
        jdbc.execute("CREATE TRIGGER skewer_test_reject_fee BEFORE INSERT ON wallet_transactions "
                + "FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'skewer-ledger-test'");
        try {
            assertThatThrownBy(() -> service.start(user, "rollback")).isInstanceOf(RuntimeException.class);
            assertThat(잔액(user)).isEqualTo(100);
            assertThat(원장수(user)).isZero();
        } finally {
            jdbc.execute("DROP TRIGGER skewer_test_reject_fee");
        }
    }

    private long 회원(long balance, long reserved) {
        long user = USERS.incrementAndGet();
        jdbc.update("INSERT INTO users(id, login_provider, provider_user_id, nickname, character_gender, "
                + "created_at, updated_at) VALUES (?, 'NAVER', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))",
                user, UUID.randomUUID().toString(), "s" + user);
        jdbc.update("INSERT INTO wallets(user_id, balance, reserved_balance) VALUES (?, ?, ?)", user, balance, reserved);
        return user;
    }

    private long 잔액(long user) {
        return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id = ?", Long.class, user);
    }

    private long 원장수(long user) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id "
                + "WHERE w.user_id = ? AND t.transaction_type = 'MINIGAME_ENTRY_FEE'", Long.class, user);
    }
}
