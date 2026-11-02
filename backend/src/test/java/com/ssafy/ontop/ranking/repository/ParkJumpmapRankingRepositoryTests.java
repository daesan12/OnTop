package com.ssafy.ontop.ranking.repository;

import com.ssafy.ontop.ranking.repository.ParkJumpmapRankingRepository.JumpmapRankingStanding;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
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
@DataJpaTest(properties = "spring.flyway.locations=classpath:db/migration,classpath:db/minigame")
@AutoConfigureTestDatabase(replace = AutoConfigureTestDatabase.Replace.NONE)
@Import(ParkJumpmapRankingRepository.class)
class ParkJumpmapRankingRepositoryTests {
    private static final Instant STARTED_AT = Instant.parse("2026-11-02T00:00:00Z");

    @Autowired private JdbcTemplate jdbc;
    @Autowired private ParkJumpmapRankingRepository rankings;

    @DynamicPropertySource
    static void isolatedDatabase(DynamicPropertyRegistry registry) {
        String url = System.getenv("TEST_PARK_JUMPMAP_DB_URL");
        if (url == null || !url.matches(
                "jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/ontop_ranking_test_jumpmap_[A-Za-z0-9_]+(?:\\?.*)?")) {
            throw new IllegalStateException("점프맵 우승자 집계는 새 loopback 전용 MySQL DB에서만 검증합니다.");
        }
        registry.add("spring.datasource.url", () -> url);
        registry.add("spring.datasource.username", () -> System.getenv("TEST_PARK_JUMPMAP_DB_USERNAME"));
        registry.add("spring.datasource.password", () -> System.getenv("TEST_PARK_JUMPMAP_DB_PASSWORD"));
    }

    @Test
    void 개인최고를_선택하고_완주시간_완료시각_회원번호순으로_상위목록을_결정한다() {
        long earlierUser = member("먼저완주");
        long laterUser = member("나중완주");
        run(earlierUser, 9_000, STARTED_AT.plusSeconds(1), false,
                JumpCourse.RULES_VERSION, JumpCourse.COURSE_VERSION, JumpCourse.STAGES);
        run(earlierUser, 8_000, STARTED_AT.plusSeconds(10), false,
                JumpCourse.RULES_VERSION, JumpCourse.COURSE_VERSION, JumpCourse.STAGES);
        run(laterUser, 8_000, STARTED_AT.plusSeconds(20), false,
                JumpCourse.RULES_VERSION, JumpCourse.COURSE_VERSION, JumpCourse.STAGES);

        List<JumpmapRankingStanding> standings = rankings.findTopTen(STARTED_AT);

        assertThat(standings).extracting(JumpmapRankingStanding::rank).containsExactly(1L, 1L);
        assertThat(standings).first().satisfies(result -> {
            assertThat(result.userId()).isEqualTo(earlierUser);
            assertThat(result.finishMs()).isEqualTo(8_000);
            assertThat(result.completedAt()).isEqualTo(STARTED_AT.plusSeconds(10));
        });
    }

    @Test
    void 시작전_의심_이전코스_미완주_탈퇴기록을_제외한다() {
        long included = member("포함");
        run(included, 8_000, STARTED_AT.plusSeconds(1), false,
                JumpCourse.RULES_VERSION, JumpCourse.COURSE_VERSION, JumpCourse.STAGES);
        run(member("시작전"), 1, STARTED_AT.minusMillis(1), false,
                JumpCourse.RULES_VERSION, JumpCourse.COURSE_VERSION, JumpCourse.STAGES);
        run(member("의심"), 1, STARTED_AT.plusSeconds(2), true,
                JumpCourse.RULES_VERSION, JumpCourse.COURSE_VERSION, JumpCourse.STAGES);
        run(member("이전코스"), 1, STARTED_AT.plusSeconds(2), false,
                JumpCourse.RULES_VERSION, "old-course", JumpCourse.STAGES);
        run(member("문누락"), 1, STARTED_AT.plusSeconds(2), false,
                JumpCourse.RULES_VERSION, JumpCourse.COURSE_VERSION, JumpCourse.STAGES - 1);
        long deleted = member("탈퇴");
        run(deleted, 1, STARTED_AT.plusSeconds(2), false,
                JumpCourse.RULES_VERSION, JumpCourse.COURSE_VERSION, JumpCourse.STAGES);
        jdbc.update("UPDATE users SET deleted_at = CURRENT_TIMESTAMP(3) WHERE id = ?", deleted);

        List<JumpmapRankingStanding> standings = rankings.findTopTen(STARTED_AT);

        assertThat(standings).singleElement().satisfies(result -> {
            assertThat(result.userId()).isEqualTo(included);
            assertThat(result.finishMs()).isEqualTo(8_000);
        });
    }

    @Test
    void 정상기록이_없으면_랭킹이_비어있다() {
        assertThat(rankings.findTopTen(STARTED_AT)).isEmpty();
    }

    @Test
    void 열한명의_정상기록이_있어도_상위_열명만_반환한다() {
        for (int index = 0; index < 11; index++) {
            run(member("상위" + index), 8_000 + index, STARTED_AT.plusSeconds(index + 1L), false,
                    JumpCourse.RULES_VERSION, JumpCourse.COURSE_VERSION, JumpCourse.STAGES);
        }

        assertThat(rankings.findTopTen(STARTED_AT)).hasSize(10)
                .extracting(JumpmapRankingStanding::finishMs)
                .containsExactly(8_000L, 8_001L, 8_002L, 8_003L, 8_004L,
                        8_005L, 8_006L, 8_007L, 8_008L, 8_009L);
    }

    @Test
    void 실행계획과_집계시간을_기록한다() throws Exception {
        run(member("계획측정"), 8_000, STARTED_AT.plusSeconds(1), false,
                JumpCourse.RULES_VERSION, JumpCourse.COURSE_VERSION, JumpCourse.STAGES);
        String explainSql = ParkJumpmapRankingRepository.RANKING_SQL
                .replace(":requiredGates", "?")
                .replace(":rulesVersion", "?")
                .replace(":courseVersion", "?")
                .replace(":startedAtMillis", "?");
        String plan = jdbc.queryForObject("EXPLAIN FORMAT=TREE " + explainSql, String.class,
                JumpCourse.STAGES, JumpCourse.RULES_VERSION, JumpCourse.COURSE_VERSION,
                STARTED_AT.toEpochMilli());
        long started = System.nanoTime();

        List<JumpmapRankingStanding> standings = rankings.findTopTen(STARTED_AT);
        long elapsedNanos = System.nanoTime() - started;

        Path report = Path.of("build", "park-jumpmap-ranking-plan.txt");
        Files.createDirectories(report.getParent());
        Files.writeString(report, "Elapsed: " + elapsedNanos / 1_000_000.0 + " ms\n\n" + plan + "\n");
        assertThat(plan).contains("Limit: 10 row(s)");
        assertThat(standings).hasSize(1);
    }

    private long member(String nickname) {
        String providerUserId = "park-jumpmap-" + UUID.randomUUID();
        jdbc.update("""
                INSERT INTO users (login_provider, provider_user_id, nickname, character_gender,
                    created_at, updated_at)
                VALUES ('SSAFY', ?, ?, 'MALE', CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3))
                """, providerUserId, nickname);
        return jdbc.queryForObject("SELECT id FROM users WHERE provider_user_id = ?", Long.class, providerUserId);
    }

    private void run(long userId, long finishMs, Instant endedAt, boolean suspicious,
                     String rulesVersion, String courseVersion, int gatesPassed) {
        jdbc.update("""
                INSERT INTO jump_runs (id, user_id, channel_id, status, end_reason, rules_version,
                    course_version, is_first_run, started_at, ended_at, gates_passed, gate_times_ms,
                    final_reached, max_height, coins_granted, elapsed_ms, finish_ms, suspicious,
                    suspicious_reasons)
                VALUES (?, ?, 'channel-1', 'ENDED', 'FINISH', ?, ?, FALSE,
                    FROM_UNIXTIME(? / 1000), FROM_UNIXTIME(? / 1000), ?, JSON_ARRAY(),
                    TRUE, 10, 0, ?, ?, ?, JSON_ARRAY())
                """, UUID.randomUUID().toString(), userId, rulesVersion, courseVersion,
                endedAt.minusMillis(finishMs).toEpochMilli(), endedAt.toEpochMilli(), gatesPassed,
                finishMs, finishMs, suspicious);
    }
}
