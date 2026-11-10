package com.ssafy.ontop.ranking.repository;

import com.ssafy.ontop.game.speedmole.SpeedMoleRules;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** 스피드 두더지 게임 안 랭킹(SpeedMoleRepository)과 같은 기준에 랭킹판 집계 시작 시각만 더한다. */
@Repository
@Profile("db")
public class ParkSpeedMoleRankingRepository {
    static final String RANKING_SQL = """
            WITH personal_best AS (
                SELECT r.id AS round_id, r.user_id, u.nickname, r.score, r.misses, r.completed_at,
                       ROW_NUMBER() OVER (PARTITION BY r.user_id
                           ORDER BY r.score DESC, r.misses ASC, r.completed_at ASC, r.id ASC) AS choice
                FROM speed_mole_rounds r
                JOIN users u ON u.id = r.user_id
                WHERE r.status = 'SETTLED' AND r.rules_version = :rulesVersion
                  AND r.completed_at >= FROM_UNIXTIME(:startedAtMillis / 1000)
                  AND u.deleted_at IS NULL
            ), ranked AS (
                SELECT personal_best.*,
                       RANK() OVER (ORDER BY score DESC, misses ASC) AS ranking
                FROM personal_best
                WHERE choice = 1
            )
            SELECT ranking, user_id, nickname, score, misses,
                   CAST(UNIX_TIMESTAMP(completed_at) * 1000 AS SIGNED) AS completed_epoch_millis
            FROM ranked
            ORDER BY score DESC, misses ASC, completed_at ASC, round_id ASC
            LIMIT 10
            """;

    private final EntityManager entities;

    public ParkSpeedMoleRankingRepository(EntityManager entities) {
        this.entities = entities;
    }

    @Transactional(readOnly = true)
    public List<SpeedMoleRankingStanding> findTopTen(Instant startedAt) {
        return entities.createNativeQuery(RANKING_SQL, Object[].class)
                .setParameter("rulesVersion", SpeedMoleRules.VERSION)
                .setParameter("startedAtMillis", startedAt.toEpochMilli())
                .getResultStream()
                .map(value -> {
                    Object[] row = (Object[]) value;
                    return new SpeedMoleRankingStanding(((Number) row[0]).longValue(),
                            ((Number) row[1]).longValue(), (String) row[2],
                            ((Number) row[3]).longValue(), ((Number) row[4]).longValue(),
                            Instant.ofEpochMilli(((Number) row[5]).longValue()));
                })
                .toList();
    }

    public record SpeedMoleRankingStanding(long rank, long userId, String nickname, long score, long misses,
                                           Instant completedAt) {
    }
}
