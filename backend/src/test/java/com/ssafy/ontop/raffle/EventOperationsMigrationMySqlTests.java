package com.ssafy.ontop.raffle;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("mysql")
@EnabledIfEnvironmentVariable(
        named = "TEST_EVENT_DB_URL",
        matches = "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_event_test_[A-Za-z0-9_]+(?:\\?.*)?"
)
class EventOperationsMigrationMySqlTests {
    @Test
    void 기존_미확정_회차와_알림을_보존하며_운영_스키마를_추가한다() throws Exception {
        String url = System.getenv("TEST_EVENT_DB_URL");
        String username = required("TEST_EVENT_DB_USERNAME");
        String password = required("TEST_EVENT_DB_PASSWORD");

        try (Connection connection = DriverManager.getConnection(url, username, password);
                Statement statement = connection.createStatement()) {
            assertThat(count(statement, "information_schema.tables", "table_schema=DATABASE()"))
                    .as("빈 격리 DB에서만 실행합니다").isZero();
            migrate(url, username, password, "162");
            statement.executeUpdate("""
                    INSERT INTO users(login_provider, provider_user_id, nickname, character_gender,
                        created_at, updated_at) VALUES
                    ('SSAFY', 'event-operator', 'oper1', 'MALE', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
                    ('SSAFY', 'event-winner', 'winner1', 'FEMALE', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
                    """);
            statement.executeUpdate("""
                    INSERT INTO raffle_rounds(week_start_date, sales_starts_at, sales_ends_at, sales_status)
                    VALUES ('2026-11-02', '2026-11-02 00:00:00.000',
                        '2026-11-08 15:00:00.000', 'CLOSED')
                    """);
            statement.executeUpdate("""
                    INSERT INTO event_rounds(event_type, week_start_date, starts_at, ends_at,
                        announces_at, raffle_round_id) VALUES
                    ('RAFFLE', '2026-11-02', '2026-11-02 00:00:00.000',
                        '2026-11-08 15:00:00.000', '2026-11-09 00:00:00.000', 1),
                    ('JUMPMAP', '2026-11-02', '2026-11-02 00:00:00.000',
                        '2026-11-08 15:00:00.000', '2026-11-09 00:00:00.000', NULL)
                    """);
            statement.executeUpdate("""
                    INSERT INTO event_prize_slots(event_round_id, place, slot_number, prize_name)
                    VALUES (1, 1, 1, 'raffle prize'), (2, 1, 1, 'game prize')
                    """);
            statement.executeUpdate("""
                    INSERT INTO event_winners(event_round_id, prize_slot_id, user_id, selected_at)
                    VALUES (2, 2, 2, '2026-11-09 00:05:00.000')
                    """);
            statement.executeUpdate("""
                    INSERT INTO personal_notifications(user_id, reply_id, type, title, created_at, expires_at)
                    VALUES (2, NULL, 'REWARD', 'old reward',
                        '2026-11-09 00:00:00.000', '2026-12-09 00:00:00.000')
                    """);

            Flyway current = migrate(url, username, password, "163");
            assertThat(current.validateWithResult().validationSuccessful).isTrue();
            assertThat(current.info().current().getVersion().getVersion()).isEqualTo("163");
            assertThat(count(statement, "event_rounds", "event_type='RAFFLE' AND finalized_at IS NULL"))
                    .isOne();
            assertThat(count(statement, "event_winners", "event_round_id=2")).isOne();
            assertThat(count(statement, "personal_notifications", "type='REWARD' AND event_week_start_date IS NULL"))
                    .isOne();

            statement.executeUpdate("""
                    INSERT INTO event_raffle_draws(event_round_id, raffle_round_id, attempt_number, status,
                        requested_by_user_id, candidate_count, excluded_gm_count, picked_count, created_at)
                    VALUES (1, 1, 1, 'REVIEW', 1, 2, 0, 1, '2026-11-09 00:10:00.000')
                    """);
            duplicate(() -> statement.executeUpdate("""
                    INSERT INTO event_raffle_draws(event_round_id, raffle_round_id, attempt_number, status,
                        requested_by_user_id, reroll_reason, candidate_count, excluded_gm_count,
                        picked_count, created_at)
                    VALUES (1, 1, 2, 'REVIEW', 1, 'retry', 2, 0, 1, '2026-11-09 00:11:00.000')
                    """));
            statement.executeUpdate("""
                    UPDATE event_raffle_draws SET status='SUPERSEDED',
                        superseded_at='2026-11-09 00:11:00.000' WHERE id=1
                    """);
            checkFailure(() -> statement.executeUpdate("""
                    INSERT INTO event_raffle_draws(event_round_id, raffle_round_id, attempt_number, status,
                        requested_by_user_id, candidate_count, excluded_gm_count, picked_count, created_at)
                    VALUES (1, 1, 2, 'REVIEW', 1, 2, 0, 1, '2026-11-09 00:11:00.000')
                    """));
            statement.executeUpdate("""
                    INSERT INTO event_raffle_draws(event_round_id, raffle_round_id, attempt_number, status,
                        requested_by_user_id, reroll_reason, candidate_count, excluded_gm_count,
                        picked_count, created_at)
                    VALUES (1, 1, 2, 'REVIEW', 1, 'retry', 2, 0, 1, '2026-11-09 00:11:00.000')
                    """);
            assertThat(count(statement, "event_raffle_draws", "event_round_id=1")).isEqualTo(2);
            assertThatThrownBy(() -> statement.executeUpdate("""
                    INSERT INTO event_raffle_draws(event_round_id, raffle_round_id, attempt_number, status,
                        requested_by_user_id, reroll_reason, candidate_count, excluded_gm_count,
                        picked_count, created_at)
                    VALUES (2, 1, 1, 'REVIEW', 1, NULL, 0, 0, 0,
                        '2026-11-09 00:12:00.000')
                    """)).isInstanceOf(SQLException.class);

            statement.executeUpdate("INSERT INTO wallets(user_id, balance) VALUES (2, 1000)");
            statement.executeUpdate("""
                    INSERT INTO wallet_transactions(wallet_id, transaction_type, balance_delta,
                        reserved_delta, idempotency_key)
                    VALUES (1, 'RAFFLE_PURCHASE', -100, 0, 'event-v163-ticket')
                    """);
            statement.executeUpdate("""
                    INSERT INTO raffle_tickets(round_id, user_id, ticket_number, purchase_price,
                        balance_after, wallet_transaction_id, idempotency_key)
                    VALUES (1, 2, 3140, 100, 900, 1, 'event-v163-ticket')
                    """);
            statement.executeUpdate("""
                    INSERT INTO event_raffle_draw_picks(draw_id, event_round_id, raffle_round_id,
                        prize_slot_id, raffle_ticket_id, user_id)
                    SELECT id, event_round_id, raffle_round_id, 1, 1, 2
                    FROM event_raffle_draws WHERE event_round_id=1 AND attempt_number=2
                    """);
            assertThatThrownBy(() -> statement.executeUpdate("""
                    INSERT INTO event_raffle_draw_picks(draw_id, event_round_id, raffle_round_id,
                        prize_slot_id, raffle_ticket_id, user_id)
                    SELECT id, event_round_id, raffle_round_id, 1, 1, 1
                    FROM event_raffle_draws WHERE event_round_id=1 AND attempt_number=1
                    """)).isInstanceOf(SQLException.class);

            statement.executeUpdate("""
                    INSERT INTO event_minigame_configs(event_round_id, game_code, display_name,
                        ranking_rule_version, enabled, configured_by_user_id, configured_at)
                    VALUES (2, 'JUMPMAP', '점프맵', 'v3', TRUE, 1, '2026-11-09 00:00:00.000')
                    """);
            assertThatThrownBy(() -> statement.executeUpdate("""
                    INSERT INTO event_minigame_configs(event_round_id, game_code, display_name,
                        ranking_rule_version, enabled, configured_by_user_id, configured_at)
                    VALUES (1, 'BUNGEOPPANG', '붕어빵', 'v5', TRUE, 1, '2026-11-09 00:00:00.000')
                    """)).isInstanceOf(SQLException.class);

            statement.executeUpdate("""
                    INSERT INTO event_prize_deliveries(winner_id, delivered_by_user_id, delivered_at)
                    VALUES (1, 1, '2026-11-10 00:00:00.000')
                    """);
            duplicate(() -> statement.executeUpdate("""
                    INSERT INTO event_prize_deliveries(winner_id, delivered_by_user_id, delivered_at)
                    VALUES (1, 1, '2026-11-10 00:00:01.000')
                    """));

            statement.executeUpdate("""
                    INSERT INTO personal_notifications(user_id, reply_id, type, title,
                        created_at, expires_at, event_week_start_date)
                    VALUES (2, NULL, 'EVENT_WINNER', '당첨',
                        '2026-11-09 00:00:00.000', '2026-12-09 00:00:00.000', '2026-11-02')
                    """);
            duplicate(() -> statement.executeUpdate("""
                    INSERT INTO personal_notifications(user_id, reply_id, type, title,
                        created_at, expires_at, event_week_start_date)
                    VALUES (2, NULL, 'EVENT_WINNER', '중복',
                        '2026-11-09 00:00:00.000', '2026-12-09 00:00:00.000', '2026-11-02')
                    """));
            checkFailure(() -> statement.executeUpdate("""
                    INSERT INTO personal_notifications(user_id, reply_id, type, title,
                        created_at, expires_at)
                    VALUES (2, NULL, 'EVENT_WINNER', '주차 누락',
                        '2026-11-09 00:00:00.000', '2026-12-09 00:00:00.000')
                    """));
        }
    }

    private Flyway migrate(String url, String username, String password, String target) {
        Flyway flyway = Flyway.configure().dataSource(url, username, password)
                .locations("classpath:db/migration").target(target)
                .baselineOnMigrate(false).outOfOrder(false).load();
        flyway.migrate();
        return flyway;
    }

    private long count(Statement statement, String table, String condition) throws SQLException {
        try (var rows = statement.executeQuery("SELECT COUNT(*) FROM " + table + " WHERE " + condition)) {
            rows.next();
            return rows.getLong(1);
        }
    }

    private void duplicate(SqlOperation operation) {
        assertThatThrownBy(operation::execute).isInstanceOf(SQLException.class)
                .satisfies(error -> assertThat(((SQLException) error).getErrorCode()).isEqualTo(1062));
    }

    private void checkFailure(SqlOperation operation) {
        assertThatThrownBy(operation::execute).isInstanceOf(SQLException.class)
                .satisfies(error -> assertThat(((SQLException) error).getErrorCode()).isEqualTo(3819));
    }

    private String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("이벤트 마이그레이션 테스트 환경변수가 없습니다: " + name);
        }
        return value;
    }

    @FunctionalInterface
    private interface SqlOperation {
        void execute() throws SQLException;
    }
}
