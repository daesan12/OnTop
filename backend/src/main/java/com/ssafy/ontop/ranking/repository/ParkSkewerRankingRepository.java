package com.ssafy.ontop.ranking.repository;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Profile("db")
public class ParkSkewerRankingRepository {
    static final String SQL = """
        WITH choices AS (
          SELECT r.*, c.nickname AS chef_nickname, s.nickname AS server_nickname,
            ROW_NUMBER() OVER (PARTITION BY r.team_low_id, r.team_high_id
              ORDER BY r.team_score DESC, r.ended_at, r.game_id) AS choice
          FROM skewer_coop_results r
          JOIN users c ON c.id = r.chef_user_id JOIN users s ON s.id = r.server_user_id
          WHERE r.ranking_eligible = TRUE AND r.end_reason = 'SKEWER_TIME_UP'
            AND r.rules_version = 'coop-v1' AND r.duration_ms = 240000
            AND r.play_mode IN ('PC', 'VR')
            AND r.ended_at >= FROM_UNIXTIME(:startedAtMillis / 1000)
            AND c.deleted_at IS NULL AND s.deleted_at IS NULL
        ), ranked AS (
          SELECT *, RANK() OVER (ORDER BY team_score DESC) AS place FROM choices WHERE choice = 1
        )
        SELECT place, game_id, chef_user_id, chef_nickname, server_user_id, server_nickname,
          team_score, play_mode, CAST(UNIX_TIMESTAMP(ended_at) * 1000 AS SIGNED)
        FROM ranked ORDER BY team_score DESC, ended_at, game_id LIMIT 10
        """;
    private final EntityManager entities;
    public ParkSkewerRankingRepository(EntityManager entities) { this.entities = entities; }

    @Transactional(readOnly = true)
    public List<Standing> findTopTen(Instant startedAt) {
        return entities.createNativeQuery(SQL, Object[].class)
                .setParameter("startedAtMillis", startedAt.toEpochMilli()).getResultStream()
                .map(value -> {
                    Object[] r = (Object[]) value;
                    return new Standing(((Number) r[0]).longValue(), (String) r[1], ((Number) r[2]).longValue(),
                            (String) r[3], ((Number) r[4]).longValue(), (String) r[5], ((Number) r[6]).longValue(),
                            (String) r[7], Instant.ofEpochMilli(((Number) r[8]).longValue()));
                }).toList();
    }

    public record Standing(long rank, String gameId, long chefUserId, String chefNickname,
            long serverUserId, String serverNickname, long score, String playMode, Instant completedAt) { }
}
