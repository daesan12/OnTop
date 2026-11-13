package com.ssafy.ontop.ranking.repository;

import com.ssafy.ontop.game.speedmole.SpeedMoleRules;
import com.ssafy.ontop.ranking.repository.ParkSpeedMoleRankingRepository.SpeedMoleRankingStanding;
import java.time.Instant;
import java.util.List;
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

import static org.assertj.core.api.Assertions.assertThat;

@Tag("mysql")
@ActiveProfiles({"local", "db"})
// V165가 db/shop의 items를 참조한다.
@DataJpaTest(properties = "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ParkSpeedMoleRankingRepository.class)
class ParkSpeedMoleRankingRepositoryTests {
    private static final Instant STARTED_AT = Instant.parse("2026-11-02T00:00:00Z");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private ParkSpeedMoleRankingRepository rankings;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_PARK_SPEED_MOLE_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_ranking_test_speed_mole_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("스피드 두더지 랭킹판 집계는 새 loopback 전용 MySQL DB에서만 검증합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_PARK_SPEED_MOLE_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_PARK_SPEED_MOLE_DB_PASSWORD"));
    }

    @Test
    void 점수_실수_완료시각순으로_상위목록을_결정하고_동점은_같은_순위다() {
        long earliest = member("먼저완료");
        long later = member("나중완료");
        long moreMisses = member("실수많음");
        round(earliest, 90, 3, STARTED_AT.plusSeconds(10), SpeedMoleRules.VERSION);
        round(later, 90, 3, STARTED_AT.plusSeconds(20), SpeedMoleRules.VERSION);
        round(moreMisses, 90, 4, STARTED_AT.plusSeconds(1), SpeedMoleRules.VERSION);

        List<SpeedMoleRankingStanding> standings = rankings.findTopTen(STARTED_AT);

        assertThat(standings).extracting(SpeedMoleRankingStanding::rank).containsExactly(1L, 1L, 3L);
        assertThat(standings).extracting(SpeedMoleRankingStanding::userId)
                .containsExactly(earliest, later, moreMisses);
        assertThat(standings).first().satisfies(result -> {
            assertThat(result.score()).isEqualTo(90);
            assertThat(result.misses()).isEqualTo(3);
            assertThat(result.completedAt()).isEqualTo(STARTED_AT.plusSeconds(10));
        });
    }

    @Test
    void 회원별_최고만_남기고_시작전_다른규칙_탈퇴기록을_제외한다() {
        long included = member("포함");
        round(included, 40, 1, STARTED_AT.plusSeconds(2), SpeedMoleRules.VERSION);
        round(included, 80, 2, STARTED_AT.plusSeconds(3), SpeedMoleRules.VERSION);
        round(member("시작전"), 500, 0, STARTED_AT.minusMillis(1), SpeedMoleRules.VERSION);
        round(member("다른규칙"), 500, 0, STARTED_AT.plusSeconds(1), SpeedMoleRules.VERSION + 1);
        long deleted = member("탈퇴");
        round(deleted, 500, 0, STARTED_AT.plusSeconds(1), SpeedMoleRules.VERSION);
        jdbc.update("UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?", deleted);

        assertThat(rankings.findTopTen(STARTED_AT)).singleElement().satisfies(result -> {
            assertThat(result.userId()).isEqualTo(included);
            assertThat(result.score()).isEqualTo(80);
            assertThat(result.misses()).isEqualTo(2);
        });
    }

    @Test
    void 열한명의_기록이_있어도_상위_열명만_반환한다() {
        for (int index = 0; index < 11; index++) {
            round(member("상위" + index), 100 - index, 0, STARTED_AT.plusSeconds(index + 1L), SpeedMoleRules.VERSION);
        }

        assertThat(rankings.findTopTen(STARTED_AT)).hasSize(10).extracting(SpeedMoleRankingStanding::score)
                .containsExactly(100L, 99L, 98L, 97L, 96L, 95L, 94L, 93L, 92L, 91L);
    }

    private long member(String nickname) {
        String providerUserId = "park-speed-mole-" + UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users (login_provider, provider_user_id, nickname, character_gender,
                    created_at, updated_at)
                VALUES ('SSAFY', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
                """, providerUserId, nickname);
        return jdbc.queryForObject("SELECT id FROM users WHERE provider_user_id = ?", Long.class, providerUserId);
    }

    private void round(long userId, int score, int misses, Instant completedAt, int rulesVersion) {
        jdbc.update("""
                INSERT INTO speed_mole_rounds (user_id, request_key, seed, rules_version, status, started_at,
                    completed_at, score, hits, misses)
                VALUES (?, ?, 1, ?, 'SETTLED', FROM_UNIXTIME(? / 1000), FROM_UNIXTIME(? / 1000), ?, ?, ?)
                """, userId, UUID.randomUUID().toString(), rulesVersion, completedAt.minusSeconds(65).toEpochMilli(),
                completedAt.toEpochMilli(), score, score, misses);
    }
}
