package com.ssafy.ontop.world.fitness;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Instant;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

@Repository
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
public class JpaFitnessRewardStore implements FitnessRewardStore {
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
        wallet.creditReward(1);
        transactions.save(WalletTransaction.fitnessReward(wallet.id(), key, now));
    }
}
