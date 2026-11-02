package com.ssafy.ontop.raffle;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("mysql")
@EnabledIfEnvironmentVariable(
        named = "TEST_RAFFLE_DB_URL",
        matches = "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_raffle_test_[A-Za-z0-9_]+(?:\\?.*)?"
)
class RaffleMigrationMySqlTests {
    @Test
    void 빈_MySQL84_DB에_V140을_적용하고_응모권_제약을_검증한다() throws Exception {
        String url = System.getenv("TEST_RAFFLE_DB_URL");
        String username = required("TEST_RAFFLE_DB_USERNAME");
        String password = required("TEST_RAFFLE_DB_PASSWORD");

        try (Connection connection = DriverManager.getConnection(url, username, password);
                var statement = connection.createStatement()) {
            try (var tables = statement.executeQuery(
                    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")) {
                tables.next();
                assertThat(tables.getInt(1)).as("기존 DB를 초기화하지 않으므로 빈 격리 DB가 필요합니다").isZero();
            }

            var flyway = Flyway.configure()
                    .dataSource(url, username, password)
                    .locations("classpath:db/migration")
                    .baselineOnMigrate(false)
                    .outOfOrder(false)
                    .load();
            assertThat(flyway.migrate().migrationsExecuted).isPositive();
            assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("140");
            assertThat(flyway.validateWithResult().validationSuccessful).isTrue();

            seed(statement);
            assertThat(count(statement, "raffle_tickets")).isOne();
            assertThat(indexColumns(statement, "ix_raffle_tickets_round_user_purchased"))
                    .isEqualTo("round_id,user_id,purchased_at,id");

            assertThatThrownBy(() -> statement.executeUpdate(ticket(3140, 2, "request-2")))
                    .isInstanceOf(SQLException.class)
                    .satisfies(error -> assertThat(((SQLException) error).getErrorCode()).isEqualTo(1062));
            assertThatThrownBy(() -> statement.executeUpdate(ticket(10001, 3, "request-3")))
                    .isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> statement.executeUpdate(ticket(3141, 4, "request-1")))
                    .isInstanceOf(SQLException.class)
                    .satisfies(error -> assertThat(((SQLException) error).getErrorCode()).isEqualTo(1062));
        }
    }

    private void seed(java.sql.Statement statement) throws SQLException {
        statement.executeUpdate("INSERT INTO users(login_provider,provider_user_id,nickname,character_gender,"
                + "created_at,updated_at) VALUES('SSAFY','raffle-test-user','test314','MALE',"
                + "UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))");
        statement.executeUpdate("INSERT INTO wallets(user_id,balance,reserved_balance) VALUES(1,1000,100)");
        for (int id = 1; id <= 4; id++) {
            statement.executeUpdate("INSERT INTO wallet_transactions(wallet_id,transaction_type,balance_delta,"
                    + "reserved_delta,idempotency_key) VALUES(1,'RAFFLE_PURCHASE',-100,0,'raffle:test:"
                    + id + "')");
        }
        statement.executeUpdate("INSERT INTO raffle_rounds(week_start_date,sales_starts_at,sales_ends_at,"
                + "sales_status) VALUES('2026-11-02','2026-11-02 00:00:00.000',"
                + "'2026-11-08 15:00:00.000','OPEN')");
        statement.executeUpdate(ticket(3140, 1, "request-1"));
    }

    private String ticket(int number, int transactionId, String requestKey) {
        return "INSERT INTO raffle_tickets(round_id,user_id,ticket_number,purchase_price,balance_after,"
                + "wallet_transaction_id,idempotency_key) VALUES(1,1," + number + ",100,900,"
                + transactionId + ",'" + requestKey + "')";
    }

    private long count(java.sql.Statement statement, String table) throws SQLException {
        try (var rows = statement.executeQuery("SELECT COUNT(*) FROM " + table)) {
            rows.next();
            return rows.getLong(1);
        }
    }

    private String indexColumns(java.sql.Statement statement, String index) throws SQLException {
        try (var rows = statement.executeQuery("SELECT GROUP_CONCAT(column_name ORDER BY seq_in_index) "
                + "FROM information_schema.statistics WHERE table_schema=DATABASE() "
                + "AND table_name='raffle_tickets' AND index_name='" + index + "'")) {
            rows.next();
            return rows.getString(1);
        }
    }

    private String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("래플 마이그레이션 테스트 환경변수가 없습니다: " + name);
        }
        return value;
    }
}
