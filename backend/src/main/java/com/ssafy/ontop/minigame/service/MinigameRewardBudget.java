package com.ssafy.ontop.minigame.service;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.ZoneId;

/** 미니게임 공통 KST 하루 상한. 지급자는 같은 트랜잭션에서 먼저 회원 지갑을 잠근다. */
public final class MinigameRewardBudget {
    public static final int DAILY_CAP = 1000;
    public static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private MinigameRewardBudget() {
    }

    /** 보드게임 정산·가입 보너스·입장료는 합산하지 않고 실제 지급된 미니게임 보상만 센다. */
    public static long earned(EntityManager entities, long userId, Instant from, Instant until) {
        Number total = (Number) entities.createNativeQuery("""
                SELECT COALESCE(SUM(t.balance_delta), 0)
                FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id
                WHERE w.user_id = :user AND t.balance_delta > 0
                  AND t.transaction_type IN ('MINIGAME_REWARD', 'JUMP_GATE_REWARD', 'SKEWER_REWARD', 'MOLE_REWARD')
                  AND t.created_at >= :from AND t.created_at < :until
                """).setParameter("user", userId).setParameter("from", from).setParameter("until", until)
                .getSingleResult();
        return total.longValue();
    }

    public static int grant(long calculated, long earned) {
        return (int) Math.min(Math.max(0, calculated), Math.max(0, DAILY_CAP - earned));
    }
}
