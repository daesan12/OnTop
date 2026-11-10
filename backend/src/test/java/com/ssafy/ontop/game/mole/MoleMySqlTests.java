package com.ssafy.ontop.game.mole;

import com.ssafy.ontop.game.mole.domain.MoleRules;
import com.ssafy.ontop.game.mole.dto.MoleDtos;
import com.ssafy.ontop.game.mole.service.MoleService;
import java.util.ArrayList;
import java.util.List;
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

/** 개발용 로컬 DB가 아니라 매번 만든 loopback 전용 ontop_mole_test_ DB에서만 V147을 적용한다. */
@Tag("mysql")
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local,db", "ontop.minigames.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="
})
class MoleMySqlTests {
    private static final AtomicLong USERS = new AtomicLong(780000);
    @Autowired private MoleService service;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private Flyway flyway;

    @DynamicPropertySource
    static void 격리_DB만_사용한다(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_MOLE_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_mole_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("loopback의 ontop_mole_test_ 전용 DB가 필요합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_MOLE_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_MOLE_DB_PASSWORD"));
    }

    @Test
    void V150_적용_후_완료가_점수와_공통_상한_보상을_한_행과_한_원장에_남긴다() {
        long user = 회원();
        long round = Long.parseLong(service.start(user, "round-1").id());
        판을_끝낸다(round);

        var settled = service.complete(user, round, 다_잡기(round));

        assertThat(flyway.info().pending()).isEmpty();
        assertThat(settled.result().reward()).isPositive().isEqualTo(settled.result().score() / 40);
        assertThat(잔액(user)).isEqualTo(100L + settled.result().reward());
        assertThat(원장수(user, "MOLE_REWARD")).isEqualTo(1);
        assertThat(settled.todayEarned()).isEqualTo(settled.result().reward());
        assertThat(jdbc.queryForObject("SELECT status FROM mole_rounds WHERE id = ?", String.class, round))
                .isEqualTo("SETTLED");
    }

    @Test
    void 같은_판의_동시_완료는_한_번만_지급한다() throws Exception {
        long user = 회원();
        long round = Long.parseLong(service.start(user, "round-1").id());
        판을_끝낸다(round);
        var hits = 다_잡기(round);

        var rewards = 동시에(6, i -> service.complete(user, round, hits).result().reward());

        assertThat(rewards.stream().distinct()).hasSize(1);
        assertThat(원장수(user, "MOLE_REWARD")).isEqualTo(1);
        assertThat(잔액(user)).isEqualTo(100L + rewards.getFirst());
    }

    @Test
    void 새_판을_열면_끝내지_않은_판은_보상_없이_닫힌다() {
        long user = 회원();
        long first = Long.parseLong(service.start(user, "round-1").id());
        service.start(user, "round-2");

        assertThat(jdbc.queryForObject("SELECT status FROM mole_rounds WHERE id = ?", String.class, first))
                .isEqualTo("EXPIRED");
        assertThat(원장수(user, "MOLE_REWARD")).isZero();
    }

    @Test
    void 랭킹과_최고_점수는_현재_규칙의_회원별_최고_기록만_센다() {
        jdbc.update("DELETE FROM mole_rounds");
        long first = 회원();
        long second = 회원();
        정산(first, 3, 800, 20);
        정산(first, 3, 1_200, 25);
        정산(first, 2, 9_000, 99);
        정산(second, 3, 1_200, 30);

        var page = service.rankings(first, 20, 0);

        assertThat(page.totalParticipants()).isEqualTo(2);
        assertThat(page.items()).extracting(MoleDtos.RankingItem::userId)
                .containsExactly(Long.toString(second), Long.toString(first));
        assertThat(page.items()).extracting(MoleDtos.RankingItem::rank).containsExactly(1L, 2L);
        assertThat(page.me()).isNotNull();
        assertThat(page.me().score()).isEqualTo(1_200);
        assertThat(service.status(first).bestScore()).isEqualTo(1_200);
        assertThat(jdbc.queryForObject("EXPLAIN FORMAT=TREE SELECT COUNT(*) FROM mole_rounds "
                + "WHERE rules_version = 3 AND status = 'SETTLED'", String.class)).contains("ix_mole_bests");
    }

    private void 정산(long user, int rulesVersion, int score, int maxCombo) {
        int perCoin = rulesVersion == 2 ? 45 : 40;
        jdbc.update("INSERT INTO mole_rounds (user_id, request_key, seed, rules_version, status, started_at, settled_at, "
                + "score, max_combo, caught, calculated_reward, reward) VALUES (?, ?, 1, ?, 'SETTLED', "
                + "CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3), ?, ?, 10, ?, 0)",
                user, UUID.randomUUID().toString(), rulesVersion, score, maxCombo, score / perCoin);
    }

    private void 판을_끝낸다(long round) {
        jdbc.update("UPDATE mole_rounds SET started_at = TIMESTAMPADD(SECOND, -95, CURRENT_TIMESTAMP(3)) WHERE id = ?",
                round);
    }

    private List<MoleDtos.Hit> 다_잡기(long round) {
        long seed = jdbc.queryForObject("SELECT seed FROM mole_rounds WHERE id = ?", Long.class, round);
        List<MoleDtos.Hit> hits = new ArrayList<>();
        for (MoleRules.Mole mole : MoleRules.schedule(seed)) {
            if (mole.kind() != MoleRules.Kind.DECOY) {
                for (int tap = 0; tap < mole.hits(); tap++) {
                    hits.add(new MoleDtos.Hit(mole.hole(), mole.appearAt() + 120 + tap * 90));
                }
            }
        }
        return hits;
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

    private long 회원() {
        long user = USERS.incrementAndGet();
        jdbc.update("INSERT INTO users(id, login_provider, provider_user_id, nickname, character_gender, "
                + "created_at, updated_at) VALUES (?, 'NAVER', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), "
                + "CURRENT_TIMESTAMP(3))",
                user, UUID.randomUUID().toString(), "m" + user);
        jdbc.update("INSERT INTO wallets(user_id, balance, reserved_balance) VALUES (?, 100, 0)", user);
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
