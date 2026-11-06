package com.ssafy.ontop.event.asset;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.admin.security.AdminAccessProperties;
import java.sql.Timestamp;
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

@Tag("mysql")
@EnabledIfEnvironmentVariable(named = "TEST_ASSET_AWARD_DB_URL",
        matches = "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_asset_award_test_[A-Za-z0-9_]+(?:\\?.*)?")
class AssetAwardMySqlTests {
    private static final LocalDate WEEK = LocalDate.of(2026, 11, 9);
    private static final Instant START = Instant.parse("2026-11-09T00:00:00Z");
    private static final Instant END = Instant.parse("2026-11-15T15:00:00Z");
    private JdbcTemplate jdbc;

    @Test
    void 마감_잔액_동점_선착순_GM_제외_사후변경_재실행을_검증한다() {
        String url = System.getenv("TEST_ASSET_AWARD_DB_URL");
        assertThat(url).matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_asset_award_test_[A-Za-z0-9_]+(?:\\?.*)?");
        var datasource = new DriverManagerDataSource(url,
                System.getenv("TEST_ASSET_AWARD_DB_USERNAME"),
                System.getenv("TEST_ASSET_AWARD_DB_PASSWORD"));
        jdbc = new JdbcTemplate(datasource);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables "
                + "WHERE table_schema = DATABASE()", Long.class)).isZero();
        Flyway.configure().dataSource(datasource).locations("classpath:db/migration")
                .baselineOnMigrate(false).outOfOrder(false).load().migrate();

        long gm = member("gm");
        long early = member("early");
        long later = member("later");
        long third = member("third");
        long lateCredit = member("late");
        wallet(gm, 1_000);
        wallet(early, 250);
        wallet(later, 1_000);
        wallet(third, 200);
        wallet(lateCredit, 1_000);
        change(gm, 1_000, "2026-11-10T10:00:00Z");
        change(early, 250, "2026-11-10T10:00:00Z");
        change(later, 250, "2026-11-10T11:00:00Z");
        change(later, 750, END.plusSeconds(1).toString());
        change(third, 200, "2026-11-11T10:00:00Z");
        change(lateCredit, 100, "2026-11-12T10:00:00Z");
        change(lateCredit, 900, END.toString());

        var admins = new AdminAccessPolicy(new AdminAccessProperties(Set.of(gm), Set.of(), Set.of(gm)));
        var repository = new AssetAwardRepository(jdbc);
        var manager = new DataSourceTransactionManager(datasource);
        var before = service(repository, admins, manager, END.plusSeconds(299));
        assertThat(before.memberResult(WEEK, early).status()).isEqualTo("NOT_ANNOUNCED");
        assertThatThrownBy(() -> before.finalizeRound(WEEK, gm))
                .isInstanceOf(AssetAwardException.class)
                .satisfies(error -> assertThat(((AssetAwardException) error).code())
                        .isEqualTo("EVENT_RECORDS_OPEN"));

        var awards = service(repository, admins, manager, END.plusSeconds(300));
        var result = awards.finalizeRound(WEEK, gm);
        assertThat(result.finalized()).isTrue();
        assertThat(result.valuationBasis()).isEqualTo("COIN_BALANCE");
        assertThat(result.candidateCount()).isEqualTo(5);
        assertThat(result.excludedGmCount()).isOne();
        assertThat(result.winners()).extracting(value -> value.userId())
                .containsExactly(early, later, third);
        assertThat(result.winners()).extracting(value -> value.sourceValue())
                .containsExactly(250L, 250L, 200L);
        assertThat(result.winners()).extracting(value -> value.place())
                .containsExactly(1, 2, 3);
        assertThat(result.winners().getFirst().sourceAchievedAt())
                .isEqualTo(Instant.parse("2026-11-10T10:00:00Z"));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM event_asset_snapshots "
                + "WHERE event_round_id = (SELECT id FROM event_rounds WHERE event_type = 'ASSET_VALUE')",
                Integer.class)).isEqualTo(5);
        assertThat(awards.finalizeRound(WEEK, gm).alreadyFinalized()).isTrue();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM event_winners w JOIN event_rounds r "
                + "ON r.id = w.event_round_id WHERE r.event_type = 'ASSET_VALUE'", Integer.class))
                .isEqualTo(3);
        var announced = service(repository, admins, manager, END.plusSeconds(9 * 3600));
        assertThat(announced.memberResult(WEEK, later).prize().place()).isEqualTo(2);
        assertThat(announced.memberResult(WEEK, lateCredit).status()).isEqualTo("NOT_SELECTED");
    }

    private AssetAwardService service(AssetAwardRepository repository, AdminAccessPolicy admins,
            DataSourceTransactionManager manager, Instant now) {
        return new AssetAwardService(repository, admins, manager, Clock.fixed(now, ZoneOffset.UTC), WEEK);
    }

    private long member(String nickname) {
        jdbc.update("""
                INSERT INTO users(login_provider, provider_user_id, nickname, character_gender,
                    created_at, updated_at) VALUES ('NAVER', ?, ?, 'MALE', ?, ?)
                """, UUID.randomUUID().toString(), nickname,
                Timestamp.from(START.minusSeconds(60)), Timestamp.from(START.minusSeconds(60)));
        return jdbc.queryForObject("SELECT id FROM users WHERE nickname = ?", Long.class, nickname);
    }

    private void wallet(long userId, long balance) {
        jdbc.update("INSERT INTO wallets(user_id, balance) VALUES (?, ?)", userId, balance);
    }

    private void change(long userId, long amount, String at) {
        jdbc.update("""
                INSERT INTO wallet_transactions(wallet_id, transaction_type, balance_delta,
                    reserved_delta, idempotency_key, created_at)
                VALUES ((SELECT id FROM wallets WHERE user_id = ?), 'GAME_REWARD', ?, 0, ?, ?)
                """, userId, amount, UUID.randomUUID().toString(), Timestamp.from(Instant.parse(at)));
    }
}
