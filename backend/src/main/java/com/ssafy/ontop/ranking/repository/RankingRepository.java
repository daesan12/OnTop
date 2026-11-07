package com.ssafy.ontop.ranking.repository;

import jakarta.persistence.EntityManager;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Profile("db")
public class RankingRepository {
    private final EntityManager entities;
    @org.springframework.beans.factory.annotation.Value("${ontop.gacha.enabled:false}")
    private boolean includeEquipment;

    public RankingRepository(EntityManager entities) {
        this.entities = entities;
    }

    @Transactional(readOnly = true)
    public List<Standing> findStandings(long userId, int limit) {
        // 순위 계산 후 자른다. TOP 밖 본인도 같은 SELECT의 DB 스냅샷으로 읽는다.
        String value = includeEquipment ? "COALESCE(ga.equipment_value,0)" : "0";
        String total = "(w.balance+" + value + ")";
        String join = includeEquipment ? com.ssafy.ontop.gacha.GachaAssetSql.JOIN : "";
        List<?> rows = entities.createNativeQuery("""
                SELECT place, row_position, user_id, nickname, coin_balance, equipment_value, total_assets
                FROM (
                    SELECT RANK() OVER (ORDER BY %s DESC) AS place,
                           ROW_NUMBER() OVER (ORDER BY %s DESC, u.id ASC) AS row_position,
                           u.id AS user_id, u.nickname, w.balance AS coin_balance,
                           %s AS equipment_value, %s AS total_assets
                    FROM wallets w JOIN users u ON u.id = w.user_id
                    %s
                    WHERE u.deleted_at IS NULL
                ) standings
                WHERE row_position <= :limit OR user_id = :userId
                ORDER BY row_position
                """.formatted(total,total,value,total,join), Object[].class)
                .setParameter("limit", limit).setParameter("userId", userId).getResultList();
        return rows.stream().map(result -> {
            Object[] row = (Object[]) result;
            return new Standing(((Number) row[0]).longValue(), ((Number) row[1]).longValue(),
                    ((Number) row[2]).longValue(), (String) row[3], ((Number) row[4]).longValue(),
                    ((Number) row[5]).longValue(), ((Number) row[6]).longValue());
        }).toList();
    }

    public record Standing(long rank, long position, long userId, String nickname, long coinBalance,
                           long equipmentValue, long totalAssets) {
        public Standing(long rank,long position,long userId,String nickname,long coinBalance) {
            this(rank,position,userId,nickname,coinBalance,0,coinBalance);
        }
    }
}
