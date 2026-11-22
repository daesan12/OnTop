package com.ssafy.ontop.world.winter.community;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.Executors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 제공된 빈 전용 MySQL 8.4 DB만 사용한다. 운영 DB·기존 테이블을 초기화하지 않는다. */
@Tag("mysql")
class WinterCommunityMySqlTests {
    @Test
    void V183의_장식과_오십개_점등은_중복요청과_저장소_재생성에도_유지된다(@TempDir Path migrations)
            throws Exception {
        String url = System.getenv("TEST_WINTER_COMMUNITY_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_winter_community_test_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("비어 있는 전용 loopback MySQL 8.4 검증 DB가 필요합니다.");
        }
        var source = new DriverManagerDataSource(url,
                System.getenv().getOrDefault("TEST_WINTER_COMMUNITY_DB_USERNAME", "root"),
                System.getenv().getOrDefault("TEST_WINTER_COMMUNITY_DB_PASSWORD", ""));
        var jdbc = new JdbcTemplate(source);
        assertThat(jdbc.queryForObject("SELECT VERSION()", String.class)).startsWith("8.4.");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()",
                Integer.class)).as("기존 테이블을 가진 DB에서는 실행하지 않는다").isZero();
        Files.copy(Path.of("src/main/resources/db/migration/V183__create_winter_community.sql"),
                migrations.resolve("V183__create_winter_community.sql"));
        var flyway = Flyway.configure().dataSource(source).locations("filesystem:" + migrations)
                .cleanDisabled(true).load();
        flyway.migrate();
        assertThat(flyway.info().current().getVersion().toString()).isEqualTo("183");
        var store = new JdbcWinterCommunityStore(jdbc, new DataSourceTransactionManager(source));
        var at = Instant.parse("2026-11-22T00:00:00Z");
        for (int i = 1; i <= 49; i++) {
            store.postTree(String.format("%064d", i), UUID.randomUUID().toString(), "함께해서 고마워요",
                    true, null, "BAUBLE", at);
        }
        assertThat(store.treeStatus().count()).isEqualTo(49);
        assertThat(store.treeStatus().lit()).isFalse();
        String actor = "f".repeat(64), operation = UUID.randomUUID().toString();
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> store.postTree(actor, operation, "응원합니다", false,
                    "친구", "STOCKING", at));
            var second = executor.submit(() -> store.postTree(actor, operation, "응원합니다", false,
                    "친구", "STOCKING", at));
            assertThat(first.get().message().id()).isEqualTo(second.get().message().id());
        }
        var lit = store.treeStatus();
        assertThat(lit.count()).isEqualTo(50);
        assertThat(lit.lit()).isTrue();
        assertThat(lit.ornaments()).hasSize(50).anySatisfy(item -> assertThat(item.ornament()).isEqualTo("STOCKING"));
        assertThatThrownBy(() -> store.postTree(actor, operation, "응원합니다", false, "친구", "GIFT", at))
                .isInstanceOf(WinterCommunityException.class);
        assertThatThrownBy(() -> store.postTree("e".repeat(64), UUID.randomUUID().toString(), "장식 오류",
                true, null, "UNKNOWN", at)).isInstanceOf(DataAccessException.class);
        assertThat(store.treeStatus()).isEqualTo(lit);
        var man = new WinterCommunity.Snowman(UUID.randomUUID().toString(), "channel-a", "우리 눈사람",
                16, 0, 43, 0, .8, .6, .4, "TOP_HAT", "BLUE", "WINK", at.toString());
        store.saveSnowman(actor, UUID.randomUUID().toString(), "a".repeat(64), man);
        var reopened = new JdbcWinterCommunityStore(jdbc, new DataSourceTransactionManager(source));
        assertThat(reopened.treeStatus()).isEqualTo(lit);
        assertThat(reopened.actorSalt()).containsExactly(store.actorSalt());
        assertThat(reopened.snowmen("channel-a")).containsExactly(man);
        assertThat(reopened.snowmen("channel-b")).isEmpty();
        flyway.validate();
    }
}
