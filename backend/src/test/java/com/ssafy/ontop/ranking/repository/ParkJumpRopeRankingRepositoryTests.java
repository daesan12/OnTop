package com.ssafy.ontop.ranking.repository;

import com.ssafy.ontop.game.jumprope.JumpRopeRules;
import com.ssafy.ontop.ranking.repository.ParkJumpRopeRankingRepository.JumpRopeRankingStanding;
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
@Import(ParkJumpRopeRankingRepository.class)
class ParkJumpRopeRankingRepositoryTests {
    private static final Instant STARTED_AT = Instant.parse("2026-11-02T00:00:00Z");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private ParkJumpRopeRankingRepository rankings;

    // 스피드 두더지 랭킹판 검증과 같은 전용 DB를 쓴다. 테스트마다 롤백하고 서로 다른 테이블만 읽는다.
    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_PARK_SPEED_MOLE_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_ranking_test_speed_mole_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("줄넘기 랭킹판 집계는 새 loopback 전용 MySQL DB에서만 검증합니다.");
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
        round(earliest, 900, 1, STARTED_AT.plusSeconds(100), JumpRopeRules.VERSION);
        round(later, 900, 1, STARTED_AT.plusSeconds(200), JumpRopeRules.VERSION);
        round(moreMisses, 900, 2, STARTED_AT.plusSeconds(90), JumpRopeRules.VERSION);

        List<JumpRopeRankingStanding> standings = rankings.findTopTen(STARTED_AT);

        assertThat(standings).extracting(JumpRopeRankingStanding::rank).containsExactly(1L, 1L, 3L);
        assertThat(standings).extracting(JumpRopeRankingStanding::userId)
                .containsExactly(earliest, later, moreMisses);
        assertThat(standings).first().satisfies(result -> {
            assertThat(result.score()).isEqualTo(900);
            assertThat(result.misses()).isEqualTo(1);
            assertThat(result.completedAt()).isEqualTo(STARTED_AT.plusSeconds(100));
        });
    }

    @Test
    void 회원별_최고만_남기고_시작전_다른규칙_탈퇴기록을_제외한다() {
        long included = member("포함");
        round(included, 400, 0, STARTED_AT.plusSeconds(100), JumpRopeRules.VERSION);
        round(included, 800, 3, STARTED_AT.plusSeconds(200), JumpRopeRules.VERSION);
        round(member("시작전"), 5_000, 0, STARTED_AT.minusMillis(1), JumpRopeRules.VERSION);
        round(member("다른규칙"), 5_000, 0, STARTED_AT.plusSeconds(100), JumpRopeRules.VERSION + 1);
        long deleted = member("탈퇴");
        round(deleted, 5_000, 0, STARTED_AT.plusSeconds(100), JumpRopeRules.VERSION);
        jdbc.update("UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?", deleted);

        assertThat(rankings.findTopTen(STARTED_AT)).singleElement().satisfies(result -> {
            assertThat(result.userId()).isEqualTo(included);
            assertThat(result.score()).isEqualTo(800);
            assertThat(result.misses()).isEqualTo(3);
        });
    }

    @Test
    void 열한명의_기록이_있어도_상위_열명만_반환한다() {
        for (int index = 0; index < 11; index++) {
            round(member("상위" + index), 1_000 - index, 0, STARTED_AT.plusSeconds(100 + index), JumpRopeRules.VERSION);
        }

        assertThat(rankings.findTopTen(STARTED_AT)).hasSize(10).extracting(JumpRopeRankingStanding::score)
                .containsExactly(1_000L, 999L, 998L, 997L, 996L, 995L, 994L, 993L, 992L, 991L);
    }

    private long member(String nickname) {
        String providerUserId = "park-jump-rope-" + UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users (login_provider, provider_user_id, nickname, character_gender,
                    created_at, updated_at)
                VALUES ('SSAFY', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
                """, providerUserId, nickname);
        return jdbc.queryForObject("SELECT id FROM users WHERE provider_user_id = ?", Long.class, providerUserId);
    }

    /** 실수 3회는 조기 종료(missLimit), 그보다 적으면 60초 완주(time)여야 테이블 제약을 통과한다. */
    private void round(long userId, int score, int misses, Instant completedAt, int rulesVersion) {
        jdbc.update("""
                INSERT INTO jump_rope_rounds (user_id, request_key, seed, rules_version, status, started_at,
                    expires_at, completed_at, score, perfect_count, good_count, miss_count, end_reason, input_hash)
                VALUES (?, ?, 1, ?, 'SETTLED', FROM_UNIXTIME(? / 1000), FROM_UNIXTIME(? / 1000),
                    FROM_UNIXTIME(? / 1000), ?, 0, 0, ?, ?, ?)
                """, userId, UUID.randomUUID().toString(), rulesVersion, completedAt.minusSeconds(65).toEpochMilli(),
                completedAt.plusSeconds(60).toEpochMilli(), completedAt.toEpochMilli(), score, misses,
                misses == 3 ? "missLimit" : "time", "0".repeat(64));
    }
}
