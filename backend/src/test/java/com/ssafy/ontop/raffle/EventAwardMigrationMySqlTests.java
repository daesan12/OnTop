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
class EventAwardMigrationMySqlTests {
    @Test
    void 기존_회차를_보존하며_이벤트_스키마를_적용하고_중복_당첨을_차단한다() throws Exception {
        String url = System.getenv("TEST_EVENT_DB_URL");
        String username = required("TEST_EVENT_DB_USERNAME");
        String password = required("TEST_EVENT_DB_PASSWORD");

        try (Connection connection = DriverManager.getConnection(url, username, password);
                Statement statement = connection.createStatement()) {
            assertThat(count(statement, "information_schema.tables", "table_schema=DATABASE()"))
                    .as("기존 데이터를 지우지 않으므로 빈 격리 DB가 필요합니다").isZero();

            migrate(url, username, password, "148");
            statement.executeUpdate("""
                    INSERT INTO users(login_provider, provider_user_id, nickname, character_gender,
                        created_at, updated_at) VALUES
                    ('SSAFY', 'event-user-1', 'evt001', 'MALE', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3)),
                    ('SSAFY', 'event-user-2', 'evt002', 'FEMALE', UTC_TIMESTAMP(3), UTC_TIMESTAMP(3))
                    """);
            statement.executeUpdate("""
                    INSERT INTO raffle_rounds(week_start_date, sales_starts_at, sales_ends_at, sales_status)
                    VALUES ('2026-11-02', '2026-11-02 00:00:00.000',
                        '2026-11-08 15:00:00.000', 'CLOSED')
                    """);

            Flyway current = migrate(url, username, password, "153");
            assertThat(current.validateWithResult().validationSuccessful).isTrue();
            assertThat(current.info().current().getVersion().getVersion()).isEqualTo("153");
            assertThat(count(statement, "raffle_rounds", "1=1")).isOne();

            statement.executeUpdate("""
                    INSERT INTO event_rounds(event_type, week_start_date, starts_at, ends_at,
                        announces_at, raffle_round_id) VALUES
                    ('RAFFLE', '2026-11-02', '2026-11-02 00:00:00.000',
                        '2026-11-08 15:00:00.000', '2026-11-09 00:00:00.000', 1),
                    ('JUMPMAP', '2026-11-02', '2026-11-02 00:00:00.000',
                        '2026-11-08 15:00:00.000', '2026-11-09 00:00:00.000', NULL)
                    """);
            statement.executeUpdate("""
                    INSERT INTO event_prize_slots(event_round_id, place, slot_number, prize_name) VALUES
                    (2, 1, 1, 'coffee'), (2, 1, 2, 'coffee'),
                    (1, 1, 1, 'chicken'), (2, 4, 1, 'bonus')
                    """);
            assertThat(count(statement, "event_prize_slots", "place=4")).isOne();
            assertThatThrownBy(() -> statement.executeUpdate("""
                    INSERT INTO event_prize_slots(event_round_id, place, slot_number, prize_name)
                    VALUES (2, 0, 1, 'invalid')
                    """)).isInstanceOf(SQLException.class)
                    .satisfies(error -> assertThat(((SQLException) error).getErrorCode()).isEqualTo(3819));
            statement.executeUpdate("""
                    INSERT INTO event_winners(event_round_id, prize_slot_id, user_id,
                        source_record_id, source_value, source_achieved_at, selected_at)
                    VALUES (2, 1, 1, 'jumpmap-run-1', 12000,
                        '2026-11-08 14:00:00.000', '2026-11-08 15:00:00.000')
                    """);
            assertThat(count(statement, "event_winners", "1=1")).isOne();

            assertDuplicate(() -> statement.executeUpdate("""
                    INSERT INTO event_winners(event_round_id, prize_slot_id, user_id, selected_at)
                    VALUES (2, 2, 1, '2026-11-08 15:00:00.000')
                    """));
            assertDuplicate(() -> statement.executeUpdate("""
                    INSERT INTO event_winners(event_round_id, prize_slot_id, user_id, selected_at)
                    VALUES (2, 1, 2, '2026-11-08 15:00:00.000')
                    """));
            assertThatThrownBy(() -> statement.executeUpdate("""
                    INSERT INTO event_winners(event_round_id, prize_slot_id, user_id, selected_at)
                    VALUES (1, 2, 2, '2026-11-08 15:00:00.000')
                    """)).isInstanceOf(SQLException.class)
                    .satisfies(error -> assertThat(((SQLException) error).getErrorCode()).isEqualTo(1452));

            statement.executeUpdate("""
                    INSERT INTO event_winner_contacts(user_id, week_start_date, encrypted_phone,
                        encryption_key_id, phone_last_four, submitted_at, expires_at)
                    VALUES (1, '2026-11-02', UNHEX('DEADBEEF'), 'test-key', '1234',
                        '2026-11-09 01:00:00.000', '2026-12-09 01:00:00.000')
                    """);
            assertDuplicate(() -> statement.executeUpdate("""
                    INSERT INTO event_winner_contacts(user_id, week_start_date, encrypted_phone,
                        encryption_key_id, phone_last_four, submitted_at, expires_at)
                    VALUES (1, '2026-11-02', UNHEX('DEADBEEF'), 'test-key', '1234',
                        '2026-11-09 01:00:00.000', '2026-12-09 01:00:00.000')
                    """));

            statement.executeUpdate("""
                    INSERT INTO event_finalization_attempts(event_round_id, trigger_source,
                        outcome, candidate_count, winner_count, attempted_at, completed_at)
                    VALUES (2, 'AUTO', 'SUCCEEDED', 2, 1,
                        '2026-11-08 15:00:00.000', '2026-11-08 15:00:01.000')
                    """);
            assertThat(count(statement, "event_finalization_attempts", "1=1")).isOne();
            assertThatThrownBy(() -> statement.executeUpdate("""
                    INSERT INTO event_finalization_attempts(event_round_id, trigger_source,
                        outcome, attempted_at, completed_at)
                    VALUES (2, 'AUTO', 'STARTED',
                        '2026-11-08 15:00:00.000', '2026-11-08 15:00:01.000')
                    """)).isInstanceOf(SQLException.class);
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

    private void assertDuplicate(SqlOperation operation) {
        assertThatThrownBy(operation::execute).isInstanceOf(SQLException.class)
                .satisfies(error -> assertThat(((SQLException) error).getErrorCode()).isEqualTo(1062));
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
