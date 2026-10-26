package com.ssafy.ontop.game.result.persistence;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.Statement;
import java.util.LinkedHashMap;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

/** 승인한 빈 격리 DB에서 한 번 실행한다. 기존 DB/이력을 초기화하거나 repair하지 않는다. */
@Tag("mysql")
class GameBetMigrationMySqlTests {
    @Test void V112의_1코인_예약과_checksum을_보존하며_최신_마이그레이션으로_업그레이드한다() throws Exception {
        String url = System.getenv("TEST_GAME_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_game_test_story173_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("승인한 빈 격리 DB만 사용합니다.");
        }
        String user = System.getenv("TEST_GAME_DB_USERNAME"), password = System.getenv("TEST_GAME_DB_PASSWORD");
        String[] locations = {"classpath:db/migration", "classpath:db/shop", "classpath:db/minigame"};
        try (Connection connection = DriverManager.getConnection(url, user, password); var statement = connection.createStatement()) {
            try (var rs = statement.executeQuery("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")) {
                rs.next(); assertThat(rs.getInt(1)).as("기존 DB는 초기화하지 않으므로 새 빈 DB가 필요합니다").isZero();
            }
            Flyway.configure().dataSource(url, user, password).locations(locations).target("112")
                    .baselineOnMigrate(false).outOfOrder(false).load().migrate();
            Map<String, Integer> previous = history(statement);
            statement.executeUpdate("INSERT INTO users(login_provider,provider_user_id,nickname,character_gender,created_at,updated_at) "
                    + "VALUES('SSAFY','migration173-a','검증가','MALE',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3)),"
                    + "('SSAFY','migration173-b','검증나','FEMALE',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))");
            statement.executeUpdate("INSERT INTO wallets(user_id,balance,reserved_balance) SELECT id,100,1 FROM users");
            statement.executeUpdate("INSERT INTO game_sessions(start_attempt_id,request_fingerprint,table_id,table_version,game_code,"
                    + "participant_count,bet_amount_per_player,total_pot,status,settlement_status,owner_instance_id,owner_boot_id,created_at,reserved_at) "
                    + "VALUES(UUID_TO_BIN(UUID()),UNHEX(REPEAT('00',32)),'migration-fixture',1,'OMOK',2,1,2,'RESERVED','PENDING',"
                    + "'migration',UUID_TO_BIN(UUID()),UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))");
            statement.executeUpdate("INSERT INTO game_participants(game_session_id,user_id,seat_number,participant_order,participant_status,reserved_amount) "
                    + "SELECT g.id,u.id,ROW_NUMBER() OVER(ORDER BY u.id),ROW_NUMBER() OVER(ORDER BY u.id)-1,'ACTIVE',1 FROM game_sessions g CROSS JOIN users u");
            statement.executeUpdate("INSERT INTO wallet_transactions(wallet_id,game_session_id,transaction_type,balance_delta,reserved_delta,idempotency_key) "
                    + "SELECT w.id,g.id,'GAME_RESERVE',0,1,CONCAT('game:',g.id,':reserve:',w.user_id) FROM wallets w CROSS JOIN game_sessions g");
            var current = Flyway.configure().dataSource(url, user, password).locations(locations)
                    .baselineOnMigrate(false).outOfOrder(false).load();
            assertThat(current.migrate().migrationsExecuted).isEqualTo(3);
            assertThat(history(statement)).containsAllEntriesOf(previous).containsKeys("122", "123", "124");
            assertThat(current.validateWithResult().validationSuccessful).isTrue();
            assertThat(current.migrate().migrationsExecuted).isZero();
            try (var rs = statement.executeQuery("SELECT COUNT(*) FROM wallets WHERE balance=100 AND reserved_balance=1")) {
                rs.next(); assertThat(rs.getInt(1)).isEqualTo(2);
            }
            try (var rs = statement.executeQuery("SELECT COUNT(*) FROM wallet_transactions WHERE transaction_type='GAME_RESERVE' AND reserved_delta=1")) {
                rs.next(); assertThat(rs.getInt(1)).isEqualTo(2);
            }
            assertThatThrownBy(() -> statement.executeUpdate("UPDATE game_sessions SET bet_amount_per_player=0,total_pot=0"))
                    .isInstanceOf(java.sql.SQLException.class);
            assertThatThrownBy(() -> statement.executeUpdate("UPDATE game_participants SET reserved_amount=0"))
                    .isInstanceOf(java.sql.SQLException.class);
        }
    }

    private Map<String, Integer> history(Statement statement) throws Exception {
        Map<String, Integer> result = new LinkedHashMap<>();
        try (var rows = statement.executeQuery("SELECT version,checksum FROM flyway_schema_history WHERE success=1 ORDER BY installed_rank")) {
            while (rows.next()) { result.put(rows.getString(1), rows.getInt(2)); }
        }
        return result;
    }
}
