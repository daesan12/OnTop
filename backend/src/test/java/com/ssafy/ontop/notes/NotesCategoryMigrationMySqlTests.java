package com.ssafy.ontop.notes;

import java.sql.DriverManager;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@Tag("mysql")
class NotesCategoryMigrationMySqlTests {
    @Test void 기존메모본문을보존하며_free주제와_공용변경번호를추가한다() throws Exception {
        String url = System.getenv("TEST_NOTES_MIGRATION_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_notes_migration_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("승인한 새 loopback 검증 DB만 사용합니다.");
        }
        String user = System.getenv("TEST_NOTES_DB_USERNAME"), password = System.getenv("TEST_NOTES_DB_PASSWORD");
        String[] locations = {"classpath:db/migration", "classpath:db/minigame", "classpath:db/notes"};
        try (var connection = DriverManager.getConnection(url, user, password); var sql = connection.createStatement()) {
            try (var rows = sql.executeQuery("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()")) {
                rows.next(); assertThat(rows.getInt(1)).as("기존 DB 초기화 금지").isZero();
            }
            Flyway.configure().dataSource(url, user, password).locations(locations).target("128").load().migrate();
            sql.executeUpdate("INSERT INTO anonymous_notes(body,created_at) VALUES('기존 검증 메모','2026-10-29 00:00:00')");
            int checksum;
            try (var rows = sql.executeQuery("SELECT checksum FROM flyway_schema_history WHERE version='121'")) {
                rows.next(); checksum = rows.getInt(1);
            }
            assertThat(Flyway.configure().dataSource(url, user, password).locations(locations).load().migrate().migrationsExecuted)
                    .isEqualTo(1);
            try (var rows = sql.executeQuery("SELECT body,category FROM anonymous_notes")) {
                rows.next(); assertThat(rows.getString(1)).isEqualTo("기존 검증 메모");
                assertThat(rows.getString(2)).isEqualTo("free"); assertThat(rows.next()).isFalse();
            }
            try (var rows = sql.executeQuery("SELECT revision FROM anonymous_note_board WHERE id=1")) {
                rows.next(); assertThat(rows.getLong(1)).isZero();
            }
            try (var rows = sql.executeQuery("SELECT checksum FROM flyway_schema_history WHERE version='121'")) {
                rows.next(); assertThat(rows.getInt(1)).isEqualTo(checksum);
            }
            assertThatThrownBy(() -> sql.executeUpdate("INSERT INTO anonymous_notes(body,created_at,category) VALUES('거절 검증',NOW(3),'invalid')"))
                    .isInstanceOf(java.sql.SQLException.class);
        }
    }
}
