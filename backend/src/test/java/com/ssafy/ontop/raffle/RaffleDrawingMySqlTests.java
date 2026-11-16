package com.ssafy.ontop.raffle;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.admin.security.AdminAccessProperties;
import com.ssafy.ontop.raffle.domain.RaffleDrawSelector;
import com.ssafy.ontop.raffle.domain.RaffleSaleWindow;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository;
import com.ssafy.ontop.raffle.repository.RaffleRepository;
import com.ssafy.ontop.raffle.service.RaffleDrawingService;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("mysql")
@EnabledIfEnvironmentVariable(
        named = "TEST_RAFFLE_DRAW_DB_URL",
        matches = "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_raffle_draw_test_[A-Za-z0-9_]+(?:\\?.*)?"
)
class RaffleDrawingMySqlTests {
    private JdbcTemplate jdbc;
    private RaffleRepository raffles;
    private RaffleDrawingRepository drawings;
    private DataSourceTransactionManager transactions;
    private AdminAccessPolicy administrators;

    @Test
    void 사전추첨_재추첨_확정_권한_동시성_복구를_검증한다() throws Exception {
        String url = System.getenv("TEST_RAFFLE_DRAW_DB_URL");
        String username = System.getenv("TEST_RAFFLE_DRAW_DB_USERNAME");
        String password = System.getenv("TEST_RAFFLE_DRAW_DB_PASSWORD");
        var datasource = new DriverManagerDataSource(url, username, password);
        jdbc = new JdbcTemplate(datasource);
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()
                """, Long.class)).isZero();
        // V165가 db/shop의 items를 참조한다.
        Flyway.configure().dataSource(datasource).locations("classpath:db/migration", "classpath:db/shop")
                .baselineOnMigrate(false).outOfOrder(false).load().migrate();
        raffles = new RaffleRepository(jdbc);
        drawings = new RaffleDrawingRepository(jdbc);
        transactions = new DataSourceTransactionManager(datasource);

        long gm = member("gm");
        long viewer = member("viewer");
        long first = member("first");
        long second = member("second");
        long late = member("late");
        administrators = new AdminAccessPolicy(new AdminAccessProperties(
                Set.of(gm, viewer), Set.of(), Set.of(gm)));

        LocalDate week = LocalDate.of(2026, 11, 2);
        long raffleRound = round(week);
        ticket(raffleRound, gm, 1, "2026-11-08T14:00:00Z");
        ticket(raffleRound, first, 2, "2026-11-08T14:00:00Z");
        ticket(raffleRound, first, 3, "2026-11-08T14:00:01Z");
        ticket(raffleRound, second, 4, "2026-11-08T14:00:02Z");
        ticket(raffleRound, late, 5, "2026-11-08T15:00:00Z");

        RaffleDrawingService draw = service("2026-11-08T15:00:00Z");
        assertThatThrownBy(() -> service("2026-11-08T14:59:59Z").createReview(week, gm))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code()).isEqualTo("RAFFLE_SALES_OPEN"));
        assertThatThrownBy(() -> draw.createReview(week, viewer))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code()).isEqualTo("RAFFLE_ADMIN_FORBIDDEN"));
        assertThat(draw.memberResult(week, first).status()).isEqualTo("NOT_ANNOUNCED");
        assertThatThrownBy(() -> draw.currentReview(week, gm))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_ROUND_NOT_FOUND"));
        var review = draw.createReview(week, gm);
        assertThat(review.picks()).extracting(winner -> winner.userId())
                .containsExactly(first, second);
        assertThat(review.candidateCount()).isEqualTo(4);
        assertThat(review.excludedGmCount()).isOne();
        assertThat(review.vacantPrizeCount()).isEqualTo(6);
        assertThat(draw.createReview(week, gm).drawId()).isEqualTo(review.drawId());
        assertThat(draw.currentReview(week, viewer).drawId()).isEqualTo(review.drawId());
        assertThat(draw.adminResult(week, gm).finalized()).isFalse();
        assertThat(drawings.winners(drawings.round(week, false).orElseThrow().id())).isEmpty();
        assertThatThrownBy(() -> draw.reroll(week, gm, review.drawId(), " "))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_REROLL_REASON_REQUIRED"));
        assertThatThrownBy(() -> draw.reroll(week, gm, review.drawId(), "가".repeat(501)))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_REROLL_REASON_REQUIRED"));
        assertThatThrownBy(() -> draw.confirmReview(week, gm, 0))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_INVALID_DRAW_ID"));
        var rerolled = draw.reroll(week, gm, review.drawId(), "운영 검토 후 재추첨");
        assertThat(rerolled.drawId()).isNotEqualTo(review.drawId());
        assertThat(rerolled.attemptNumber()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT status FROM event_raffle_draws WHERE id = ?",
                String.class, review.drawId())).isEqualTo("SUPERSEDED");
        assertThatThrownBy(() -> draw.confirmReview(week, gm, review.drawId()))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code()).isEqualTo("RAFFLE_REVIEW_STALE"));
        assertThatThrownBy(() -> draw.reroll(week, gm, review.drawId(), "이전 결과"))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code()).isEqualTo("RAFFLE_REVIEW_STALE"));
        var result = draw.confirmReview(week, gm, rerolled.drawId());
        assertThat(result.finalized()).isTrue();
        assertThat(result.winners()).isEqualTo(rerolled.picks());
        assertThat(draw.confirmReview(week, gm, rerolled.drawId()).alreadyFinalized()).isTrue();
        assertThatThrownBy(() -> draw.createReview(week, gm))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code()).isEqualTo("RAFFLE_ALREADY_FINALIZED"));
        assertThatThrownBy(() -> draw.currentReview(week, gm))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code()).isEqualTo("RAFFLE_ALREADY_FINALIZED"));

        var announced = service("2026-11-09T00:00:00Z");
        assertThat(announced.memberResult(week, first).status()).isEqualTo("SELECTED");
        assertThat(announced.memberResult(week, first).prizes()).singleElement()
                .satisfies(prize -> assertThat(prize.place()).isEqualTo(1));
        assertThat(announced.memberResult(week, gm).status()).isEqualTo("NOT_SELECTED");

        LocalDate nextWeek = week.plusWeeks(1);
        long nextRound = round(nextWeek);
        ticket(nextRound, first, 1, "2026-11-15T14:59:59.999Z");
        ticket(nextRound, second, 2, "2026-11-15T14:59:59.999Z");
        assertThatThrownBy(() -> service("2026-11-15T14:59:59.999Z").createReview(nextWeek, gm))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code()).isEqualTo("RAFFLE_SALES_OPEN"));

        var concurrent = service("2026-11-15T15:00:00Z");
        var start = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var calls = List.of(
                    executor.submit(() -> { start.await(); return concurrent.createReview(nextWeek, gm); }),
                    executor.submit(() -> { start.await(); return concurrent.createReview(nextWeek, gm); }));
            start.countDown();
            var left = calls.get(0).get(20, TimeUnit.SECONDS);
            var right = calls.get(1).get(20, TimeUnit.SECONDS);
            assertThat(left.drawId()).isEqualTo(right.drawId());
            assertThat(left.picks()).isEqualTo(right.picks());
        }
        var nextReview = concurrent.currentReview(nextWeek, gm);
        var confirmStart = new CountDownLatch(1);
        try (var executor = Executors.newVirtualThreadPerTaskExecutor()) {
            var calls = List.of(
                    executor.submit(() -> { confirmStart.await(); return concurrent.confirmReview(nextWeek, gm, nextReview.drawId()); }),
                    executor.submit(() -> { confirmStart.await(); return concurrent.confirmReview(nextWeek, gm, nextReview.drawId()); }));
            confirmStart.countDown();
            assertThat(calls.get(0).get(20, TimeUnit.SECONDS).winners())
                    .isEqualTo(calls.get(1).get(20, TimeUnit.SECONDS).winners());
        }
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_winners w JOIN event_rounds e ON e.id = w.event_round_id
                WHERE e.week_start_date = ?
                """, Integer.class, java.sql.Date.valueOf(nextWeek))).isEqualTo(2);
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_finalization_attempts a
                JOIN event_rounds e ON e.id = a.event_round_id
                WHERE e.week_start_date = ? AND a.outcome = 'SUCCEEDED'
                """, Integer.class, java.sql.Date.valueOf(nextWeek))).isOne();

        // 2026-11-16 회차는 V182가 만들고 공개 추첨 행사로 잠그므로 직접 확정 회귀는 다음 주차로 검증한다.
        LocalDate emptyWeek = nextWeek.plusWeeks(2);
        round(emptyWeek);
        var emptyReview = service("2026-11-29T15:00:00Z").createReview(emptyWeek, gm);
        assertThat(emptyReview.picks()).isEmpty();
        service("2026-11-29T15:00:00Z").confirmReview(emptyWeek, gm, emptyReview.drawId());
        assertThat(drawings.round(emptyWeek, false)).isPresent()
                .get().extracting(RaffleDrawingRepository.EventRound::finalizedAt).isNotNull();
        assertThat(drawings.winners(drawings.round(emptyWeek, false).orElseThrow().id())).isEmpty();

        LocalDate failedWeek = emptyWeek.plusWeeks(1);
        long failedRound = round(failedWeek);
        ticket(failedRound, first, 1, "2026-12-06T14:00:00Z");
        assertThatThrownBy(() -> service("2026-12-06T15:00:00Z",
                new RaffleDrawSelector(bound -> bound)).createReview(failedWeek, gm))
                .isInstanceOf(IllegalStateException.class);
        var failedEvent = drawings.round(failedWeek, false).orElseThrow();
        assertThat(failedEvent.finalizedAt()).isNull();
        assertThat(drawings.winners(failedEvent.id())).isEmpty();
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM event_finalization_attempts
                WHERE event_round_id = ? AND outcome = 'FAILED'
                """, Integer.class, failedEvent.id())).isOne();
        var recovered = service("2026-12-06T15:00:01Z").createReview(failedWeek, gm);
        assertThat(service("2026-12-06T15:00:01Z")
                .confirmReview(failedWeek, gm, recovered.drawId()).winners()).hasSize(1);
    }

    private RaffleDrawingService service(String now) {
        return service(now, new RaffleDrawSelector(bound -> 0));
    }

    private RaffleDrawingService service(String now, RaffleDrawSelector selector) {
        return new RaffleDrawingService(raffles, drawings, administrators,
                selector, transactions,
                Clock.fixed(Instant.parse(now), ZoneOffset.UTC), LocalDate.of(2026, 11, 2));
    }

    private long member(String name) {
        String nickname = "d" + name;
        jdbc.update("""
                INSERT INTO users(login_provider, provider_user_id, nickname, character_gender,
                    created_at, updated_at)
                VALUES ('NAVER', ?, ?, 'MALE', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
                """, UUID.randomUUID().toString(), nickname);
        return jdbc.queryForObject("SELECT id FROM users WHERE nickname = ?", Long.class, nickname);
    }

    private long round(LocalDate week) {
        Instant starts = week.atTime(9, 0).atZone(RaffleSaleWindow.KST).toInstant();
        Instant ends = week.plusWeeks(1).atStartOfDay(RaffleSaleWindow.KST).toInstant();
        jdbc.update("""
                INSERT INTO raffle_rounds(week_start_date, sales_starts_at, sales_ends_at, sales_status)
                VALUES (?, ?, ?, 'OPEN')
                """, java.sql.Date.valueOf(week), java.sql.Timestamp.from(starts),
                java.sql.Timestamp.from(ends));
        return jdbc.queryForObject("SELECT id FROM raffle_rounds WHERE week_start_date = ?",
                Long.class, java.sql.Date.valueOf(week));
    }

    private void ticket(long roundId, long userId, int number, String purchasedAt) {
        long walletId = jdbc.query("""
                SELECT id FROM wallets WHERE user_id = ?
                """, (rows, index) -> rows.getLong(1), userId).stream().findFirst().orElseGet(() -> {
            jdbc.update("INSERT INTO wallets(user_id, balance, reserved_balance) VALUES (?, 1000, 0)", userId);
            return jdbc.queryForObject("SELECT id FROM wallets WHERE user_id = ?", Long.class, userId);
        });
        String key = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO wallet_transactions(wallet_id, transaction_type, balance_delta,
                    reserved_delta, idempotency_key, created_at)
                VALUES (?, 'RAFFLE_PURCHASE', -100, 0, ?, ?)
                """, walletId, key, java.sql.Timestamp.from(Instant.parse(purchasedAt)));
        long transactionId = jdbc.queryForObject("""
                SELECT id FROM wallet_transactions WHERE idempotency_key = ?
                """, Long.class, key);
        jdbc.update("""
                INSERT INTO raffle_tickets(round_id, user_id, ticket_number, purchase_price,
                    balance_after, wallet_transaction_id, idempotency_key, purchased_at)
                VALUES (?, ?, ?, 100, 900, ?, ?, ?)
                """, roundId, userId, number, transactionId, key,
                java.sql.Timestamp.from(Instant.parse(purchasedAt)));
    }
}
