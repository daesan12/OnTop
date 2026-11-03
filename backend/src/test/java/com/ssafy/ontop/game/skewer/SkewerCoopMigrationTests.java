package com.ssafy.ontop.game.skewer;

import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
class SkewerCoopMigrationTests {
    @Test
    void 기존_랭킹과_선행_마이그레이션_회원_지갑을_보존하며_V145로_올린다() throws Exception {
        String url = System.getenv("TEST_SKEWER_COOP_MIGRATION_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_skewer_coop_upgrade_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("순차 적용은 loopback의 새 전용 upgrade DB에서만 검증합니다.");
        }
        String user = System.getenv("TEST_SKEWER_COOP_DB_USERNAME");
        String password = System.getenv("TEST_SKEWER_COOP_DB_PASSWORD");
        List<String> locations = new ArrayList<>(List.of("classpath:db/migration", "classpath:db/minigame"));
        // 아직 통합하지 않은 선행 migration은 제공된 검증용 복사본만 추가할 수 있다.
        String prerequisitePath = System.getenv("TEST_SKEWER_COOP_PREREQUISITE_MIGRATIONS");
        if (prerequisitePath != null && !prerequisitePath.isBlank()) {
            locations.add("filesystem:" + prerequisitePath);
        }
        var available = Flyway.configure().dataSource(url, user, password)
                .locations(locations.toArray(String[]::new)).load();
        MigrationVersion skewerVersion = MigrationVersion.fromVersion("145");
        MigrationVersion previousVersion = Arrays.stream(available.info().all())
                .map(migration -> migration.getVersion())
                .filter(version -> version != null && version.compareTo(skewerVersion) < 0)
                .max(MigrationVersion::compareTo)
                .orElseThrow(() -> new IllegalStateException("꼬치왕보다 앞선 migration이 필요합니다."));
        var before = Flyway.configure().dataSource(url, user, password)
                .locations(locations.toArray(String[]::new)).target(previousVersion).load();
        // 기존 DB를 내려서 재검증하거나 clean/repair하지 않는다.
        assertThat(before.info().applied()).isEmpty();
        before.migrate();
        assertThat(before.info().current().getVersion()).isEqualTo(previousVersion);
        try (var connection = DriverManager.getConnection(url, user, password);
                var statement = connection.createStatement()) {
            statement.executeUpdate("""
                    INSERT INTO users(login_provider,provider_user_id,nickname,character_gender,created_at,updated_at)
                    VALUES ('SSAFY','skewer-migration-fixture','이력보존','MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))
                    """);
            statement.executeUpdate("""
                    INSERT INTO wallets(user_id,balance,reserved_balance)
                    SELECT id,137,0 FROM users WHERE provider_user_id='skewer-migration-fixture'
                    """);
        }
        var after = Flyway.configure().dataSource(url, user, password)
                .locations(locations.toArray(String[]::new)).target(skewerVersion).load();
        assertThat(after.migrate().migrationsExecuted).isEqualTo(1);
        assertThat(after.info().current().getVersion().getVersion()).isEqualTo("145");
        after.validate();
        assertThat(after.migrate().migrationsExecuted).isZero();
        try (var connection = DriverManager.getConnection(url, user, password);
                var statement = connection.createStatement();
                var rows = statement.executeQuery("""
                        SELECT w.balance FROM wallets w JOIN users u ON u.id=w.user_id
                        WHERE u.provider_user_id='skewer-migration-fixture'
                        """)) {
            assertThat(rows.next()).isTrue();
            assertThat(rows.getLong(1)).isEqualTo(137);
        }
    }
}
