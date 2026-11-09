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
    @org.springframework.beans.factory.annotation.Value("${ontop.gacha.enabled:false}")
    private boolean includeEquipment;

    public ParkBalanceRankingRepository(EntityManager entities) {
        this.entities = entities;
    }

    @Transactional(readOnly = true)
    public List<BalanceStanding> findTopTen() {
        String value=includeEquipment?"COALESCE(ga.equipment_value,0)":"0";
        String total="(w.balance+"+value+")";
        String sql="""
                SELECT place,user_id,nickname,coin_balance,equipment_value,total_assets FROM (
                    SELECT RANK() OVER (ORDER BY %s DESC) place,u.id user_id,u.nickname,w.balance coin_balance,
                           %s equipment_value,%s total_assets,w.updated_at changed_at
                    FROM wallets w JOIN users u ON u.id=w.user_id
                    %s
                    WHERE u.deleted_at IS NULL
                ) standings ORDER BY total_assets DESC,changed_at ASC,user_id ASC LIMIT 10
                """.formatted(total,value,total,includeEquipment?com.ssafy.ontop.gacha.GachaAssetSql.JOIN:"");
        List<?> rows = entities.createNativeQuery(sql, Object[].class).getResultList();
        return rows.stream().map(result -> {
            Object[] row = (Object[]) result;
            return new BalanceStanding(((Number) row[0]).longValue(), ((Number) row[1]).longValue(),
                    (String) row[2], ((Number) row[3]).longValue(),((Number) row[4]).longValue(),((Number) row[5]).longValue());
        }).toList();
    }

    public record BalanceStanding(long rank, long userId, String nickname, long coinBalance, long equipmentValue, long totalAssets) {
        public BalanceStanding(long rank,long userId,String nickname,long coinBalance) { this(rank,userId,nickname,coinBalance,0,coinBalance); }
    }
}
