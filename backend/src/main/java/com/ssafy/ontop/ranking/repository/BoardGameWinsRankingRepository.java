package com.ssafy.ontop.ranking.repository;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Profile("db")
public class BoardGameWinsRankingRepository {
    static final String TOP_TEN_SQL = """
            WITH eligible AS (
                SELECT p.user_id, u.nickname, s.id AS game_session_id, s.settled_at
                FROM game_sessions s
                JOIN game_participants p ON p.game_session_id = s.id
                JOIN users u ON u.id = p.user_id
                WHERE s.status = 'FINISHED' AND s.settlement_status = 'SETTLED'
                  AND s.settled_at >= FROM_UNIXTIME(:startedAtMillis / 1000)
                  AND p.result = 'WIN' AND u.deleted_at IS NULL
            ), counted AS (
                SELECT eligible.*,
                       COUNT(*) OVER (PARTITION BY user_id) AS win_count,
                       ROW_NUMBER() OVER (PARTITION BY user_id
                           ORDER BY settled_at DESC, game_session_id DESC) AS latest_win
                FROM eligible
            ), ranked AS (
                SELECT RANK() OVER (ORDER BY win_count DESC) AS place,
                       user_id, nickname, win_count, settled_at, game_session_id
                FROM counted
                WHERE latest_win = 1
            )
            SELECT place, user_id, nickname, win_count,
                   CAST(UNIX_TIMESTAMP(settled_at) * 1000 AS SIGNED) AS reached_epoch_millis,
                   game_session_id
            FROM ranked
            ORDER BY win_count DESC, settled_at ASC, game_session_id ASC, user_id ASC
            LIMIT 10
            """;

    private final EntityManager entities;

    public BoardGameWinsRankingRepository(EntityManager entities) {
        this.entities = entities;
    }

    @Transactional(readOnly = true)
    public List<WinStanding> findTopTen(Instant startedAt) {
        // DB 연결은 UTC 세션을 사용한다. epoch 변환으로 JVM 기본 시간대와 TIMESTAMP 바인딩을 분리한다.
        List<?> rows = entities.createNativeQuery(TOP_TEN_SQL, Object[].class)
                .setParameter("startedAtMillis", startedAt.toEpochMilli())
                .getResultList();
        return rows.stream().map(value -> {
            Object[] row = (Object[]) value;
            return new WinStanding(((Number) row[0]).longValue(), ((Number) row[1]).longValue(),
                    (String) row[2], ((Number) row[3]).longValue(),
                    Instant.ofEpochMilli(((Number) row[4]).longValue()),
                    ((Number) row[5]).longValue());
        }).toList();
    }

    public record WinStanding(long rank, long userId, String nickname, long winCount,
                              Instant reachedAt, long gameSessionId) {
    }
}
