package com.ssafy.ontop.game.quoridor;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 승인받은 폐기용 MySQL 컨테이너 전용. 서비스 DB 및 기존 스키마를 초기화하지 않는다. */
@Tag("mysql")
class QuoridorMigrationMySqlTests {
    // 빈 DB는 V165의 items 참조를 위해 shop 원본도 필요하다. 배포 locations를 변경하는 설정이 아니다.
    private static final String[] LOCATIONS = {
            "classpath:db/migration", "classpath:db/minigame", "classpath:db/shop"
    };
    private final String user = System.getenv("TEST_GAME_DB_USERNAME");
    private final String password = System.getenv("TEST_GAME_DB_PASSWORD");
    @TempDir Path temporary;

    @Test
    void 빈_DB에_전체_스키마를_적용하고_재실행해도_변경하지_않는다() throws Exception {
        String url = isolatedUrl();
        try (var connection = connect(url); var statement = connection.createStatement()) {
            try (var rows = statement.executeQuery(
                    "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")) {
                rows.next();
                assertThat(rows.getInt(1)).as("정산 검증용 DB는 반드시 새 빈 DB여야 합니다").isZero();
            }
            var flyway = Flyway.configure().dataSource(url, user, password)
                    .locations(LOCATIONS)
                    .baselineOnMigrate(false).outOfOrder(false).load();

            assertThat(flyway.migrate().migrationsExecuted).isPositive();

            assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
            assertThat(flyway.migrate().migrationsExecuted).isZero();
            verifyPlayers(connection);
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "NO_BACKSLASH_ESCAPES"})
    void V185_데이터와_기존_제약을_보존하며_V186을_적용한다(String mode) throws Exception {
        String url = newSchema();
        flyway(url, "185").migrate();
        try (var connection = connect(url); var statement = connection.createStatement()) {
            insert(connection, "OMOK", 2);
            var previousHistory = history(connection);
            var previousChecks = checks(connection);

            // Flyway가 여는 연결에도 SQL mode를 적용한다.
            var current = Flyway.configure().dataSource(url, user, password).locations(LOCATIONS).target("186")
                    .initSql("SET SESSION sql_mode='" + mode + "'").load();
            assertThat(current.migrate().migrationsExecuted).isEqualTo(1);

            assertThat(current.validateWithResult().validationSuccessful).isTrue();
            assertThat(history(connection)).containsAllEntriesOf(previousHistory).containsKey("186");
            previousChecks.remove("ck_game_sessions_players");
            assertThat(checks(connection)).containsAllEntriesOf(previousChecks);
            try (var rows = statement.executeQuery("SELECT COUNT(*) FROM game_sessions")) {
                rows.next();
                assertThat(rows.getInt(1)).isEqualTo(1);
            }
            verifyPlayers(connection);
        }
    }

    @Test
    void 기존_V186의_1064_실패를_재현하고_정식_repair와_migrate로_복구한다() throws Exception {
        String url = newSchema();
        flyway(url, "185").migrate();
        var resolver = new PathMatchingResourcePatternResolver();
        for (String location : LOCATIONS) {
            for (var resource : resolver.getResources(location + "/*.sql")) {
                try (var input = resource.getInputStream()) {
                    Files.copy(input, temporary.resolve(resource.getFilename()));
                }
            }
        }
        try (var input = getClass().getResourceAsStream("/quoridor/failed-v186.sql")) {
            Files.copy(input, temporary.resolve("V186__allow_quoridor_game_sessions.sql"),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        }
        var broken = Flyway.configure().dataSource(url, user, password)
                .locations("filesystem:" + temporary.toAbsolutePath()).target("186").load();

        assertThatThrownBy(broken::migrate).hasStackTraceContaining("1064");

        try (var connection = connect(url)) {
            var previousHistory = history(connection);
            assertThat(failedCount(connection)).isEqualTo(1);
            // PREPARE 단계에서 실패했으므로 V185의 기존 제약이 남아 있어야 한다.
            insert(connection, "OMOK", 2);
            assertThatThrownBy(() -> insert(connection, "QUORIDOR", 2)).isInstanceOf(SQLException.class);
            var repaired = flyway(url, "186");
            repaired.repair();

            assertThat(failedCount(connection)).isZero();
            assertThat(history(connection)).isEqualTo(previousHistory);
            assertThat(repaired.migrate().migrationsExecuted).isEqualTo(1);
            assertThat(repaired.validateWithResult().validationSuccessful).isTrue();
            assertThat(history(connection)).containsAllEntriesOf(previousHistory).containsKey("186");
            assertThat(repaired.migrate().migrationsExecuted).isZero();
            verifyPlayers(connection);
        }
    }

    private String isolatedUrl() {
        String url = System.getenv("TEST_GAME_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_game_test_quoridor_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("승인된 폐기용 loopback MySQL 검증 DB만 사용합니다.");
        }
        return url;
    }

    private String newSchema() throws Exception {
        String url = isolatedUrl();
        String schema = "ontop_game_test_quoridor_v186_" + UUID.randomUUID().toString().replace("-", "");
        try (var connection = connect(url); var statement = connection.createStatement()) {
            statement.execute("CREATE DATABASE " + schema);
        }
        return url.replaceFirst("/ontop_game_test_quoridor_[A-Za-z0-9_]+", "/" + schema);
    }

    private Connection connect(String url) throws SQLException {
        return DriverManager.getConnection(url, user, password);
    }

    private Flyway flyway(String url, String target) {
        return Flyway.configure().dataSource(url, user, password).locations(LOCATIONS).target(target)
                .baselineOnMigrate(false).outOfOrder(false).load();
    }

    private void verifyPlayers(Connection connection) throws SQLException {
        for (String game : new String[]{"OMOK", "ALKKAGI", "DICE", "ONE_CARD", "LIAR_BRIDGE",
                "DICE_LEDGER", "HALLI_GALLI", "DAVINCI_CODE", "RUMMIKUB", "STONE_RUMBLE", "QUORIDOR", "UNKNOWN"}) {
            for (int count = 0; count <= 9; count++) {
                boolean allowed = switch (game) {
                    case "OMOK", "ALKKAGI" -> count == 2;
                    case "QUORIDOR" -> count == 2 || count == 4;
                    case "STONE_RUMBLE" -> count >= 2 && count <= 8;
                    case "UNKNOWN" -> false;
                    default -> count >= 2 && count <= 4;
                };
                int players = count;
                if (allowed) {
                    assertThat(insert(connection, game, count)).isEqualTo(1);
                } else {
                    assertThatThrownBy(() -> insert(connection, game, players))
                            .as("%s %s인 거절", game, count).isInstanceOf(SQLException.class)
                            .hasMessageContaining("ck_game_sessions_players");
                }
            }
        }
    }

    private int insert(Connection connection, String game, int count) throws SQLException {
        try (var statement = connection.prepareStatement("""
                INSERT INTO game_sessions(start_attempt_id,request_fingerprint,table_id,table_version,game_code,
                    target_score,participant_count,bet_amount_per_player,total_pot,status,owner_instance_id,
                    owner_boot_id,created_at)
                VALUES(UUID_TO_BIN(UUID()),UNHEX(REPEAT('00',32)),UUID(),1,?,?,?,0,0,'PREPARING',
                    'migration-test',UUID_TO_BIN(UUID()),UTC_TIMESTAMP(3))
                """)) {
            statement.setString(1, game);
            statement.setObject(2, game.equals("DICE") ? 2000 : null);
            statement.setInt(3, count);
            return statement.executeUpdate();
        }
    }

    private Map<String, String> history(Connection connection) throws SQLException {
        return queryMap(connection, "SELECT version,checksum FROM flyway_schema_history WHERE success=1");
    }

    private Map<String, String> checks(Connection connection) throws SQLException {
        return queryMap(connection, "SELECT CONSTRAINT_NAME,CHECK_CLAUSE FROM information_schema.CHECK_CONSTRAINTS "
                + "WHERE CONSTRAINT_SCHEMA=DATABASE()");
    }

    private Map<String, String> queryMap(Connection connection, String sql) throws SQLException {
        Map<String, String> result = new LinkedHashMap<>();
        try (var statement = connection.createStatement(); var rows = statement.executeQuery(sql)) {
            while (rows.next()) {
                result.put(rows.getString(1), rows.getString(2));
            }
        }
        return result;
    }

    private int failedCount(Connection connection) throws SQLException {
        try (var statement = connection.createStatement(); var rows = statement.executeQuery(
                "SELECT COUNT(*) FROM flyway_schema_history WHERE version='186' AND success=0")) {
            rows.next();
            return rows.getInt(1);
        }
    }
}
