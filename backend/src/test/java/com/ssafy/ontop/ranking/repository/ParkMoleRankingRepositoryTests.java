package com.ssafy.ontop.ranking.repository;

import com.ssafy.ontop.game.mole.domain.MoleRules;
import com.ssafy.ontop.ranking.repository.ParkMoleRankingRepository.MoleRankingStanding;
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
@Import(ParkMoleRankingRepository.class)
class ParkMoleRankingRepositoryTests {
    private static final Instant STARTED_AT = Instant.parse("2026-11-02T00:00:00Z");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private ParkMoleRankingRepository rankings;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_PARK_MOLE_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_ranking_test_mole_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("두더지 잡기 랭킹판 집계는 새 loopback 전용 MySQL DB에서만 검증합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_PARK_MOLE_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_PARK_MOLE_DB_PASSWORD"));
    }

    @Test
    void 점수_콤보_정산시각순으로_상위목록을_결정하고_동점은_같은_순위다() {
        long earliest = member("먼저정산");
        long later = member("나중정산");
        long lowerCombo = member("낮은콤보");
        round(earliest, 1_200, 30, STARTED_AT.plusSeconds(10), MoleRules.RULES_VERSION);
        round(later, 1_200, 30, STARTED_AT.plusSeconds(20), MoleRules.RULES_VERSION);
        round(lowerCombo, 1_200, 29, STARTED_AT.plusSeconds(1), MoleRules.RULES_VERSION);

        List<MoleRankingStanding> standings = rankings.findTopTen(STARTED_AT);

        assertThat(standings).extracting(MoleRankingStanding::rank).containsExactly(1L, 1L, 3L);
        assertThat(standings).extracting(MoleRankingStanding::userId).containsExactly(earliest, later, lowerCombo);
        assertThat(standings).first().satisfies(result -> {
            assertThat(result.score()).isEqualTo(1_200);
            assertThat(result.maxCombo()).isEqualTo(30);
            assertThat(result.completedAt()).isEqualTo(STARTED_AT.plusSeconds(10));
        });
    }

    @Test
    void 회원별_최고만_남기고_시작전_이전규칙_탈퇴기록을_제외한다() {
        long included = member("포함");
        round(included, 400, 10, STARTED_AT.plusSeconds(2), MoleRules.RULES_VERSION);
        round(included, 800, 12, STARTED_AT.plusSeconds(3), MoleRules.RULES_VERSION);
        round(member("시작전"), 9_000, 99, STARTED_AT.minusMillis(1), MoleRules.RULES_VERSION);
        round(member("이전규칙"), 9_000, 99, STARTED_AT.plusSeconds(1), 2);
        long deleted = member("탈퇴");
        round(deleted, 9_000, 99, STARTED_AT.plusSeconds(1), MoleRules.RULES_VERSION);
        jdbc.update("UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?", deleted);

        assertThat(rankings.findTopTen(STARTED_AT)).singleElement().satisfies(result -> {
            assertThat(result.userId()).isEqualTo(included);
            assertThat(result.score()).isEqualTo(800);
            assertThat(result.maxCombo()).isEqualTo(12);
        });
    }

    @Test
    void 열한명의_기록이_있어도_상위_열명만_반환한다() {
        for (int index = 0; index < 11; index++) {
            round(member("상위" + index), 1_000 - index, index, STARTED_AT.plusSeconds(index + 1L),
                    MoleRules.RULES_VERSION);
        }

        assertThat(rankings.findTopTen(STARTED_AT)).hasSize(10).extracting(MoleRankingStanding::score)
                .containsExactly(1_000L, 999L, 998L, 997L, 996L, 995L, 994L, 993L, 992L, 991L);
    }

    @Test
    void 랭킹_인덱스로_현재_규칙의_정산_판을_좁힌다() {
        round(member("계획"), 100, 3, STARTED_AT.plusSeconds(1), MoleRules.RULES_VERSION);
        String plan = jdbc.queryForObject("EXPLAIN FORMAT=TREE " + ParkMoleRankingRepository.RANKING_SQL
                        .replace(":rulesVersion", "?").replace(":startedAtMillis", "?"), String.class,
                MoleRules.RULES_VERSION, STARTED_AT.toEpochMilli());

        assertThat(plan).contains("ix_mole_bests");
    }

    private long member(String nickname) {
        String providerUserId = "park-mole-" + UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users (login_provider, provider_user_id, nickname, character_gender,
                    created_at, updated_at)
                VALUES ('SSAFY', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
                """, providerUserId, nickname);
        return jdbc.queryForObject("SELECT id FROM users WHERE provider_user_id = ?", Long.class, providerUserId);
    }

    private void round(long userId, int score, int maxCombo, Instant settledAt, int rulesVersion) {
        int perCoin = rulesVersion == 1 ? 30 : rulesVersion == 2 ? 45 : 40;
        jdbc.update("""
                INSERT INTO mole_rounds (user_id, request_key, seed, rules_version, status, started_at, settled_at,
                    score, max_combo, caught, calculated_reward, reward)
                VALUES (?, ?, 1, ?, 'SETTLED', FROM_UNIXTIME(? / 1000), FROM_UNIXTIME(? / 1000), ?, ?, 10, ?, 0)
                """, userId, UUID.randomUUID().toString(), rulesVersion, settledAt.minusSeconds(95).toEpochMilli(),
                settledAt.toEpochMilli(), score, maxCombo, score / perCoin);
    }
}
