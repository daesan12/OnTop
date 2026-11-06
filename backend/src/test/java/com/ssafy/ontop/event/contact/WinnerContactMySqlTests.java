package com.ssafy.ontop.event.contact;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.admin.security.AdminAccessProperties;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HashSet;
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

@Tag("mysql")
@EnabledIfEnvironmentVariable(named = "TEST_EVENT_CONTACT_DB_URL",
        matches = "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_event_contact_test_[A-Za-z0-9_]+(?:\\?.*)?")
class WinnerContactMySqlTests {
    private static final LocalDate WEEK = LocalDate.of(2026, 11, 2);
    private static final Instant ANNOUNCEMENT = Instant.parse("2026-11-09T00:30:00Z");
    private JdbcTemplate jdbc;
    private DataSourceTransactionManager transactions;
    private WinnerContactRepository repository;
    private WinnerContactCrypto crypto;
    private AdminAccessPolicy administrators;

    @Test
    void 발표된_당첨자만_제출하고_원문_조회는_감사하며_14일_뒤_삭제한다() {
        String url = System.getenv("TEST_EVENT_CONTACT_DB_URL");
        var source = new DriverManagerDataSource(url,
                System.getenv("TEST_EVENT_CONTACT_DB_USERNAME"),
                System.getenv("TEST_EVENT_CONTACT_DB_PASSWORD"));
        jdbc = new JdbcTemplate(source);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables "
                + "WHERE table_schema = DATABASE()", Long.class)).isZero();
        Flyway.configure().dataSource(source).locations("classpath:db/migration")
                .baselineOnMigrate(false).outOfOrder(false).load().migrate();
        transactions = new DataSourceTransactionManager(source);
        repository = new WinnerContactRepository(jdbc);
        crypto = new WinnerContactCrypto("event-test", "event-test=" + Base64.getEncoder()
                .encodeToString(new byte[32]));

        long gm = member("eventgm");
        long reader = member("reader");
        long winner = member("winner");
        long outsider = member("outsider");
        administrators = new AdminAccessPolicy(new AdminAccessProperties(
                Set.of(gm, reader), Set.of(), Set.of(), Set.of(gm)));
        award("JUMPMAP", winner, gm, "coffee");
        award("BUNGEOPPANG", winner, gm, "bread");

        var before = service(ANNOUNCEMENT.minusMillis(1));
        assertThat(before.ownWinnings(winner, WEEK, 100, 0)).isEmpty();
        assertCode(() -> before.submit(winner, WEEK, "01012345678"), "EVENT_CONTACT_NOT_WINNER");
        var service = service(ANNOUNCEMENT.plusSeconds(30));
        assertThat(service.ownWinnings(winner, WEEK, 100, 0)).hasSize(2)
                .allSatisfy(item -> assertThat(item.contactStatus()).isEqualTo("NOT_SUBMITTED"));
        assertCode(() -> service.submit(outsider, WEEK, "01012345678"), "EVENT_CONTACT_NOT_WINNER");
        assertCode(() -> service.submit(winner, WEEK, "bad-phone"), "EVENT_CONTACT_BAD_PHONE");

        var submitted = service.submit(winner, WEEK, "010-1234-5678");
        assertThat(submitted.maskedPhone()).isEqualTo("***-****-5678");
        assertThat(submitted.expiresAt()).isEqualTo(ANNOUNCEMENT.plusSeconds(30)
                .plusSeconds(14 * 24 * 3600));
        byte[] firstCipher = repository.contact(winner, WEEK).orElseThrow().encrypted();
        Timestamp firstUpdate = jdbc.queryForObject(
                "SELECT last_updated_at FROM event_contact_receipts WHERE user_id = ?", Timestamp.class, winner);
        service.submit(winner, WEEK, "01012345678");
        assertThat(repository.contact(winner, WEEK).orElseThrow().encrypted()).isEqualTo(firstCipher);
        assertThat(jdbc.queryForObject(
                "SELECT last_updated_at FROM event_contact_receipts WHERE user_id = ?", Timestamp.class, winner))
                .isEqualTo(firstUpdate);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM event_contact_receipts", Integer.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM event_winner_contacts", Integer.class)).isOne();
        assertThat(jdbc.queryForObject("SELECT HEX(encrypted_phone) FROM event_winner_contacts",
                String.class)).doesNotContain("01012345678");
        assertThat(service.adminWinners(reader, WEEK, null, "SUBMITTED", 20, 0).winners())
                .hasSize(2).allSatisfy(item -> assertThat(item.maskedPhone())
                        .isEqualTo("***-****-5678"));
        assertCode(() -> service.reveal(reader, 1), "EVENT_CONTACT_ADMIN_FORBIDDEN");
        assertThat(service.reveal(gm, 1).phone()).isEqualTo("01012345678");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM event_contact_access_audit",
                Integer.class)).isOne();

        var corrected = service(ANNOUNCEMENT.plusSeconds(6 * 24 * 3600));
        assertThat(corrected.submit(winner, WEEK, "010 5555 9999").expiresAt())
                .isEqualTo(submitted.expiresAt());
        assertThat(corrected.reveal(gm, 2).phone()).isEqualTo("01055559999");
        assertCode(() -> service(ANNOUNCEMENT.plusSeconds(7 * 24 * 3600))
                .submit(winner, WEEK, "01011112222"), "EVENT_CONTACT_SUBMISSION_CLOSED");

        var expired = service(submitted.expiresAt());
        assertCode(() -> expired.reveal(gm, 1), "EVENT_CONTACT_NOT_FOUND");
        assertThat(expired.ownWinnings(winner, WEEK, 100, 0)).hasSize(2)
                .allSatisfy(item -> assertThat(item.contactStatus()).isEqualTo("EXPIRED"));
        assertThat(expired.deleteExpired()).isOne();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM event_winner_contacts", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM event_contact_receipts", Integer.class)).isOne();
        assertThat(expired.adminWinners(gm, WEEK, "JUMPMAP", "EXPIRED", 20, 0).winners())
                .hasSize(1).first().satisfies(item -> assertThat(item.maskedPhone()).isNull());

        for (int index = 1; index <= 101; index++) {
            olderAward(winner, gm, index);
        }
        var firstPage = service.ownWinnings(winner, null, 100, 0);
        var secondPage = service.ownWinnings(winner, null, 100, 100);
        assertThat(firstPage).hasSize(100);
        assertThat(secondPage).hasSize(3);
        var ids = new HashSet<Long>();
        firstPage.forEach(item -> ids.add(item.winnerId()));
        secondPage.forEach(item -> ids.add(item.winnerId()));
        assertThat(ids).hasSize(103);
        assertThat(service.ownWinnings(winner, WEEK, 100, 0)).hasSize(2);
        assertCode(() -> service.ownWinnings(winner, null, 0, 0), "EVENT_CONTACT_BAD_PAGE");
    }

    private WinnerContactService service(Instant now) {
        return new WinnerContactService(repository, crypto, administrators, transactions,
                Clock.fixed(now, ZoneOffset.UTC));
    }

    private long member(String nickname) {
        jdbc.update("""
                INSERT INTO users(login_provider, provider_user_id, nickname, character_gender,
                    created_at, updated_at) VALUES ('SSAFY', ?, ?, 'MALE', ?, ?)
                """, UUID.randomUUID().toString(), nickname,
                Timestamp.from(ANNOUNCEMENT.minusSeconds(100_000_000)),
                Timestamp.from(ANNOUNCEMENT.minusSeconds(100_000_000)));
        return jdbc.queryForObject("SELECT id FROM users WHERE nickname = ?", Long.class, nickname);
    }

    private void award(String type, long winner, long gm, String prize) {
        jdbc.update("""
                INSERT INTO event_rounds(event_type, week_start_date, starts_at, ends_at,
                    announces_at, finalized_at, finalization_source, finalized_by_user_id)
                VALUES (?, ?, ?, ?, ?, ?, 'ADMIN', ?)
                """, type, java.sql.Date.valueOf(WEEK),
                Timestamp.from(Instant.parse("2026-11-02T00:00:00Z")),
                Timestamp.from(Instant.parse("2026-11-08T15:00:00Z")),
                Timestamp.from(ANNOUNCEMENT), Timestamp.from(ANNOUNCEMENT), gm);
        long round = jdbc.queryForObject("SELECT id FROM event_rounds WHERE event_type = ?", Long.class, type);
        jdbc.update("INSERT INTO event_prize_slots(event_round_id, place, slot_number, prize_name) "
                + "VALUES (?, 1, 1, ?)", round, prize);
        long slot = jdbc.queryForObject("SELECT id FROM event_prize_slots WHERE event_round_id = ?",
                Long.class, round);
        jdbc.update("INSERT INTO event_winners(event_round_id, prize_slot_id, user_id, selected_at) "
                + "VALUES (?, ?, ?, ?)", round, slot, winner, Timestamp.from(ANNOUNCEMENT));
    }

    private void olderAward(long winner, long gm, int weeksAgo) {
        LocalDate week = WEEK.minusWeeks(weeksAgo);
        Instant announcement = ANNOUNCEMENT.minus(7L * weeksAgo, ChronoUnit.DAYS);
        jdbc.update("""
                INSERT INTO event_rounds(event_type, week_start_date, starts_at, ends_at,
                    announces_at, finalized_at, finalization_source, finalized_by_user_id)
                VALUES ('JUMPMAP', ?, ?, ?, ?, ?, 'ADMIN', ?)
                """, java.sql.Date.valueOf(week), Timestamp.from(announcement.minus(8, ChronoUnit.DAYS)),
                Timestamp.from(announcement.minus(9, ChronoUnit.HOURS)),
                Timestamp.from(announcement), Timestamp.from(announcement), gm);
        long round = jdbc.queryForObject("SELECT id FROM event_rounds "
                + "WHERE event_type = 'JUMPMAP' AND week_start_date = ?", Long.class,
                java.sql.Date.valueOf(week));
        jdbc.update("INSERT INTO event_prize_slots(event_round_id, place, slot_number, prize_name) "
                + "VALUES (?, 1, 1, 'coffee')", round);
        long slot = jdbc.queryForObject("SELECT id FROM event_prize_slots WHERE event_round_id = ?",
                Long.class, round);
        jdbc.update("INSERT INTO event_winners(event_round_id, prize_slot_id, user_id, selected_at) "
                + "VALUES (?, ?, ?, ?)", round, slot, winner, Timestamp.from(announcement));
    }

    private void assertCode(Runnable action, String code) {
        assertThatThrownBy(action::run).isInstanceOf(WinnerContactException.class)
                .satisfies(error -> assertThat(((WinnerContactException) error).code()).isEqualTo(code));
    }
}
