package com.ssafy.ontop.ranking.repository;

import jakarta.persistence.EntityManager;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Profile("db")
public class ParkBalanceRankingRepository {
    static final String TOP_TEN_SQL = """
            SELECT place, user_id, nickname, coin_balance
            FROM (
                SELECT RANK() OVER (ORDER BY w.balance DESC) AS place,
                       u.id AS user_id, u.nickname, w.balance AS coin_balance,
                       w.updated_at AS changed_at
                FROM wallets w
                JOIN users u ON u.id = w.user_id
                WHERE u.deleted_at IS NULL
            ) standings
            ORDER BY coin_balance DESC, changed_at ASC, user_id ASC
            LIMIT 10
            """;

    private final EntityManager entities;

    public ParkBalanceRankingRepository(EntityManager entities) {
        this.entities = entities;
    }

    @Transactional(readOnly = true)
    public List<BalanceStanding> findTopTen() {
        List<?> rows = entities.createNativeQuery(TOP_TEN_SQL, Object[].class).getResultList();
        return rows.stream().map(value -> {
            Object[] row = (Object[]) value;
            return new BalanceStanding(((Number) row[0]).longValue(), ((Number) row[1]).longValue(),
                    (String) row[2], ((Number) row[3]).longValue());
        }).toList();
    }

    public record BalanceStanding(long rank, long userId, String nickname, long coinBalance) {
    }
}
