package com.ssafy.ontop.ranking.repository;

import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.jumpmap.JumpmapRankingEligibility;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import jakarta.persistence.EntityManager;
import java.io.IOException;
import java.time.Instant;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Profile("db")
public class ParkJumpmapRankingRepository {
    private static final String RANKING_SQL_TEMPLATE = """
            WITH eligible AS (
                SELECT r.id AS run_id, r.user_id, u.nickname, r.finish_ms, r.ended_at
                FROM jump_runs r
                JOIN users u ON u.id = r.user_id
                WHERE r.status = 'ENDED' AND r.end_reason = 'FINISH'
                  AND %s AND r.finish_ms > 0
                  AND r.final_reached = TRUE AND r.gates_passed = :requiredGates
                  AND r.rules_version = :rulesVersion AND r.course_version = :courseVersion
                  AND r.ended_at >= FROM_UNIXTIME(:startedAtMillis / 1000)
                  AND u.deleted_at IS NULL
            ), personal_best AS (
                SELECT eligible.*,
                       ROW_NUMBER() OVER (PARTITION BY user_id
                           ORDER BY finish_ms ASC, ended_at ASC, run_id ASC) AS choice
                FROM eligible
            ), ranked AS (
                SELECT personal_best.*,
                       RANK() OVER (ORDER BY finish_ms ASC) AS ranking
                FROM personal_best
                WHERE choice = 1
            )
            SELECT ranking, user_id, nickname, finish_ms,
                   CAST(UNIX_TIMESTAMP(ended_at) * 1000 AS SIGNED) AS ended_epoch_millis
            FROM ranked
            ORDER BY finish_ms ASC, ended_at ASC, user_id ASC
            LIMIT 10
            """;
    static final String RANKING_SQL = RANKING_SQL_TEMPLATE.formatted(JumpmapRankingEligibility.SQL);

    private final EntityManager entities;
    private final CourseFilter course;
    private final String rankingSql;

    public ParkJumpmapRankingRepository(EntityManager entities, ObjectProvider<WorldMapRuntime> runtimes) {
        this.entities = entities;
        this.course = configuredCourse(runtimes.getIfAvailable());
        this.rankingSql = RANKING_SQL_TEMPLATE.formatted(course.renewal()
                ? "r.suspicious = FALSE" : JumpmapRankingEligibility.SQL);
    }

    @Transactional(readOnly = true)
    public List<JumpmapRankingStanding> findTopTen(Instant startedAt) {
        return entities.createNativeQuery(rankingSql, Object[].class)
                .setParameter("requiredGates", course.stages())
                .setParameter("rulesVersion", course.rulesVersion())
                .setParameter("courseVersion", course.courseVersion())
                .setParameter("startedAtMillis", startedAt.toEpochMilli())
                .getResultStream()
                .map(value -> {
                    Object[] row = (Object[]) value;
                    return new JumpmapRankingStanding(((Number) row[0]).longValue(),
                            ((Number) row[1]).longValue(), (String) row[2],
                            ((Number) row[3]).longValue(),
                            Instant.ofEpochMilli(((Number) row[4]).longValue()));
                })
                .toList();
    }

    private static CourseFilter configuredCourse(WorldMapRuntime runtime) {
        try {
            JumpCourse course = runtime == null ? JumpCourse.loadDefault() : runtime.loadJumpCourse();
            return new CourseFilter(course.stageCount(), course.rulesVersion(), course.courseVersion(),
                    course.renewal());
        } catch (IOException | IllegalArgumentException failure) {
            throw new IllegalStateException("점프맵 랭킹 코스를 읽을 수 없습니다.", failure);
        }
    }

    private record CourseFilter(int stages, String rulesVersion, String courseVersion, boolean renewal) { }

    public record JumpmapRankingStanding(long rank, long userId, String nickname, long finishMs,
                                          Instant completedAt) {
    }
}
