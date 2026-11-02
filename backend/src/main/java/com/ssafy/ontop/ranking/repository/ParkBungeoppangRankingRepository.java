package com.ssafy.ontop.ranking.repository;

import com.ssafy.ontop.minigame.service.BungeoppangV5Spec;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Profile("db")
public class ParkBungeoppangRankingRepository {
    static final String RANKING_SQL = """
            WITH completed AS (
                SELECT s.id AS session_id, s.user_id, u.nickname, s.score, r.settled_at,
                       JSON_EXTRACT(b.result_json, '$.maxCombo') AS combo_json
                FROM minigame_sessions s
                JOIN bungeoppang_records b ON b.minigame_session_id = s.id
                JOIN bungeoppang_v4_rounds r ON r.minigame_session_id = s.id
                JOIN users u ON u.id = s.user_id
                WHERE s.minigame_type = 'BUNGEOPPANG'
                  AND s.status = 'COMPLETED' AND s.ended_at IS NOT NULL
                  AND r.terminal_reason = 'VERIFIED' AND r.settled_at IS NOT NULL
                  AND r.settled_at >= FROM_UNIXTIME(:startedAtMillis / 1000)
                  AND b.rules_version = :rulesVersion
                  -- TIMESTAMP(3) 양 끝은 같은 issuedAt에서 정확히 durationMs를 더해 만들고 이후 수정하지 않는다.
                  AND TIMESTAMPDIFF(MICROSECOND, r.play_starts_at, r.play_ends_at) = :durationMicros
                  AND JSON_VALID(b.result_json)
                  AND s.score BETWEEN 0 AND 9007199254740991
                  AND u.deleted_at IS NULL
            ), eligible AS (
                SELECT session_id, user_id, nickname, score, settled_at,
                       CAST(JSON_UNQUOTE(combo_json) AS UNSIGNED) AS max_combo
                FROM completed
                WHERE JSON_TYPE(combo_json) = 'INTEGER'
                  AND JSON_UNQUOTE(combo_json) REGEXP '^[0-9]{1,10}$'
            ), personal_best AS (
                SELECT eligible.*,
                       ROW_NUMBER() OVER (PARTITION BY user_id
                           ORDER BY score DESC, max_combo DESC, settled_at ASC, session_id ASC) AS choice
                FROM eligible
            ), ranked AS (
                SELECT personal_best.*,
                       RANK() OVER (ORDER BY score DESC, max_combo DESC) AS ranking
                FROM personal_best
                WHERE choice = 1
            )
            SELECT ranking, user_id, nickname, score, max_combo,
                   CAST(UNIX_TIMESTAMP(settled_at) * 1000 AS SIGNED) AS settled_epoch_millis
            FROM ranked
            ORDER BY score DESC, max_combo DESC, settled_at ASC, user_id ASC
            LIMIT 10
            """;

    private final EntityManager entities;

    public ParkBungeoppangRankingRepository(EntityManager entities) {
        this.entities = entities;
    }

    @Transactional(readOnly = true)
    public List<BungeoppangRankingStanding> findTopTen(Instant startedAt) {
        return entities.createNativeQuery(RANKING_SQL, Object[].class)
                .setParameter("startedAtMillis", startedAt.toEpochMilli())
                .setParameter("rulesVersion", BungeoppangV5Spec.RULES_VERSION)
                .setParameter("durationMicros", BungeoppangV5Spec.DURATION_MS * 1_000L)
                .getResultStream()
                .map(value -> {
                    Object[] row = (Object[]) value;
                    return new BungeoppangRankingStanding(((Number) row[0]).longValue(),
                            ((Number) row[1]).longValue(), (String) row[2],
                            ((Number) row[3]).longValue(), ((Number) row[4]).longValue(),
                            Instant.ofEpochMilli(((Number) row[5]).longValue()));
                })
                .toList();
    }

    public record BungeoppangRankingStanding(long rank, long userId, String nickname, long score, long maxCombo,
                                              Instant completedAt) {
    }
}
