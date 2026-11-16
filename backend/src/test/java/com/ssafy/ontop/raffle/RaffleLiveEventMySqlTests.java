package com.ssafy.ontop.raffle;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.admin.security.AdminAccessProperties;
import com.ssafy.ontop.notification.repository.EventWinnerNotificationRepository;
import com.ssafy.ontop.raffle.domain.RaffleDrawSelector;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository;
import com.ssafy.ontop.raffle.repository.RaffleRepository;
import com.ssafy.ontop.raffle.service.RaffleDrawingService;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Set;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * V182의 2026-11-16 회차 마감 보정·공개 추첨 행사 등록과 B안 확정 잠금을 실제 MySQL에서 검증한다.
 * 시각은 UNIX_TIMESTAMP/FROM_UNIXTIME으로 다뤄 DB 세션과 JVM 시간대의 영향을 받지 않게 한다.
 */
@Tag("mysql")
@EnabledIfEnvironmentVariable(
        named = "TEST_RAFFLE_LIVE_DB_URL",
        matches = "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_raffle_live_test_[A-Za-z0-9_]+(?:\\?.*)?"
)
class RaffleLiveEventMySqlTests {
    private static final LocalDate WEEK = LocalDate.of(2026, 11, 16);
    private static final long SALES_STARTS = Instant.parse("2026-11-16T00:00:00Z").getEpochSecond();
    private static final long WEEKLY_END = Instant.parse("2026-11-22T15:00:00Z").getEpochSecond();
    private static final long LIVE_END = Instant.parse("2026-11-18T15:00:00Z").getEpochSecond();
    private static final long UNEXPECTED_END = Instant.parse("2026-11-20T15:00:00Z").getEpochSecond();

    private JdbcTemplate jdbc;
    private RaffleRepository raffles;
    private RaffleDrawingRepository drawings;
    private DataSourceTransactionManager transactions;
    private AdminAccessPolicy administrators;

    @Test
    void V182_마감_보정과_READY_잠금을_실제_MySQL에서_검증한다() throws Exception {
        var datasource = new DriverManagerDataSource(System.getenv("TEST_RAFFLE_LIVE_DB_URL"),
                System.getenv("TEST_RAFFLE_LIVE_DB_USERNAME"), System.getenv("TEST_RAFFLE_LIVE_DB_PASSWORD"));
        jdbc = new JdbcTemplate(datasource);
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()
                """, Long.class)).as("기존 데이터를 지우지 않으므로 빈 격리 DB가 필요합니다").isZero();
        migrate(datasource, "180");

        // 운영에서 예상하는 상태: 판매가 열린 기존 주간 회차(11/23 00:00 KST 종료)가 이미 있다.
        jdbc.update("""
                INSERT INTO raffle_rounds(week_start_date, sales_starts_at, sales_ends_at, sales_status)
                VALUES ('2026-11-16', FROM_UNIXTIME(?), FROM_UNIXTIME(?), 'OPEN')
                """, SALES_STARTS, WEEKLY_END);
        migrate(datasource, null);
        assertRound(SALES_STARTS, LIVE_END, "OPEN");
        assertRegistered("MIGRATION");

        // 회차 행이 없는 경우: V182의 데이터 문장을 그대로 다시 실행해 새 회차와 등록이 생기는지 본다.
        jdbc.update("DELETE FROM raffle_live_events");
        jdbc.update("DELETE FROM raffle_rounds WHERE week_start_date = '2026-11-16'");
        RaffleLiveEventMigrationScript.run(jdbc, sql -> sql.startsWith("INSERT INTO"));
        assertRound(SALES_STARTS, LIVE_END, "SCHEDULED");
        assertRegistered("MIGRATION");

        // 예상과 다른 기존 종료값은 덮어쓰지 않는다.
        jdbc.update("UPDATE raffle_rounds SET sales_ends_at = FROM_UNIXTIME(?) WHERE week_start_date = '2026-11-16'",
                UNEXPECTED_END);
        RaffleLiveEventMigrationScript.run(jdbc, sql -> sql.startsWith("INSERT INTO raffle_rounds"));
        assertRound(SALES_STARTS, UNEXPECTED_END, "SCHEDULED");
        jdbc.update("""
                UPDATE raffle_rounds SET sales_ends_at = FROM_UNIXTIME(?), sales_status = 'OPEN'
                WHERE week_start_date = '2026-11-16'
                """, LIVE_END);

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
        long roundId = jdbc.queryForObject("SELECT id FROM raffle_rounds WHERE week_start_date = '2026-11-16'",
                Long.class);
        ticket(roundId, gm, 1, "2026-11-17T03:00:00Z");
        ticket(roundId, first, 2, "2026-11-17T03:00:00Z");
        ticket(roundId, second, 3, "2026-11-18T14:59:59.999Z");
        ticket(roundId, late, 4, "2026-11-18T15:00:00Z");

        // 11/18 23:59:59.999 KST에는 아직 판매 중이라 사전 추첨할 수 없고, 11/19 00:00 KST부터는 가능하다.
        assertThatThrownBy(() -> service("2026-11-18T14:59:59.999Z").createReview(WEEK, gm))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code()).isEqualTo("RAFFLE_SALES_OPEN"));
        var draw = service("2026-11-18T15:00:00Z");
        var review = draw.createReview(WEEK, gm);
        assertThat(review.candidateCount()).as("마감 시각 이후 응모권은 후보가 아니다").isEqualTo(3);
        assertThat(review.excludedGmCount()).isOne();
        assertThat(review.picks()).extracting(winner -> winner.userId()).containsExactly(first, second);
        var rerolled = draw.reroll(WEEK, gm, review.drawId(), "행사 직전 검토안 재생성");

        // READY 대상 회차의 관리자 직접 확정은 Feature Flag 없이도 거부되고 아무 결과도 남기지 않는다.
        assertThatThrownBy(() -> draw.confirmReview(WEEK, gm, rerolled.drawId()))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_LOCKED"));
        long eventRound = drawings.round(WEEK, false).orElseThrow().id();
        assertThat(drawings.round(WEEK, false).orElseThrow().finalizedAt()).isNull();
        assertThat(drawings.winners(eventRound)).isEmpty();

        // 기존 발표 계산(판매 종료 + 9시간)이 지나도 미확정 검토안은 회원 결과·알림으로 새지 않는다.
        var afternoon = service("2026-11-19T05:00:00Z");
        assertThat(afternoon.memberResult(WEEK, first).status()).isEqualTo("PENDING");
        var notifications = new EventWinnerNotificationRepository(jdbc);
        notifications.connectPublished(first, Instant.parse("2026-11-19T05:00:00Z"));
        assertThat(notificationCount(first)).isZero();

        // 행사 완료용 내부 경로도 운영 권한과 대상 등록을 확인한다.
        assertThatThrownBy(() -> afternoon.confirmLiveEventReview(WEEK, viewer, rerolled.drawId()))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_ADMIN_FORBIDDEN"));
        assertThatThrownBy(() -> afternoon.confirmLiveEventReview(LocalDate.of(2026, 11, 9), gm, 1))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_NOT_REGISTERED"));

        var completed = afternoon.confirmLiveEventReview(WEEK, gm, rerolled.drawId());
        assertThat(completed.finalized()).isTrue();
        assertThat(completed.winners()).isEqualTo(rerolled.picks());
        assertThat(afternoon.confirmLiveEventReview(WEEK, gm, rerolled.drawId()).alreadyFinalized())
                .as("같은 drawId 재시도는 당첨자를 다시 만들지 않는다").isTrue();
        assertThat(drawings.winners(eventRound)).hasSize(2);
        assertThat(afternoon.memberResult(WEEK, first).status()).isEqualTo("SELECTED");
        notifications.connectPublished(first, Instant.parse("2026-11-19T05:00:01Z"));
        assertThat(notificationCount(first)).isOne();
    }

    private void migrate(DriverManagerDataSource datasource, String target) {
        // V165가 db/shop의 items를 참조한다.
        var configuration = Flyway.configure().dataSource(datasource)
                .locations("classpath:db/migration", "classpath:db/shop")
                .baselineOnMigrate(false).outOfOrder(false);
        if (target != null) {
            configuration.target(target);
        }
        configuration.load().migrate();
    }

    private void assertRound(long startsAt, long endsAt, String status) {
        var round = jdbc.queryForMap("""
                SELECT UNIX_TIMESTAMP(sales_starts_at) AS starts_at, UNIX_TIMESTAMP(sales_ends_at) AS ends_at,
                       sales_status
                FROM raffle_rounds WHERE week_start_date = '2026-11-16'
                """);
        assertThat(((Number) round.get("starts_at")).longValue()).isEqualTo(startsAt);
        assertThat(((Number) round.get("ends_at")).longValue()).isEqualTo(endsAt);
        assertThat(round.get("sales_status")).isEqualTo(status);
    }

    private void assertRegistered(String source) {
        assertThat(jdbc.queryForList("""
                SELECT CONCAT(e.status, '/', e.registration_source) FROM raffle_live_events e
                JOIN raffle_rounds r ON r.id = e.raffle_round_id
                WHERE r.week_start_date = '2026-11-16'
                """, String.class)).containsExactly("READY/" + source);
        assertThat(new RaffleDrawingRepository(jdbc).liveEventRegistered(WEEK)).isTrue();
    }

    private long notificationCount(long userId) {
        return jdbc.queryForObject("""
                SELECT COUNT(*) FROM personal_notifications
                WHERE user_id = ? AND type = 'EVENT_WINNER' AND event_week_start_date = '2026-11-16'
                """, Long.class, userId);
    }

    private RaffleDrawingService service(String now) {
        return new RaffleDrawingService(raffles, drawings, administrators,
                new RaffleDrawSelector(bound -> 0), transactions,
                Clock.fixed(Instant.parse(now), ZoneOffset.UTC), LocalDate.of(2026, 11, 2));
    }

    private long member(String name) {
        String nickname = "l" + name;
        jdbc.update("""
                INSERT INTO users(login_provider, provider_user_id, nickname, character_gender,
                    created_at, updated_at)
                VALUES ('NAVER', ?, ?, 'MALE', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
                """, UUID.randomUUID().toString(), nickname);
        return jdbc.queryForObject("SELECT id FROM users WHERE nickname = ?", Long.class, nickname);
    }

    private void ticket(long roundId, long userId, int number, String purchasedAt) {
        long purchased = Instant.parse(purchasedAt).toEpochMilli();
        jdbc.update("INSERT INTO wallets(user_id, balance, reserved_balance) VALUES (?, 1000, 0)", userId);
        long walletId = jdbc.queryForObject("SELECT id FROM wallets WHERE user_id = ?", Long.class, userId);
        String key = UUID.randomUUID().toString();
        jdbc.update("""
                INSERT INTO wallet_transactions(wallet_id, transaction_type, balance_delta,
                    reserved_delta, idempotency_key, created_at)
                VALUES (?, 'RAFFLE_PURCHASE', -100, 0, ?, FROM_UNIXTIME(? / 1000))
                """, walletId, key, purchased);
        long transactionId = jdbc.queryForObject(
                "SELECT id FROM wallet_transactions WHERE idempotency_key = ?", Long.class, key);
        jdbc.update("""
                INSERT INTO raffle_tickets(round_id, user_id, ticket_number, purchase_price,
                    balance_after, wallet_transaction_id, idempotency_key, purchased_at)
                VALUES (?, ?, ?, 100, 900, ?, ?, FROM_UNIXTIME(? / 1000))
                """, roundId, userId, number, transactionId, key, purchased);
    }
}
