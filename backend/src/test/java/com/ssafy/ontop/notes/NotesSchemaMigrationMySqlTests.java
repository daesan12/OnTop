package com.ssafy.ontop.notes;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 익명 메모 스키마는 배포 경로(db/migration, db/minigame)의 공통 V133이 만든다.
 * 이전 db/notes V121→V129 최종 스키마와 같은지, V132까지 적용된 DB에 V133만 더해지는지 새 격리 DB로 확인한다.
 */
@Tag("mysql")
class NotesSchemaMigrationMySqlTests {
    private static final String[] DEPLOYED = {"classpath:db/migration", "classpath:db/minigame"};
    private static final String[] LEGACY = {"classpath:db/migration", "classpath:db/minigame", "classpath:db/notes"};
    private static final String NOTE_TABLES = "('anonymous_notes','anonymous_note_requests','anonymous_note_rates','anonymous_note_board')";

    private record Db(String url, String user, String password) {
        Connection connect() throws SQLException { return DriverManager.getConnection(url, user, password); }
        Flyway flyway(String target, String... locations) {
            var configuration = Flyway.configure().dataSource(url, user, password).locations(locations)
                    .baselineOnMigrate(false).outOfOrder(false);
            return (target == null ? configuration : configuration.target(target)).load();
        }
    }

    private static Db emptyDb(String variable) throws SQLException {
        String url = System.getenv(variable);
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_notes_migration_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException(variable + ": 승인한 새 loopback 검증 DB만 사용합니다.");
        }
        var db = new Db(url, System.getenv("TEST_NOTES_DB_USERNAME"), System.getenv("TEST_NOTES_DB_PASSWORD"));
        try (var connection = db.connect(); var sql = connection.createStatement()) {
            assertThat(count(sql, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()"))
                    .as("기존 DB 초기화 금지").isZero();
        }
        return db;
    }

    @Test
    void 빈DB의_V133은_기존_V121_V129_최종스키마와_같고_제약을_지킨다() throws Exception {
        var current = emptyDb("TEST_NOTES_MIGRATION_DB_URL");
        var legacy = emptyDb("TEST_NOTES_LEGACY_DB_URL");
        var flyway = current.flyway(null, DEPLOYED);
        flyway.migrate();
        assertThat(flyway.validateWithResult().validationSuccessful).isTrue();

        // 기존 경로: V121로 만든 메모가 V129 뒤에도 free 주제와 공용 변경번호 0으로 남는다(이전 V129 정책).
        legacy.flyway("128", LEGACY).migrate();
        try (var connection = legacy.connect(); var sql = connection.createStatement()) {
            sql.executeUpdate("INSERT INTO anonymous_notes(body,created_at) VALUES('기존 검증 메모','2026-10-29 00:00:00')");
            legacy.flyway("132", LEGACY).migrate();
            assertThat(rows(sql, "SELECT CONCAT(body,'|',category) FROM anonymous_notes")).containsExactly("기존 검증 메모|free");
            assertThat(history(sql)).containsKeys("121", "129").doesNotContainKey("133");
            try (var other = current.connect(); var actual = other.createStatement()) {
                assertThat(schema(actual)).isEqualTo(schema(sql)).isNotEmpty();
            }
        }

        try (var connection = current.connect(); var sql = connection.createStatement()) {
            assertThat(history(sql)).containsKey("133").doesNotContainKeys("120", "121", "129");
            assertThat(count(sql, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN " + NOTE_TABLES))
                    .isEqualTo(4);
            assertThat(rows(sql, "SELECT CONCAT(id,'|',revision) FROM anonymous_note_board")).containsExactly("1|0");
            sql.executeUpdate("INSERT INTO anonymous_notes(body,created_at) VALUES('기본 주제',NOW(3))");
            assertThat(rows(sql, "SELECT category FROM anonymous_notes")).containsExactly("free");
            for (String category : new String[] {"daily", "cheer", "worry", "recommend"}) {
                sql.executeUpdate("INSERT INTO anonymous_notes(body,created_at,category) VALUES('주제',NOW(3),'" + category + "')");
            }
            assertThatThrownBy(() -> sql.executeUpdate("INSERT INTO anonymous_notes(body,created_at,category) VALUES('거절 검증',NOW(3),'invalid')"))
                    .isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> sql.executeUpdate("INSERT INTO anonymous_notes(body,created_at) VALUES(REPEAT('가',301),NOW(3))"))
                    .isInstanceOf(SQLException.class);
            assertThatThrownBy(() -> sql.executeUpdate("UPDATE anonymous_note_board SET revision=-1 WHERE id=1"))
                    .isInstanceOf(SQLException.class);
        }
    }

    @Test
    void V132까지_적용된_DB에는_기존_이력과_데이터를_보존하며_V133만_추가한다() throws Exception {
        var db = emptyDb("TEST_NOTES_UPGRADE_DB_URL");
        db.flyway("132", DEPLOYED).migrate();
        try (var connection = db.connect(); var sql = connection.createStatement()) {
            assertThat(count(sql, "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN " + NOTE_TABLES))
                    .isZero();
            sql.executeUpdate("INSERT INTO users(login_provider,provider_user_id,nickname,character_gender,created_at,updated_at) "
                    + "VALUES('SSAFY','notes133-a','검증가','MALE',UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))");
            sql.executeUpdate("INSERT INTO feedback_messages(user_id,request_key,channel_id,body,created_at) "
                    + "SELECT id,'notes133-feedback','channel-1','기존 소리함 의견',UTC_TIMESTAMP(3) FROM users");
            var previous = history(sql);
            assertThat(previous).containsKeys("127", "132").doesNotContainKey("133");

            var current = db.flyway(null, DEPLOYED);
            assertThat(current.migrate().migrationsExecuted).isEqualTo(1);
            assertThat(history(sql)).containsAllEntriesOf(previous).containsKey("133").hasSize(previous.size() + 1);
            assertThat(current.validateWithResult().validationSuccessful).isTrue();
            assertThat(current.migrate().migrationsExecuted).isZero();
            assertThat(rows(sql, "SELECT CONCAT(u.provider_user_id,'|',f.body) FROM feedback_messages f JOIN users u ON u.id=f.user_id"))
                    .containsExactly("notes133-a|기존 소리함 의견");
            assertThat(rows(sql, "SELECT CONCAT(id,'|',revision) FROM anonymous_note_board")).containsExactly("1|0");
            assertThat(count(sql, "SELECT COUNT(*) FROM anonymous_notes")).isZero();
        }
    }

    /** 버전별 성공 이력과 checksum. 이미 적용된 이력이 바뀌지 않았는지 비교한다. */
    private static Map<String, String> history(Statement sql) throws SQLException {
        var history = new LinkedHashMap<String, String>();
        try (var rows = sql.executeQuery("SELECT version, CONCAT(success,'|',IFNULL(checksum,'')) FROM flyway_schema_history "
                + "WHERE version IS NOT NULL ORDER BY installed_rank")) {
            while (rows.next()) history.put(rows.getString(1), rows.getString(2));
        }
        return history;
    }

    /** 메모 테이블의 엔진·collation, 컬럼, 인덱스, CHECK 정의. 자동 증가 값처럼 데이터에 따라 바뀌는 항목은 제외한다. */
    private static List<String> schema(Statement sql) throws SQLException {
        var schema = new ArrayList<String>();
        schema.addAll(rows(sql, "SELECT CONCAT_WS('|',table_name,engine,table_collation) FROM information_schema.tables "
                + "WHERE table_schema=DATABASE() AND table_name IN " + NOTE_TABLES + " ORDER BY table_name"));
        schema.addAll(rows(sql, "SELECT CONCAT_WS('|',table_name,ordinal_position,column_name,column_type,is_nullable,"
                + "IFNULL(column_default,'<null>'),IFNULL(character_set_name,''),IFNULL(collation_name,''),column_key,extra) "
                + "FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name IN " + NOTE_TABLES
                + " ORDER BY table_name,ordinal_position"));
        schema.addAll(rows(sql, "SELECT CONCAT_WS('|',table_name,index_name,non_unique,seq_in_index,column_name,IFNULL(collation,'')) "
                + "FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name IN " + NOTE_TABLES
                + " ORDER BY table_name,index_name,seq_in_index"));
        schema.addAll(rows(sql, "SELECT CONCAT_WS('|',t.table_name,c.constraint_name,c.check_clause) "
                + "FROM information_schema.table_constraints t JOIN information_schema.check_constraints c "
                + "ON c.constraint_schema=t.constraint_schema AND c.constraint_name=t.constraint_name "
                + "WHERE t.table_schema=DATABASE() AND t.constraint_type='CHECK' AND t.table_name IN " + NOTE_TABLES
                + " ORDER BY t.table_name,c.constraint_name"));
        return schema;
    }

    private static List<String> rows(Statement sql, String query) throws SQLException {
        var values = new ArrayList<String>();
        try (var rows = sql.executeQuery(query)) {
            while (rows.next()) values.add(rows.getString(1));
        }
        return values;
    }

    private static int count(Statement sql, String query) throws SQLException {
        try (var rows = sql.executeQuery(query)) {
            rows.next();
            return rows.getInt(1);
        }
    }
}
