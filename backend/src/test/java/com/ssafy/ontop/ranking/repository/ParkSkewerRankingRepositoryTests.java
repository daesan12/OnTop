package com.ssafy.ontop.ranking.repository;

import com.ssafy.ontop.game.skewer.coop.repository.JdbcSkewerCoopResultStore;
import jakarta.persistence.EntityManager;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.jdbc.AutoConfigureTestDatabase;
import org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
@DataJpaTest(properties = "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ParkSkewerRankingRepository.class)
class ParkSkewerRankingRepositoryTests {
    private static final Instant START = Instant.parse("2026-11-16T00:00:00Z");
    @Autowired JdbcTemplate jdbc;
    @Autowired EntityManager entities;
    @Autowired PlatformTransactionManager manager;
    @Autowired ParkSkewerRankingRepository rankings;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_PARK_SPEED_MOLE_DB_URL");
        if (url == null || !url.matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_ranking_test_speed_mole_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("통합 팀 랭킹은 loopback 전용 테스트 DB에서만 검증합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_PARK_SPEED_MOLE_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_PARK_SPEED_MOLE_DB_PASSWORD"));
    }

    @Test
    void PC와_VR을_팀별로_통합하고_선택된_최고기록의_방식을_공원과_게임에서_동일하게_반환한다() {
        long a = member("요리사"), b = member("서빙"), c = member("다른팀");
        result(a, b, 400, "PC", START.plusSeconds(1));
        String vr = result(b, a, 700, "VR", START.plusSeconds(2));
        result(a, b, 700, "PC", START.plusSeconds(3));
        result(a, c, 700, "PC", START.plusSeconds(4));
        var board = rankings.findTopTen(START);
        assertThat(board).hasSize(2).extracting(ParkSkewerRankingRepository.Standing::rank).containsExactly(1L, 1L);
        assertThat(board.getFirst().gameId()).isEqualTo(vr);
        assertThat(board.getFirst().playMode()).isEqualTo("VR");
        var store = new JdbcSkewerCoopResultStore(jdbc, entities, manager);
        var unified = store.ranking(a, START.plusSeconds(10), "ALL");
        assertThat(unified.playMode()).isEqualTo("ALL");
        assertThat(unified.items()).hasSize(2);
        assertThat(unified.myBest().gameId()).isEqualTo(vr);
        assertThat(unified.myBest().playMode()).isEqualTo("VR");
        assertThat(store.ranking(a, START, "PC").items()).allMatch(r -> r.playMode().equals("PC"));
        assertThat(store.ranking(a, START, "VR").items()).singleElement().satisfies(r -> assertThat(r.gameId()).isEqualTo(vr));
        jdbc.update("UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?", b);
        assertThat(rankings.findTopTen(START)).singleElement().satisfies(r -> assertThat(r.serverUserId()).isEqualTo(c));
    }

    private long member(String nickname) {
        String provider = UUID.randomUUID().toString();
        jdbc.update("INSERT INTO users (login_provider,provider_user_id,nickname,character_gender,created_at,updated_at) VALUES ('SSAFY',?,?,'MALE',CURRENT_TIMESTAMP(3),CURRENT_TIMESTAMP(3))", provider, nickname);
        return jdbc.queryForObject("SELECT id FROM users WHERE provider_user_id=?", Long.class, provider);
    }

    private String result(long chef, long server, int score, String mode, Instant ended) {
        String id = "skewer-coop-" + UUID.randomUUID();
        jdbc.update("""
            INSERT INTO skewer_coop_results (game_id,result_hash,rules_version,table_id,team_low_id,team_high_id,
              chef_user_id,server_user_id,team_score,served,elapsed_ms,duration_ms,end_reason,ranking_eligible,
              ranking_reason,ended_at,play_mode)
            VALUES (?,?,'coop-v1','qa',?,?,?,?,?,1,240000,240000,'SKEWER_TIME_UP',TRUE,'ELIGIBLE',?,?)
            """, id, "0".repeat(64), Math.min(chef,server), Math.max(chef,server), chef, server, score, Timestamp.from(ended), mode);
        return id;
    }
}
