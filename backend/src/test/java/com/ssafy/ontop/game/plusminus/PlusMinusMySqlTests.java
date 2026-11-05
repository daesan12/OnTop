package com.ssafy.ontop.game.plusminus;

import com.ssafy.ontop.game.plusminus.service.PlusMinusException;
import com.ssafy.ontop.game.plusminus.service.PlusMinusService;
import java.util.ArrayList;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
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

/** 개발용 로컬 DB가 아니라 매번 만든 loopback 전용 ontop_plus_minus_test_ DB에서만 V143을 적용한다. */
@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.minigames.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class PlusMinusMySqlTests {
    private static final AtomicLong USERS = new AtomicLong(770000);
    @Autowired private PlusMinusService service;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private Flyway flyway;

    @DynamicPropertySource
    static void 격리_DB만_사용한다(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_PLUS_MINUS_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_plus_minus_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_plus_minus_test_ 전용 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_PLUS_MINUS_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_PLUS_MINUS_DB_PASSWORD"));
    }

    @Test
    void V143_적용_후_START가_참가비와_지급_원장을_한_번에_남긴다() {
        long user = 회원(100);

        var state = service.start(user, "round-1");

        assertThat(flyway.info().pending()).isEmpty();
        assertThat(잔액(user)).isEqualTo(70L + state.round().payout());
        assertThat(원장수(user, "MINIGAME_ENTRY_FEE")).isEqualTo(1);
        assertThat(원장수(user, "PLUS_MINUS_PAYOUT")).isEqualTo(state.round().payout() > 0 ? 1 : 0);
        assertThat(jdbc.queryForObject("SELECT payout FROM plus_minus_rounds WHERE user_id = ?", Integer.class, user))
                .isEqualTo(state.round().payout());
    }

    @Test
    void 같은_키의_동시_START는_한_판과_한_번의_차감이다() throws Exception {
        long user = 회원(100);
        var ids = 동시에(6, i -> service.start(user, "same-key").round().id());

        assertThat(ids.stream().distinct().count()).isEqualTo(1);
        assertThat(원장수(user, "MINIGAME_ENTRY_FEE")).isEqualTo(1);
    }

    @Test
    void 다른_키의_동시_START도_하루_10판을_넘지_않는다() throws Exception {
        long user = 회원(1000);
        var results = 동시에(12, i -> {
            try {
                service.start(user, "round-" + i);
                return "PLAYED";
            } catch (PlusMinusException error) {
                return error.code();
            }
        });

        assertThat(results).filteredOn("PLAYED"::equals).hasSize(10);
        assertThat(results).filteredOn("PLUS_MINUS_DAILY_LIMIT"::equals).hasSize(2);
        assertThat(원장수(user, "MINIGAME_ENTRY_FEE")).isEqualTo(10);
    }

    @Test
    void 원장_저장이_실패하면_차감과_판_생성이_함께_롤백된다() {
        long user = 회원(100);
        jdbc.execute("CREATE TRIGGER plus_minus_test_reject_fee BEFORE INSERT ON wallet_transactions "
                + "FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'plus-minus-ledger-test'");
        try {
            assertThatThrownBy(() -> service.start(user, "rollback")).isInstanceOf(RuntimeException.class);
            assertThat(잔액(user)).isEqualTo(100);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM plus_minus_rounds WHERE user_id = ?",
                    Long.class, user)).isZero();
        } finally {
            jdbc.execute("DROP TRIGGER plus_minus_test_reject_fee");
        }
    }

    private interface Task<T> {
        T run(int index) throws Exception;
    }

    private static <T> ArrayList<T> 동시에(int count, Task<T> task) throws Exception {
        var start = new CountDownLatch(1);
        var values = new ArrayList<T>();
        try (var pool = Executors.newFixedThreadPool(count)) {
            var futures = new ArrayList<Future<T>>();
            for (int i = 0; i < count; i++) {
                int index = i;
                futures.add(pool.submit(() -> {
                    start.await();
                    return task.run(index);
                }));
            }
            start.countDown();
            for (var future : futures) {
                values.add(future.get(15, TimeUnit.SECONDS));
            }
        }
        return values;
    }

    private long 회원(long balance) {
        long user = USERS.incrementAndGet();
        jdbc.update("INSERT INTO users(id, login_provider, provider_user_id, nickname, character_gender, "
                + "created_at, updated_at) VALUES (?, 'NAVER', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), "
                + "CURRENT_TIMESTAMP(3))",
                user, UUID.randomUUID().toString(), "p" + user);
        jdbc.update("INSERT INTO wallets(user_id, balance, reserved_balance) VALUES (?, ?, 0)", user, balance);
        return user;
    }

    private long 잔액(long user) {
        return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id = ?", Long.class, user);
    }

    private long 원장수(long user, String type) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id "
                + "WHERE w.user_id = ? AND t.transaction_type = ?", Long.class, user, type);
    }
}
