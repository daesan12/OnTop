package com.ssafy.ontop.game.jumprope;

import java.security.SecureRandom;
import java.sql.SQLException;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.UncategorizedSQLException;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

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
        return new JumpRopeService(new JumpRopeRepository(jdbc), transactions, Clock.fixed(now, ZoneOffset.UTC), new SecureRandom());
    }

    private long start(long user, String key) { return Long.parseLong(at(NOW).start(user, key).id()); }

    private long user() {
        long id = USERS.incrementAndGet();
        jdbc.update("""
                INSERT INTO users (id, login_provider, provider_user_id, nickname, character_gender, created_at, updated_at)
                VALUES (?, 'NAVER', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
                """, id, UUID.randomUUID().toString(), name(id));
        return id;
    }

    private static String name(long user) { return "jr" + user; }

    private static void assertCode(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(JumpRopeException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
        });
    }
}
