package com.ssafy.ontop.game.farkle;

import java.sql.DriverManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
class FarkleMigrationMySqlTests {
    @Test
    void 기존_DB의_2인제약을_V144로_확장하고_체크섬과_재실행을_검증한다() throws Exception {
        String url = System.getenv("TEST_GAME_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:13387/ontop_game_test_story174_farkle4_v144(?:\\?.*)?")) {
            throw new IllegalStateException("주사위 전용 로컬 격리 DB만 사용합니다.");
        }
        String user = System.getenv("TEST_GAME_DB_USERNAME"), password = System.getenv("TEST_GAME_DB_PASSWORD");
        String schema = "ontop_game_test_farkle_upgrade_" + java.util.UUID.randomUUID().toString().replace("-", "");
        try (var connection = DriverManager.getConnection(url, user, password);
                var statement = connection.createStatement()) {
            statement.executeUpdate("CREATE DATABASE " + schema);
        }
        url = url.replace("/ontop_game_test_story174_farkle4_v144", "/" + schema);
        Flyway previous = Flyway.configure().dataSource(url, user, password)
                .locations("classpath:db/migration", "classpath:db/minigame", "classpath:db/shop")
                .target("143").load();
        previous.migrate();
        try (var connection = DriverManager.getConnection(url, user, password);
                var statement = connection.createStatement();
                var rows = statement.executeQuery("SHOW CREATE TABLE game_sessions")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(2).replace("_utf8mb4", "")).contains("'OMOK','DICE','ALKKAGI'");
        }

        Flyway current = Flyway.configure().dataSource(url, user, password)
                .locations("classpath:db/migration", "classpath:db/minigame", "classpath:db/shop").load();
        assertThat(current.migrate().migrationsExecuted).isEqualTo(1);
        assertThat(current.validateWithResult().validationSuccessful).isTrue();
        assertThat(current.migrate().migrationsExecuted).isZero();
        assertThat(current.info().current().getVersion().getVersion()).isEqualTo("144");
        try (var connection = DriverManager.getConnection(url, user, password);
                var statement = connection.createStatement();
                var rows = statement.executeQuery("SHOW CREATE TABLE game_sessions")) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getString(2).replace("_utf8mb4", "")).contains("'OMOK','ALKKAGI'")
                    .contains("'DICE','ONE_CARD','LIAR_BRIDGE','DICE_LEDGER','HALLI_GALLI'");
        }
    }
}
