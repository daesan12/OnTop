package com.ssafy.ontop.world.fitness;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Instant;
import java.time.ZoneId;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
public class JpaFitnessRewardStore implements FitnessRewardStore {
    public static final int DAILY_CAP = 300;
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private final WalletRepository wallets;
    private final WalletTransactionRepository transactions;

    public JpaFitnessRewardStore(WalletRepository wallets, WalletTransactionRepository transactions) {
        this.wallets = wallets;
        this.transactions = transactions;
    }

    @Override
    @Transactional
    public void grant(long userId, String leaseId, long interval, Instant now) {
        var wallet = wallets.findForUpdateByUserId(userId)
                .orElseThrow(() -> new IllegalStateException("운동 보상을 받을 지갑이 없습니다."));
        String key = "fitness:" + leaseId + ":" + interval;
        // 동일 지갑의 동시 지급도 잠금 이후 검사하여 잔액과 원장을 하나의 트랜잭션으로 확정한다.
        if (transactions.existsByIdempotencyKey(key)) {
            return;
        }
        var today = now.atZone(KST).toLocalDate();
        Instant from = today.atStartOfDay(KST).toInstant();
        Instant until = today.plusDays(1).atStartOfDay(KST).toInstant();
        // 운동 보상은 매 구간 정확히 1냥이며 미니게임 공통 500냥과 별도로 집계한다.
        long earned = transactions.countByWalletIdAndTransactionTypeAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(
                wallet.id(), "FITNESS_REWARD", from, until);
        if (earned >= DAILY_CAP) {
            return;
        }
        wallet.creditReward(1);
        transactions.save(WalletTransaction.fitnessReward(wallet.id(), key, now));
    }
}
