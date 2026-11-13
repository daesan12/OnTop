package com.ssafy.ontop.game.jumprope;

import com.ssafy.ontop.game.speedmole.SpeedMoleRepository;
import com.ssafy.ontop.game.speedmole.SpeedMoleRewards;
import com.ssafy.ontop.game.speedmole.SpeedMoleRules;
import com.ssafy.ontop.game.speedmole.SpeedMoleService;
import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import jakarta.persistence.EntityManager;
import java.security.SecureRandom;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.stream.IntStream;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.spy;

@Tag("mysql")
@SpringBootTest(properties = {"spring.profiles.active=local,db", "ontop.minigames.enabled=true",
        "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8="})
class JumpRopeMySqlTests {
    private static final AtomicLong USERS = new AtomicLong(910000);
    private static final Instant NOW = Instant.parse("2026-11-12T00:00:00Z");
    private static final List<Integer> TWO_PERFECTS = List.of(728335, 1723348);
    @Autowired private JdbcTemplate jdbc;
    @Autowired private Flyway flyway;
    @Autowired private PlatformTransactionManager transactions;
    @Autowired private JumpRopeService configuredService;
    @Autowired private EntityManager entities;
    @Autowired private WalletRepository wallets;
    @Autowired private WalletTransactionRepository ledger;

    @DynamicPropertySource static void isolatedOnly(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_JUMP_ROPE_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_jump_rope_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("A dedicated loopback ontop_jump_rope_test_ database is required");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_JUMP_ROPE_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_JUMP_ROPE_DB_PASSWORD"));
    }

    @BeforeEach void clearRounds() { jdbc.update("DELETE FROM jump_rope_rounds"); }

    @Test void v175_applies_and_concurrent_identical_starts_and_completions_settle_once() throws Exception {
        long user = user();
        var starts = at(NOW);
        var finishes = at(NOW.plusSeconds(11));
        try (var pool = Executors.newFixedThreadPool(4)) {
            var startTasks = IntStream.range(0, 4).mapToObj(n -> pool.submit(() -> starts.start(user, "same"))).toList();
            var first = startTasks.getFirst().get(15, TimeUnit.SECONDS);
            for (var task : startTasks) assertThat(task.get(15, TimeUnit.SECONDS)).isEqualTo(first);
            assertThat(first.startedAt()).isEqualTo(NOW.plusSeconds(3));
            assertThat(first.expiresAt()).isEqualTo(NOW.plusSeconds(98));
            long id = Long.parseLong(first.id());
            var completeTasks = IntStream.range(0, 4)
                    .mapToObj(n -> pool.submit(() -> finishes.complete(user, id, TWO_PERFECTS))).toList();
            var result = completeTasks.getFirst().get(15, TimeUnit.SECONDS);
            for (var task : completeTasks) assertThat(task.get(15, TimeUnit.SECONDS)).isEqualTo(result);
            assertThat(result.score()).isEqualTo(45);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM jump_rope_rounds WHERE user_id = ?", Long.class, user)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT status FROM jump_rope_rounds WHERE id = ?", String.class, id)).isEqualTo("SETTLED");
            assertThat(jdbc.queryForObject("SELECT input_hash FROM jump_rope_rounds WHERE id = ?", String.class, id)).matches("[0-9a-f]{64}");
            assertThatThrownBy(() -> finishes.complete(user, id, List.of())).isInstanceOfSatisfying(JumpRopeException.class,
                    error -> assertThat(error.code()).isEqualTo("JUMP_ROPE_INPUT_CONFLICT"));
        }
        assertThat(flyway.info().pending()).isEmpty();
        assertThat(flyway.info().applied()).anySatisfy(migration -> assertThat(migration.getVersion().toString()).isEqualTo("175"));
    }

    @Test void simultaneous_different_inputs_return_one_winner_and_one_conflict() throws Exception {
        long user = user();
        long id = start(user, "race");
        var finish = at(NOW.plusSeconds(11));
        var release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            List<Future<Integer>> tasks = List.of(List.<Integer>of(), TWO_PERFECTS).stream().map(inputs -> pool.submit(() -> {
                release.await();
                try {
                    finish.complete(user, id, inputs);
                    return 200;
                } catch (JumpRopeException error) {
                    assertThat(error.code()).isEqualTo("JUMP_ROPE_INPUT_CONFLICT");
                    return error.status();
                }
            })).toList();
            release.countDown();
            assertThat(List.of(tasks.get(0).get(15, TimeUnit.SECONDS), tasks.get(1).get(15, TimeUnit.SECONDS)))
                    .containsExactlyInAnyOrder(200, 409);
        }
    }

    @Test void rejects_foreign_expired_early_and_superseded_rounds_without_settling() {
        long owner = user(), other = user();
        long id = start(owner, "old");
        assertCode(() -> at(NOW.plusSeconds(11)).complete(other, id, List.of()), 404, "JUMP_ROPE_ROUND_NOT_FOUND");
        assertCode(() -> at(NOW.plusSeconds(5)).complete(owner, id, List.of()), 409, "JUMP_ROPE_NOT_FINISHED");
        assertCode(() -> at(NOW.plusSeconds(99)).complete(owner, id, List.of()), 409, "JUMP_ROPE_ROUND_EXPIRED");
        start(owner, "new");
        assertCode(() -> at(NOW.plusSeconds(11)).complete(owner, id, List.of()), 409, "JUMP_ROPE_ROUND_SUPERSEDED");
        assertThat(configuredService.rankings(owner, 10, 0).me()).isNull();
        assertThat(balance(owner)).isEqualTo(100);
        assertThat(rewardRows(id)).isZero();
    }

    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2})
    void time_completion_pays_even_with_misses_and_identical_concurrent_submissions_pay_once(int misses) throws Exception {
        long user = user();
        long id = start(user, "time-" + misses);
        assertThat(balance(user)).isEqualTo(100);
        assertThat(rewardRows(id)).isZero();
        var finish = at(NOW.plusSeconds(70));
        var offsets = JumpRopeRulesTests.perfectRound().subList(misses, 66);
        var release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(4)) {
            var tasks = IntStream.range(0, 4).mapToObj(n -> pool.submit(() -> {
                release.await();
                return finish.complete(user, id, offsets);
            })).toList();
            release.countDown();
            var result = tasks.getFirst().get(15, TimeUnit.SECONDS);
            for (var task : tasks) assertThat(task.get(15, TimeUnit.SECONDS)).isEqualTo(result);
            int expectedScore = (66 - misses) * 30 - 15;
            assertThat(result.endReason()).isEqualTo("time");
            assertThat(result.counts().miss()).isEqualTo(misses);
            assertThat(result.score()).isEqualTo(expectedScore);
            assertThat(result.reward()).isEqualTo(expectedScore / 50);
            assertThat(balance(user)).isEqualTo(100L + result.reward());
            assertThat(rewardRows(id)).isEqualTo(1);
            assertThat(jdbc.queryForObject("""
                    SELECT balance_delta FROM wallet_transactions WHERE idempotency_key = ? AND wallet_id =
                        (SELECT id FROM wallets WHERE user_id = ?) AND transaction_type = 'MINIGAME_REWARD'
                        AND reserved_delta = 0 AND minigame_session_id IS NULL AND created_at = ?
                    """, Long.class, JumpRopeRewards.key(id), user, utc(result.completedAt())))
                    .isEqualTo(result.reward());
            assertCode(() -> finish.complete(user, id, List.of()), 409, "JUMP_ROPE_INPUT_CONFLICT");
            assertThat(configuredService.rankings(user, 10, 0).me().score()).isEqualTo(expectedScore);
        }
    }

    @Test void early_end_with_a_high_score_is_ranked_but_pays_nothing() {
        long user = user();
        long id = start(user, "early-high");
        var result = at(NOW.plusSeconds(20)).complete(user, id, JumpRopeRulesTests.perfectRound().subList(0, 10));
        assertThat(result.score()).isGreaterThan(50);
        assertThat(result.endReason()).isEqualTo("missLimit");
        assertThat(result.reward()).isZero();
        assertThat(balance(user)).isEqualTo(100);
        assertThat(rewardRows(id)).isZero();
        assertThat(configuredService.rankings(user, 10, 0).me().score()).isEqualTo(result.score());
    }

    @Test void exhausted_budget_settles_a_zero_reward_and_retry_does_not_recompute_it() {
        long user = user();
        Instant finishAt = Instant.parse("2026-11-12T14:59:59Z");
        seedBudget(user, MinigameRewardBudget.DAILY_CAP, finishAt.minusSeconds(1));
        long id = Long.parseLong(at(finishAt.minusSeconds(65)).start(user, "exhausted").id());
        var finish = at(finishAt);
        var result = finish.complete(user, id, JumpRopeRulesTests.perfectRound());
        assertThat(result.reward()).isZero();
        assertThat(result.score()).isEqualTo(1965);
        assertThat(at(finishAt.plusSeconds(2)).complete(user, id, JumpRopeRulesTests.perfectRound())).isEqualTo(result);
        assertThat(balance(user)).isEqualTo(100 + MinigameRewardBudget.DAILY_CAP);
        assertThat(rewardRows(id)).isZero();
    }

    @Test void concurrent_finishes_of_two_jump_rope_rounds_only_pay_the_latest_round() throws Exception {
        long user = user();
        Instant now = NOW.plusSeconds(65);
        seedBudget(user, MinigameRewardBudget.DAILY_CAP - 4, now);
        long oldId = start(user, "shared-old");
        long newId = start(user, "shared-new");
        var finish = at(now);
        var offsets = JumpRopeRulesTests.perfectRound();
        var release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var old = pool.submit(() -> {
                release.await();
                assertCode(() -> finish.complete(user, oldId, offsets), 409, "JUMP_ROPE_ROUND_SUPERSEDED");
                return null;
            });
            var latest = pool.submit(() -> {
                release.await();
                return finish.complete(user, newId, offsets);
            });
            release.countDown();
            old.get(15, TimeUnit.SECONDS);
            assertThat(latest.get(15, TimeUnit.SECONDS).reward()).isEqualTo(4);
        }
        assertThat(rewardRows(oldId)).isZero();
        assertThat(rewardRows(newId)).isEqualTo(1);
        assertThat(balance(user)).isEqualTo(100 + MinigameRewardBudget.DAILY_CAP);
    }

    @Test void simultaneous_jump_rope_and_speed_mole_rounds_share_the_remaining_wallet_budget() throws Exception {
        long user = user();
        Instant now = NOW.plusSeconds(65);
        var speedMole = new SpeedMoleService(new SpeedMoleRepository(jdbc), transactions,
                Clock.fixed(now, ZoneOffset.UTC), new SecureRandom(), new SpeedMoleRewards(entities));
        seedBudget(user, MinigameRewardBudget.DAILY_CAP - 4, now);
        long jumpId = Long.parseLong(at(now.minusSeconds(65)).start(user, "shared-cap").id());
        long moleId = Long.parseLong(speedMole.start(user, "shared-cap").id());
        jdbc.update("UPDATE speed_mole_rounds SET seed = 1, started_at = ? WHERE id = ?", Timestamp.from(now.minusSeconds(61)), moleId);
        var taps = speedMoleHits();
        assertThat(SpeedMoleRules.replay(1, taps).score()).isEqualTo(25);
        var release = new CountDownLatch(1);
        try (var pool = Executors.newFixedThreadPool(2)) {
            var jump = pool.submit(() -> {
                release.await();
                return at(now).complete(user, jumpId, JumpRopeRulesTests.perfectRound());
            });
            var mole = pool.submit(() -> {
                release.await();
                return speedMole.complete(user, moleId, taps);
            });
            release.countDown();
            assertThat(List.of(jump.get(15, TimeUnit.SECONDS).reward(), mole.get(15, TimeUnit.SECONDS).reward()))
                    .containsExactlyInAnyOrder(0, 4);
        }
        assertThat(balance(user)).isEqualTo(100 + MinigameRewardBudget.DAILY_CAP);
        assertThat(jdbc.queryForObject("""
                SELECT SUM(t.balance_delta) FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id
                WHERE w.user_id = ? AND t.transaction_type IN ('MINIGAME_REWARD', 'MOLE_REWARD')
                """, Long.class, user)).isEqualTo(MinigameRewardBudget.DAILY_CAP);
    }

    @Test void database_failure_after_wallet_flush_rolls_back_both_and_identical_retry_pays_once() {
        long user = user();
        long id = start(user, "retry-db-error");
        var failingRepository = spy(new JumpRopeRepository(jdbc));
        doAnswer(invocation -> {
            assertThat(balance(user)).isEqualTo(139);
            assertThat(rewardRows(id)).isEqualTo(1);
            invocation.callRealMethod();
            jdbc.update("UPDATE jump_rope_rounds SET score = -1 WHERE id = ?", id);
            return null;
        }).when(failingRepository).settle(eq(id), any(), any(), any());
        Instant now = NOW.plusSeconds(65);
        var inputs = JumpRopeRulesTests.perfectRound();
        assertThatThrownBy(() -> at(now, failingRepository).complete(user, id, inputs))
                .isInstanceOf(DataAccessException.class).hasMessageContaining("ck_jump_rope_result");
        assertThat(balance(user)).isEqualTo(100);
        assertThat(rewardRows(id)).isZero();
        assertThat(jdbc.queryForObject("SELECT status FROM jump_rope_rounds WHERE id = ?", String.class, id)).isEqualTo("ACTIVE");
        assertThat(at(now).complete(user, id, inputs).reward()).isEqualTo(39);
        assertThat(balance(user)).isEqualTo(139);
        assertThat(rewardRows(id)).isEqualTo(1);
    }

    @Test void rankings_keep_best_per_user_competition_ranks_and_personal_rank_across_pages() {
        long a = user(), b = user(), c = user(), noRecord = user();
        var finish = at(NOW.plusSeconds(11));
        finish.complete(a, start(a, "less"), List.of());
        finish.complete(a, start(a, "best"), TWO_PERFECTS);
        at(NOW.plusSeconds(12)).complete(b, start(b, "best"), TWO_PERFECTS);
        finish.complete(c, start(c, "one"), List.of(728335));
        start(noRecord, "active");
        long last = 0;
        for (int i = 0; i < 9; i++) {
            last = user();
            finish.complete(last, start(last, "none"), List.of());
        }
        var page = configuredService.rankings(last, 10, 0);
        assertThat(page.totalParticipants()).isEqualTo(12);
        assertThat(page.items()).hasSize(10);
        assertThat(page.items().subList(0, 3)).containsExactly(
                new JumpRopeDtos.Item(1, name(a), 45), new JumpRopeDtos.Item(1, name(b), 45), new JumpRopeDtos.Item(3, name(c), 15));
        assertThat(page.me()).isEqualTo(new JumpRopeDtos.PersonalBest(4, name(last), 0));
        var lastEntry = new JumpRopeDtos.Item(4, name(last), 0);
        assertThat(page.items()).doesNotContain(lastEntry);
        assertThat(page.hasMore()).isTrue();
        assertThat(configuredService.rankings(noRecord, 10, 10).items()).contains(lastEntry).hasSize(2);
        assertThat(configuredService.rankings(noRecord, 10, 10).me()).isNull();
    }

    @Test void schema_rejects_an_incomplete_settled_row() {
        long id = start(user(), "bad-row");
        assertThatThrownBy(() -> jdbc.update("UPDATE jump_rope_rounds SET status = 'SETTLED' WHERE id = ?", id))
                .isInstanceOfSatisfying(UncategorizedSQLException.class, error -> {
                    SQLException cause = error.getSQLException();
                    assertThat(cause.getErrorCode()).isEqualTo(3819);
                    assertThat(cause.getSQLState()).isEqualTo("HY000");
                    assertThat(cause.getMessage()).contains("ck_jump_rope_result");
                });
        assertThat(jdbc.queryForObject("SELECT status FROM jump_rope_rounds WHERE id = ?", String.class, id)).isEqualTo("ACTIVE");
    }

    private JumpRopeService at(Instant now) {
        return at(now, new JumpRopeRepository(jdbc));
    }

    private JumpRopeService at(Instant now, JumpRopeRepository repository) {
        return new JumpRopeService(repository, transactions, Clock.fixed(now, ZoneOffset.UTC), new SecureRandom(),
                new JumpRopeRewards(entities, wallets, ledger));
    }

    private long start(long user, String key) { return Long.parseLong(at(NOW).start(user, key).id()); }

    private long user() {
        long id = USERS.incrementAndGet();
        jdbc.update("""
                INSERT INTO users (id, login_provider, provider_user_id, nickname, character_gender, created_at, updated_at)
                VALUES (?, 'NAVER', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
                """, id, UUID.randomUUID().toString(), name(id));
        jdbc.update("INSERT INTO wallets (user_id, balance, reserved_balance) VALUES (?, 100, 0)", id);
        return id;
    }

    private long balance(long user) {
        return jdbc.queryForObject("SELECT balance FROM wallets WHERE user_id = ?", Long.class, user);
    }

    private long rewardRows(long id) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM wallet_transactions WHERE idempotency_key = ?",
                Long.class, JumpRopeRewards.key(id));
    }

    private void seedBudget(long user, int amount, Instant at) {
        jdbc.update("""
                INSERT INTO wallet_transactions (wallet_id, transaction_type, balance_delta, reserved_delta, idempotency_key, created_at)
                SELECT id, 'MINIGAME_REWARD', ?, 0, ?, ? FROM wallets WHERE user_id = ?
                """, amount, "budget-test:" + user, utc(at), user);
        jdbc.update("UPDATE wallets SET balance = balance + ? WHERE user_id = ?", amount, user);
    }

    private static LocalDateTime utc(Instant instant) {
        // Hikari pins MySQL's session to UTC, but the test JVM runs in KST.
        return LocalDateTime.ofInstant(instant, ZoneOffset.UTC);
    }

    private static List<SpeedMoleRules.Tap> speedMoleHits() {
        var taps = new ArrayList<SpeedMoleRules.Tap>();
        for (int i = 0; i < 25; i++) {
            for (int hole = 0; hole < 8; hole++) {
                taps.add(new SpeedMoleRules.Tap(hole, i * 10));
                if (SpeedMoleRules.replay(1, taps).hits() == i + 1) break;
                taps.removeLast();
            }
        }
        return taps;
    }

    private static String name(long user) { return "jr" + user; }

    private static void assertCode(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(JumpRopeException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
        });
    }
}
