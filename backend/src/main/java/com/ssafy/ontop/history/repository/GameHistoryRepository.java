package com.ssafy.ontop.history.repository;

import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.history.dto.GameHistoryPageRequest;
import com.ssafy.ontop.history.dto.GameHistoryPageResponse;
import com.ssafy.ontop.history.dto.GameStatsResponse;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

/** 팀원의 경기 저장 엔티티는 읽기만 한다. 조회당 한 SELECT이며 엔티티 그래프를 로딩하지 않는다. */
@Repository
@Profile("db")
public class GameHistoryRepository {
    private final EntityManager entities;

    public GameHistoryRepository(EntityManager entities) {
        this.entities = entities;
    }

    @Transactional(readOnly = true)
    public List<GameHistoryPageResponse.Item> findHistory(long userId, GameHistoryPageRequest request) {
        String jpql = """
                select s.id, s.gameCode, s.status, p.result, s.settlementStatus, s.endedAt
                from GameParticipant p, GameSession s
                where p.gameSessionId = s.id and p.userId = :userId
                  and s.status in :terminal and s.endedAt is not null
                """;
        if (request.cursor() != null) {
            jpql += " and s.id < :cursor";
        }
        if (request.gameCode() != null) {
            jpql += " and s.gameCode = :gameCode";
        }
        var query = entities.createQuery(jpql + " order by s.id desc", Object[].class)
                .setParameter("userId", userId)
                .setParameter("terminal", List.of(GameSession.Status.FINISHED, GameSession.Status.INVALID))
                .setMaxResults(request.size() + 1);
        if (request.cursor() != null) {
            query.setParameter("cursor", request.cursor());
        }
        if (request.gameCode() != null) {
            query.setParameter("gameCode", request.gameCode());
        }
        return query.getResultList().stream().map(row -> new GameHistoryPageResponse.Item(
                row[0].toString(), (String) row[1], row[2].toString(),
                row[3] == null ? null : row[3].toString(),
                row[4] == null ? null : row[4].toString(), (Instant) row[5])).toList();
    }

    @Transactional(readOnly = true)
    public List<GameStatsResponse.Item> findStats(long userId) {
        return entities.createQuery("""
                select s.gameCode,
                       sum(case when p.result = :win then 1L else 0L end),
                       sum(case when p.result = :lose then 1L else 0L end),
                       sum(case when p.result = :forfeit then 1L else 0L end),
                       sum(case when p.result = :draw then 1L else 0L end)
                from GameParticipant p, GameSession s
                where p.gameSessionId = s.id and p.userId = :userId
                  and s.status = :finished and s.endedAt is not null
                  and p.result in :results
                group by s.gameCode order by s.gameCode
                """, Object[].class)
                .setParameter("userId", userId).setParameter("finished", GameSession.Status.FINISHED)
                .setParameter("win", GameFinished.Result.WIN).setParameter("lose", GameFinished.Result.LOSE)
                .setParameter("forfeit", GameFinished.Result.FORFEIT).setParameter("draw", GameFinished.Result.DRAW)
                .setParameter("results", List.of(GameFinished.Result.values()))
                .getResultList().stream().map(row -> {
                    long wins = ((Number) row[1]).longValue();
                    long losses = ((Number) row[2]).longValue();
                    long forfeits = ((Number) row[3]).longValue();
                    long draws = ((Number) row[4]).longValue();
                    return new GameStatsResponse.Item((String) row[0], wins + losses + forfeits + draws,
                            wins, losses, forfeits, draws);
                }).toList();
    }
}
