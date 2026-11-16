package com.ssafy.ontop.ranking.repository;

import com.ssafy.ontop.minigame.service.BungeoppangV5Spec;
import com.ssafy.ontop.ranking.repository.ParkBungeoppangRankingRepository.BungeoppangRankingStanding;
import java.nio.file.Files;
import java.nio.file.Path;
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
@DataJpaTest(properties = "spring.flyway.locations=classpath:db/migration,classpath:db/minigame,classpath:db/shop")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ParkBungeoppangRankingRepository.class)
class ParkBungeoppangRankingRepositoryTests {
    private static final Instant STARTED_AT = Instant.parse("2026-11-02T00:00:00Z");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private ParkBungeoppangRankingRepository rankings;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_PARK_BUNGEOPPANG_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_ranking_test_bungeoppang_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("붕어빵 우승자 집계는 새 loopback 전용 MySQL DB에서만 검증합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_PARK_BUNGEOPPANG_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_PARK_BUNGEOPPANG_DB_PASSWORD"));
    }

    @Test
    void 점수_콤보_완료시각_회원번호순으로_v5_2분_상위목록을_결정한다() {
        long earliestUser = member("먼저완료");
        long laterUser = member("나중완료");
        long lowerComboUser = member("낮은콤보");
        round(earliestUser, 10_000, 15, STARTED_AT.plusSeconds(10),
                BungeoppangV5Spec.RULES_VERSION, BungeoppangV5Spec.DURATION_MS);
        round(laterUser, 10_000, 15, STARTED_AT.plusSeconds(20),
                BungeoppangV5Spec.RULES_VERSION, BungeoppangV5Spec.DURATION_MS);
        round(lowerComboUser, 10_000, 14, STARTED_AT.plusSeconds(1),
                BungeoppangV5Spec.RULES_VERSION, BungeoppangV5Spec.DURATION_MS);

        List<BungeoppangRankingStanding> standings = rankings.findTopTen(STARTED_AT);

        assertThat(standings).extracting(BungeoppangRankingStanding::rank).containsExactly(1L, 1L, 3L);
        assertThat(standings).first().satisfies(result -> {
            assertThat(result.userId()).isEqualTo(earliestUser);
            assertThat(result.score()).isEqualTo(10_000);
            assertThat(result.maxCombo()).isEqualTo(15);
            assertThat(result.completedAt()).isEqualTo(STARTED_AT.plusSeconds(10));
        });
    }

    @Test
    void 사용자별_최고만_남기고_시작전_다른규칙_다른길이_탈퇴기록을_제외한다() {
        long included = member("포함");
        round(included, 100, 3, STARTED_AT.plusSeconds(2),
                BungeoppangV5Spec.RULES_VERSION, BungeoppangV5Spec.DURATION_MS);
        round(included, 200, 4, STARTED_AT.plusSeconds(3),
                BungeoppangV5Spec.RULES_VERSION, BungeoppangV5Spec.DURATION_MS);
        round(member("시작전"), 999, 99, STARTED_AT.minusMillis(1),
                BungeoppangV5Spec.RULES_VERSION, BungeoppangV5Spec.DURATION_MS);
        round(member("이전규칙"), 999, 99, STARTED_AT.plusSeconds(1), "v4", 180_000);
        round(member("세분판"), 999, 99, STARTED_AT.plusSeconds(1),
                BungeoppangV5Spec.RULES_VERSION, 180_000);
        long deleted = member("탈퇴");
        round(deleted, 999, 99, STARTED_AT.plusSeconds(1),
                BungeoppangV5Spec.RULES_VERSION, BungeoppangV5Spec.DURATION_MS);
        jdbc.update("UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?", deleted);

        List<BungeoppangRankingStanding> standings = rankings.findTopTen(STARTED_AT);

        assertThat(standings).singleElement().satisfies(result -> {
            assertThat(result.userId()).isEqualTo(included);
            assertThat(result.score()).isEqualTo(200);
            assertThat(result.maxCombo()).isEqualTo(4);
        });
    }

    @Test
    void 정상기록이_없으면_랭킹이_비어있다() {
        assertThat(rankings.findTopTen(STARTED_AT)).isEmpty();
    }

    @Test
    void 열한명의_정상기록이_있어도_상위_열명만_반환한다() {
        for (int index = 0; index < 11; index++) {
            round(member("상위" + index), 1_000 - index, index,
                    STARTED_AT.plusSeconds(index + 1L), BungeoppangV5Spec.RULES_VERSION,
                    BungeoppangV5Spec.DURATION_MS);
        }

        assertThat(rankings.findTopTen(STARTED_AT)).hasSize(10)
                .extracting(BungeoppangRankingStanding::score)
                .containsExactly(1_000L, 999L, 998L, 997L, 996L, 995L, 994L, 993L, 992L, 991L);
    }

    @Test
    void 실행계획과_JSON검증을_포함한_집계시간을_기록한다() throws Exception {
        round(member("계획측정"), 100, 3, STARTED_AT.plusSeconds(1),
                BungeoppangV5Spec.RULES_VERSION, BungeoppangV5Spec.DURATION_MS);
        String explainSql = ParkBungeoppangRankingRepository.RANKING_SQL
                .replace(":startedAtMillis", "?")
                .replace(":rulesVersion", "?")
                .replace(":durationMicros", "?");
        String plan = jdbc.queryForObject("EXPLAIN FORMAT=TREE " + explainSql, String.class,
                STARTED_AT.toEpochMilli(), BungeoppangV5Spec.RULES_VERSION,
                BungeoppangV5Spec.DURATION_MS * 1_000L);
        long started = System.nanoTime();

        List<BungeoppangRankingStanding> standings = rankings.findTopTen(STARTED_AT);
        long elapsedNanos = System.nanoTime() - started;

        assertThat(plan).contains("ix_bungeoppang_rounds_ranking");
        assertThat(standings).hasSize(1);
        Path report = Path.of("build", "park-bungeoppang-ranking-plan.txt");
        Files.createDirectories(report.getParent());
        Files.writeString(report, "Elapsed: " + elapsedNanos / 1_000_000.0 + " ms\n\n" + plan + "\n");
    }

    private long member(String nickname) {
        String providerUserId = "park-bungeoppang-" + UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users (login_provider, provider_user_id, nickname, character_gender,
                    created_at, updated_at)
                VALUES ('SSAFY', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
                """, providerUserId, nickname);
        return jdbc.queryForObject("SELECT id FROM users WHERE provider_user_id = ?", Long.class, providerUserId);
    }

    private long round(long userId, long score, long maxCombo, Instant settledAt,
                       String rulesVersion, int durationMs) {
        Instant playStartsAt = settledAt.minusSeconds(30);
        Instant playEndsAt = playStartsAt.plusMillis(durationMs);
        jdbc.update("""
                INSERT INTO minigame_sessions (user_id, minigame_type, status, score, reward_amount,
                    started_at, ended_at)
                VALUES (?, 'BUNGEOPPANG', 'COMPLETED', ?, 0,
                    FROM_UNIXTIME(? / 1000), FROM_UNIXTIME(? / 1000))
                """, userId, score, playStartsAt.minusSeconds(5).toEpochMilli(), settledAt.toEpochMilli());
        long sessionId = jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
        jdbc.update("""
                INSERT INTO bungeoppang_records (minigame_session_id, rules_version, heats,
                    is_first_game, result_json)
                VALUES (?, ?, '[]', FALSE, JSON_OBJECT('made', 1, 'failed', 0, 'maxCombo', ?))
                """, sessionId, rulesVersion, maxCombo);
        jdbc.update("""
                INSERT INTO bungeoppang_v4_rounds (minigame_session_id, config_version, config_json,
                    issued_at, countdown_starts_at, play_starts_at, play_ends_at, submit_deadline, expires_at,
                    approved_prefix_hash, checkpoint_json, terminal_reason,
                    final_request_hash, final_through_seq, final_prefix_hash, settled_at, reward_date)
                VALUES (?, 'test', '{}', FROM_UNIXTIME(? / 1000), FROM_UNIXTIME(? / 1000),
                    FROM_UNIXTIME(? / 1000), FROM_UNIXTIME(? / 1000), FROM_UNIXTIME(? / 1000),
                    FROM_UNIXTIME(? / 1000), REPEAT('a', 64), '{}', 'VERIFIED',
                    REPEAT('b', 64), 0, REPEAT('c', 64), FROM_UNIXTIME(? / 1000), DATE(FROM_UNIXTIME(? / 1000)))
                """, sessionId, playStartsAt.minusSeconds(5).toEpochMilli(),
                playStartsAt.minusSeconds(4).toEpochMilli(), playStartsAt.toEpochMilli(), playEndsAt.toEpochMilli(),
                playEndsAt.plusSeconds(1).toEpochMilli(), playEndsAt.plusSeconds(2).toEpochMilli(),
                settledAt.toEpochMilli(), settledAt.toEpochMilli());
        return sessionId;
    }
}
