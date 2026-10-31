package com.ssafy.ontop.ranking.repository;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Profile("db")
public class SingleGameProfitRankingRepository {
    static final String TOP_TEN_SQL = """
            WITH eligible AS (
                SELECT p.user_id, u.nickname, s.id AS game_session_id,
                       p.coin_delta AS profit, s.settled_at
                FROM game_sessions s
                JOIN game_participants p ON p.game_session_id = s.id
                JOIN users u ON u.id = p.user_id
                WHERE s.status = 'FINISHED' AND s.settlement_status = 'SETTLED'
                  AND s.settled_at >= FROM_UNIXTIME(:startedAtMillis / 1000) AND p.coin_delta > 0
                  AND u.deleted_at IS NULL
            ), personal_best AS (
                SELECT eligible.*,
                       ROW_NUMBER() OVER (PARTITION BY user_id
                           ORDER BY profit DESC, settled_at ASC, game_session_id ASC) AS choice
                FROM eligible
            ), ranked AS (
                SELECT RANK() OVER (ORDER BY profit DESC) AS place,
                       user_id, nickname, profit, settled_at, game_session_id
                FROM personal_best
                WHERE choice = 1
            )
            SELECT place, user_id, nickname, profit,
                   CAST(UNIX_TIMESTAMP(settled_at) * 1000 AS SIGNED) AS settled_epoch_millis,
                   game_session_id
            FROM ranked
            ORDER BY profit DESC, settled_at ASC, game_session_id ASC, user_id ASC
            LIMIT 10
            """;

    private final EntityManager entities;

    public SingleGameProfitRankingRepository(EntityManager entities) {
        this.entities = entities;
    }

    @Transactional(readOnly = true)
    public List<ProfitStanding> findTopTen(Instant startedAt) {
        // JDBC Timestamp 변환은 JVM 시간대와 DB 세션 시간대가 다를 때 경계가 어긋날 수 있다.
        List<?> rows = entities.createNativeQuery(TOP_TEN_SQL, Object[].class)
                .setParameter("startedAtMillis", startedAt.toEpochMilli())
                .getResultList();
        return rows.stream().map(value -> {
            Object[] row = (Object[]) value;
            return new ProfitStanding(((Number) row[0]).longValue(), ((Number) row[1]).longValue(),
                    (String) row[2], ((Number) row[3]).longValue(),
                    Instant.ofEpochMilli(((Number) row[4]).longValue()),
                    ((Number) row[5]).longValue());
        }).toList();
    }

    public record ProfitStanding(long rank, long userId, String nickname, long profit,
                                 Instant settledAt, long gameSessionId) {
    }
}
