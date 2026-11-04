package com.ssafy.ontop.ranking.repository;

import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.jumpmap.JumpmapRankingEligibility;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Profile("db")
public class ParkJumpmapRankingRepository {
    static final String RANKING_SQL = """
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
            """.formatted(JumpmapRankingEligibility.SQL);

    private final EntityManager entities;

    public ParkJumpmapRankingRepository(EntityManager entities) {
        this.entities = entities;
    }

    @Transactional(readOnly = true)
    public List<JumpmapRankingStanding> findTopTen(Instant startedAt) {
        return entities.createNativeQuery(RANKING_SQL, Object[].class)
                .setParameter("requiredGates", JumpCourse.STAGES)
                .setParameter("rulesVersion", JumpCourse.RULES_VERSION)
                .setParameter("courseVersion", JumpCourse.COURSE_VERSION)
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

    public record JumpmapRankingStanding(long rank, long userId, String nickname, long finishMs,
                                          Instant completedAt) {
    }
}
