package com.ssafy.ontop.minigame.service;

import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;

/** 미니게임 보상과 KST 일일 누계. 지급자는 같은 트랜잭션에서 먼저 회원 지갑을 잠근다. */
public final class MinigameRewardBudget {
    /** 응답의 0은 일일 지급 제한 없음을 뜻한다. 누계는 통계로만 사용한다. */
    public static final int DAILY_CAP = 0;
    public static final ZoneId KST = ZoneId.of("Asia/Seoul");

    private MinigameRewardBudget() {
    }

    /** 보드게임 정산·가입 보너스·입장료는 합산하지 않고 실제 지급된 미니게임 보상만 센다. */
    public static long earned(EntityManager entities, long userId, Instant from, Instant until) {
        Number total = (Number) entities.createNativeQuery("""
                SELECT COALESCE(SUM(t.balance_delta), 0)
                FROM wallet_transactions t JOIN wallets w ON w.id = t.wallet_id
                WHERE w.user_id = :user AND t.balance_delta > 0
                  AND t.transaction_type IN ('MINIGAME_REWARD', 'JUMP_GATE_REWARD', 'SKEWER_REWARD', 'MOLE_REWARD',
                      'GAME_RANK_REWARD')
                  AND t.created_at >= :from AND t.created_at < :until
                """).setParameter("user", userId).setParameter("from", from).setParameter("until", until)
                .getSingleResult();
        return total.longValue();
    }

    public static int grantToday(EntityManager entities, long userId, long calculated, Instant now) {
        LocalDate date = LocalDate.ofInstant(now, KST);
        return grant(calculated, earned(entities, userId, date.atStartOfDay(KST).toInstant(),
                date.plusDays(1).atStartOfDay(KST).toInstant()));
    }

    public static int grant(long calculated, long earned) {
        return Math.toIntExact(Math.max(0, calculated));
    }
}
