package com.ssafy.ontop.game.jumprope;

import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Optional;

final class JumpRopeRewards {
    private static final int POINTS_PER_COIN = 50;

    private final EntityManager entities;
    private final WalletRepository wallets;
    private final WalletTransactionRepository ledger;

    JumpRopeRewards(EntityManager entities, WalletRepository wallets, WalletTransactionRepository ledger) {
        this.entities = entities;
        this.wallets = wallets;
        this.ledger = ledger;
    }

    static int calculated(JumpRopeRules.Result replay) {
        return replay.reason() == JumpRopeRules.EndReason.TIME ? replay.score() / POINTS_PER_COIN : 0;
    }

    Optional<Wallet> lockWallet(long userId) {
        return wallets.findForUpdateByUserId(userId);
    }

    int grant(Wallet wallet, long roundId, int calculated, Instant completedAt) {
        var zone = MinigameRewardBudget.KST;
        var date = LocalDate.ofInstant(completedAt, zone);
        long earned = MinigameRewardBudget.earned(entities, wallet.userId(), date.atStartOfDay(zone).toInstant(),
                date.plusDays(1).atStartOfDay(zone).toInstant());
        int granted = MinigameRewardBudget.grant(calculated, earned);
        if (granted > 0) {
            wallet.creditReward(granted);
            ledger.saveAndFlush(WalletTransaction.minigameReward(wallet.id(), granted, key(roundId), completedAt));
        }
        return granted;
    }

    int previous(Wallet wallet, long roundId) {
        return ledger.findByWalletIdAndIdempotencyKey(wallet.id(), key(roundId))
                .map(entry -> Math.toIntExact(entry.balanceDelta())).orElse(0);
    }

    static String key(long roundId) { return "jump-rope:reward:" + roundId; }
}
