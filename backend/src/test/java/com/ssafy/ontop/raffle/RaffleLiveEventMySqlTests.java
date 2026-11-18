package com.ssafy.ontop.raffle;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.admin.security.AdminAccessProperties;
import com.ssafy.ontop.event.contact.WinnerContactCrypto;
import com.ssafy.ontop.event.contact.WinnerContactRepository;
import com.ssafy.ontop.event.contact.WinnerContactService;
import com.ssafy.ontop.notification.repository.EventWinnerNotificationRepository;
import com.ssafy.ontop.raffle.domain.RaffleDrawSelector;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository;
import com.ssafy.ontop.raffle.repository.RaffleRepository;
import com.ssafy.ontop.raffle.service.RaffleDrawingService;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Base64;
import java.util.List;
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
 * V182의 2026-11-16 행사 회차 등록·마감 보정, 2026-11-09 회차 연결과 두 회차 통합 추첨을 실제 MySQL에서 검증한다.
 * 시각은 UNIX_TIMESTAMP/FROM_UNIXTIME으로 다뤄 DB 세션과 JVM 시간대의 영향을 받지 않게 한다.
 */
@Tag("mysql")
@EnabledIfEnvironmentVariable(
        named = "TEST_RAFFLE_LIVE_DB_URL",
        matches = "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_raffle_live_test_[A-Za-z0-9_]+(?:\\?.*)?"
)
class RaffleLiveEventMySqlTests {
    private static final LocalDate WEEK = LocalDate.of(2026, 11, 16);
    private static final LocalDate SOURCE_WEEK = LocalDate.of(2026, 11, 9);
    private static final LocalDate OTHER_WEEK = LocalDate.of(2026, 11, 2);
    private static final long SALES_STARTS = epoch("2026-11-16T00:00:00Z");
    private static final long WEEKLY_END = epoch("2026-11-22T15:00:00Z");
    private static final long LIVE_END = epoch("2026-11-18T15:00:00Z");
    private static final long UNEXPECTED_END = epoch("2026-11-20T15:00:00Z");
    private static final long SOURCE_STARTS = epoch("2026-11-09T00:00:00Z");
    private static final long SOURCE_END = epoch("2026-11-15T15:00:00Z");

    private JdbcTemplate jdbc;
    private RaffleRepository raffles;
    private RaffleDrawingRepository drawings;
    private DataSourceTransactionManager transactions;
    private AdminAccessPolicy administrators;

    @Test
    void V182_마감_보정과_11월9일_연결_통합_추첨을_실제_MySQL에서_검증한다() throws Exception {
        var datasource = new DriverManagerDataSource(System.getenv("TEST_RAFFLE_LIVE_DB_URL"),
                System.getenv("TEST_RAFFLE_LIVE_DB_USERNAME"), System.getenv("TEST_RAFFLE_LIVE_DB_PASSWORD"));
        jdbc = new JdbcTemplate(datasource);
        assertThat(jdbc.queryForObject("""
                SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE()
                """, Long.class)).as("기존 데이터를 지우지 않으므로 빈 격리 DB가 필요합니다").isZero();
        migrate(datasource, "180");
        raffles = new RaffleRepository(jdbc);
        drawings = new RaffleDrawingRepository(jdbc);
        transactions = new DataSourceTransactionManager(datasource);
        long gm = member("gm");
        long viewer = member("viewer");
        long both = member("both");
        long sourceOnly = member("source");
        long eventOnly = member("event");
        long late = member("late");
        long outsider = member("outside");
        administrators = new AdminAccessPolicy(new AdminAccessProperties(
                Set.of(gm, viewer), Set.of(), Set.of(gm)));

        // 운영에서 예상하는 상태: 11/02·11/09 회차는 판매가 끝났고, 11/16 회차는 기존 주간 종료값으로 판매 중이다.
        long otherRound = round(OTHER_WEEK, epoch("2026-11-02T00:00:00Z"), epoch("2026-11-08T15:00:00Z"), "CLOSED");
        long sourceRound = round(SOURCE_WEEK, SOURCE_STARTS, SOURCE_END, "CLOSED");
        long eventRound = round(WEEK, SALES_STARTS, WEEKLY_END, "OPEN");
        long outsiderTicket = ticket(otherRound, outsider, 1234, "2026-11-03T03:00:00Z");
        ticket(sourceRound, gm, 1, "2026-11-10T03:00:00Z");
        long bothSourceTicket = ticket(sourceRound, both, 1234, "2026-11-10T04:00:00Z");
        long sourceOnlyTicket = ticket(sourceRound, sourceOnly, 500, "2026-11-15T14:59:59.999Z");
        String ticketsBefore = ticketFingerprint();
        migrate(datasource, null);

        // 11/16만 마감이 바뀌고, 11/09 회차와 기존 응모권·응모 번호는 그대로다.
        assertRound(WEEK, SALES_STARTS, LIVE_END, "OPEN");
        assertRound(SOURCE_WEEK, SOURCE_STARTS, SOURCE_END, "CLOSED");
        assertThat(ticketFingerprint()).isEqualTo(ticketsBefore);
        assertThat(links()).containsExactly("2026-11-09:" + sourceRound, "2026-11-16:" + eventRound);
        assertThat(foreignKeys()).contains("fk_event_raffle_draw_picks_ticket_user")
                .doesNotContain("fk_event_raffle_draw_picks_ticket_owner");
        assertThat(drawings.liveEventMembership(WEEK)).get()
                .satisfies(liveEvent -> assertThat(liveEvent.complete()).isTrue());
        assertThat(drawings.liveEventMembership(SOURCE_WEEK)).get()
                .satisfies(liveEvent -> assertThat(liveEvent.eventWeek()).isEqualTo(WEEK));
        assertThat(drawings.liveEventMembership(OTHER_WEEK)).isEmpty();

        // 11/16 회차 행이 없는 경우: V182의 데이터 문장을 그대로 다시 실행해 회차·등록·연결이 다시 생기는지 본다.
        jdbc.update("DELETE FROM raffle_live_event_rounds");
        jdbc.update("DELETE FROM raffle_live_events");
        jdbc.update("DELETE FROM raffle_rounds WHERE week_start_date = '2026-11-16'");
        RaffleLiveEventMigrationScript.run(jdbc, sql -> sql.startsWith("INSERT INTO"));
        assertRound(WEEK, SALES_STARTS, LIVE_END, "SCHEDULED");
        eventRound = jdbc.queryForObject("SELECT id FROM raffle_rounds WHERE week_start_date = '2026-11-16'",
                Long.class);
        assertThat(links()).containsExactly("2026-11-09:" + sourceRound, "2026-11-16:" + eventRound);

        // 예상과 다른 기존 종료값은 덮어쓰지 않는다.
        jdbc.update("UPDATE raffle_rounds SET sales_ends_at = FROM_UNIXTIME(?) WHERE id = ?", UNEXPECTED_END, eventRound);
        RaffleLiveEventMigrationScript.run(jdbc, sql -> sql.startsWith("INSERT INTO raffle_rounds"));
        assertRound(WEEK, SALES_STARTS, UNEXPECTED_END, "SCHEDULED");
        jdbc.update("UPDATE raffle_rounds SET sales_ends_at = FROM_UNIXTIME(?), sales_status = 'OPEN' WHERE id = ?",
                LIVE_END, eventRound);

        // 11/09가 이미 최종 확정된 경우: 결과를 바꾸지 않고 연결 실패로 남기며, 통합 추첨을 진행하지 않는다.
        jdbc.update("""
                INSERT INTO event_rounds(event_type, week_start_date, starts_at, ends_at, announces_at,
                    raffle_round_id, finalized_at, finalization_source, finalized_by_user_id)
                VALUES ('RAFFLE', '2026-11-09', FROM_UNIXTIME(?), FROM_UNIXTIME(?), FROM_UNIXTIME(?), ?,
                    FROM_UNIXTIME(?), 'ADMIN', ?)
                """, SOURCE_STARTS, SOURCE_END, SOURCE_END + 32_400, sourceRound, SOURCE_END + 32_460, gm);
        relink();
        assertThat(links()).containsExactly("2026-11-09:null", "2026-11-16:" + eventRound);
        assertThat(drawings.liveEventMembership(WEEK)).get()
                .satisfies(liveEvent -> assertThat(liveEvent.complete()).isFalse());
        assertThatThrownBy(() -> service("2026-11-18T15:00:00Z").createReview(WEEK, gm))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_INCOMPLETE"));
        assertThat(drawings.round(WEEK, false)).as("미완료 행사는 행사 회차 기록도 만들지 않는다").isEmpty();
        assertThat(jdbc.queryForObject("""
                SELECT UNIX_TIMESTAMP(finalized_at) FROM event_rounds WHERE week_start_date = '2026-11-09'
                """, Long.class)).isEqualTo(SOURCE_END + 32_460);
        jdbc.update("DELETE FROM event_rounds WHERE week_start_date = '2026-11-09'");
        relink();
        assertThat(links()).containsExactly("2026-11-09:" + sourceRound, "2026-11-16:" + eventRound);

        // 11/16 판매분: 11/09와 같은 응모 번호, 두 회차를 모두 산 회원, 마감 시각 이후 응모권을 포함한다.
        long bothEventTicket = ticket(eventRound, both, 77, "2026-11-17T03:00:00Z");
        long eventOnlyTicket = ticket(eventRound, eventOnly, 1234, "2026-11-18T14:59:59.999Z");
        ticket(eventRound, late, 9, "2026-11-18T15:00:00Z");

        // 행사에 포함된 11/09 회차는 따로 사전 추첨하거나 확정하지 않는다.
        var draw = service("2026-11-18T15:00:00Z");
        assertThatThrownBy(() -> draw.createReview(SOURCE_WEEK, gm))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_SOURCE_ROUND"));
        assertThatThrownBy(() -> draw.confirmReview(SOURCE_WEEK, gm, 1))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_LOCKED"));
        assertThat(drawings.round(SOURCE_WEEK, false)).isEmpty();

        // 11/18 23:59:59.999 KST에는 아직 판매 중이라 사전 추첨할 수 없다.
        assertThatThrownBy(() -> service("2026-11-18T14:59:59.999Z").createReview(WEEK, gm))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code()).isEqualTo("RAFFLE_SALES_OPEN"));

        // 통합 사전 추첨: 연결된 두 회차의 판매 기간 내 응모권만, 응모권 하나를 한 표로, 회원당 한 번만 당첨한다.
        var review = draw.createReview(WEEK, gm);
        assertThat(review.candidateCount()).as("GM·두 회차 응모권 4장, 11/02·마감 이후 응모권 제외").isEqualTo(5);
        assertThat(review.excludedGmCount()).isOne();
        assertThat(review.picks()).extracting(winner -> winner.userId())
                .containsExactly(both, sourceOnly, eventOnly);
        assertThat(review.picks()).extracting(winner -> winner.raffleTicketId())
                .containsExactly(bothSourceTicket, sourceOnlyTicket, eventOnlyTicket)
                .doesNotContain(outsiderTicket, bothEventTicket);
        assertThat(review.picks()).extracting(winner -> winner.ticketNumber()).containsExactly(1234, 500, 1234);
        assertThat(review.vacantPrizeCount()).isEqualTo(5);
        var rerolled = draw.reroll(WEEK, gm, review.drawId(), "행사 직전 검토안 재생성");
        assertThat(rerolled.picks()).isEqualTo(review.picks());

        // 관리자 직접 확정은 잠겨 있고 아무 결과도 남기지 않는다.
        assertThatThrownBy(() -> draw.confirmReview(WEEK, gm, rerolled.drawId()))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_LOCKED"));
        long eventRoundId = drawings.round(WEEK, false).orElseThrow().id();
        assertThat(drawings.winners(eventRoundId)).isEmpty();

        // 판매 종료 + 9시간이 지나도 미확정 검토안은 회원 결과·알림으로 새지 않는다.
        var afternoon = service("2026-11-19T05:00:00Z");
        assertThat(afternoon.memberResult(WEEK, sourceOnly).status()).isEqualTo("PENDING");
        var notifications = new EventWinnerNotificationRepository(jdbc);
        notifications.connectPublished(sourceOnly, Instant.parse("2026-11-19T05:00:00Z"));
        assertThat(notificationCount(sourceOnly)).isZero();

        // 행사 완료용 내부 경로: 운영 권한, 행사 회차 여부, 대상 등록을 확인한다.
        assertThatThrownBy(() -> afternoon.confirmLiveEventReview(WEEK, viewer, rerolled.drawId()))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_ADMIN_FORBIDDEN"));
        assertThatThrownBy(() -> afternoon.confirmLiveEventReview(SOURCE_WEEK, gm, rerolled.drawId()))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_SOURCE_ROUND"));
        assertThatThrownBy(() -> afternoon.confirmLiveEventReview(OTHER_WEEK, gm, 1))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_NOT_REGISTERED"));

        var completed = afternoon.confirmLiveEventReview(WEEK, gm, rerolled.drawId());
        assertThat(completed.finalized()).isTrue();
        assertThat(completed.winners()).isEqualTo(rerolled.picks());
        assertThat(afternoon.confirmLiveEventReview(WEEK, gm, rerolled.drawId()).alreadyFinalized())
                .as("같은 drawId 재시도는 당첨자를 다시 만들지 않는다").isTrue();
        assertThat(drawings.winners(eventRoundId)).hasSize(3);

        // 11/09 회차만 산 회원도 행사 회차(11/16) 기준으로 결과·알림·연락처 제출까지 처리된다.
        assertThat(afternoon.memberResult(WEEK, sourceOnly).status()).isEqualTo("SELECTED");
        assertThat(afternoon.memberResult(WEEK, sourceOnly).prizes()).singleElement()
                .satisfies(prize -> assertThat(prize.ticketNumber()).isEqualTo(500));
        notifications.connectPublished(sourceOnly, Instant.parse("2026-11-19T05:00:01Z"));
        assertThat(notificationCount(sourceOnly)).isOne();
        var contacts = new WinnerContactService(new WinnerContactRepository(jdbc),
                new WinnerContactCrypto("event-test", "event-test=" + Base64.getEncoder().encodeToString(new byte[32])),
                administrators, transactions, Clock.fixed(Instant.parse("2026-11-19T05:00:01Z"), ZoneOffset.UTC));
        assertThat(contacts.ownWinnings(sourceOnly, WEEK, 10, 0)).singleElement()
                .satisfies(award -> assertThat(award.eventType()).isEqualTo("RAFFLE"));
        assertThat(contacts.submit(sourceOnly, WEEK, "010-1234-5678").status()).isEqualTo("SUBMITTED");

        // 행사 전후로 기존 응모권·응모 번호는 바뀌지 않는다.
        assertThat(ticketFingerprint(bothSourceTicket, sourceOnlyTicket, outsiderTicket))
                .isEqualTo(fingerprintOf(ticketsBefore, bothSourceTicket, sourceOnlyTicket, outsiderTicket));
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

    /** 행사 등록·연결만 지우고 V182의 등록·연결 문장을 그대로 다시 실행한다. */
    private void relink() throws Exception {
        jdbc.update("DELETE FROM raffle_live_event_rounds");
        jdbc.update("DELETE FROM raffle_live_events");
        RaffleLiveEventMigrationScript.run(jdbc, sql -> sql.startsWith("INSERT INTO raffle_live_event"));
    }

    private List<String> links() {
        return jdbc.queryForList("""
                SELECT CONCAT(DATE_FORMAT(week_start_date, '%Y-%m-%d'), ':', COALESCE(raffle_round_id, 'null'))
                FROM raffle_live_event_rounds ORDER BY week_start_date
                """, String.class);
    }

    private List<String> foreignKeys() {
        return jdbc.queryForList("""
                SELECT constraint_name FROM information_schema.referential_constraints
                WHERE constraint_schema = DATABASE() AND table_name = 'event_raffle_draw_picks'
                """, String.class);
    }

    private void assertRound(LocalDate week, long startsAt, long endsAt, String status) {
        var round = jdbc.queryForMap("""
                SELECT UNIX_TIMESTAMP(sales_starts_at) AS starts_at, UNIX_TIMESTAMP(sales_ends_at) AS ends_at,
                       sales_status
                FROM raffle_rounds WHERE week_start_date = ?
                """, java.sql.Date.valueOf(week));
        assertThat(((Number) round.get("starts_at")).longValue()).isEqualTo(startsAt);
        assertThat(((Number) round.get("ends_at")).longValue()).isEqualTo(endsAt);
        assertThat(round.get("sales_status")).isEqualTo(status);
    }

    private String ticketFingerprint(long... ids) {
        String filter = ids.length == 0 ? "" : " WHERE id IN (" + String.join(",",
                java.util.Arrays.stream(ids).mapToObj(Long::toString).toList()) + ")";
        return String.join("|", jdbc.queryForList("""
                SELECT CONCAT(id, ':', round_id, ':', user_id, ':', ticket_number, ':', wallet_transaction_id, ':',
                    UNIX_TIMESTAMP(purchased_at)) FROM raffle_tickets""" + filter + " ORDER BY id", String.class));
    }

    private String fingerprintOf(String all, long... ids) {
        var wanted = java.util.Arrays.stream(ids).mapToObj(id -> id + ":").toList();
        return String.join("|", java.util.Arrays.stream(all.split("\\|"))
                .filter(row -> wanted.stream().anyMatch(row::startsWith)).toList());
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

    private long round(LocalDate week, long startsAt, long endsAt, String status) {
        jdbc.update("""
                INSERT INTO raffle_rounds(week_start_date, sales_starts_at, sales_ends_at, sales_status)
                VALUES (?, FROM_UNIXTIME(?), FROM_UNIXTIME(?), ?)
                """, java.sql.Date.valueOf(week), startsAt, endsAt, status);
        return jdbc.queryForObject("SELECT id FROM raffle_rounds WHERE week_start_date = ?", Long.class,
                java.sql.Date.valueOf(week));
    }

    private long ticket(long roundId, long userId, int number, String purchasedAt) {
        long purchased = Instant.parse(purchasedAt).toEpochMilli();
        jdbc.update("INSERT IGNORE INTO wallets(user_id, balance, reserved_balance) VALUES (?, 1000, 0)", userId);
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
        return jdbc.queryForObject("SELECT id FROM raffle_tickets WHERE idempotency_key = ?", Long.class, key);
    }

    private static long epoch(String instant) {
        return Instant.parse(instant).getEpochSecond();
    }
}
