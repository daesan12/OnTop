package com.ssafy.ontop.game.spotdifference;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
@ConditionalOnProperty(name = "ontop.minigames.enabled", havingValue = "true")
class SpotDifferenceRewards {
    private final EntityManager entities;
    private final WalletRepository wallets;
    private final WalletTransactionRepository ledger;

    SpotDifferenceRewards(EntityManager entities, WalletRepository wallets, WalletTransactionRepository ledger) {
        this.entities = entities;
        this.wallets = wallets;
        this.ledger = ledger;
    }

    @Transactional(readOnly = true)
    public Budget status(long userId) {
        return new Budget(earned(userId, Instant.now()), MinigameRewardBudget.DAILY_CAP);
    }

    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Receipt settle(long userId, UUID id, int calculated) {
        var wallet = wallets.findForUpdateByUserId(userId).orElseThrow();
        var key = "spot-difference:reward:" + id;
        var previous = ledger.findByWalletIdAndIdempotencyKey(wallet.id(), key);
        var now = Instant.now();
        long earned = earned(userId, now);
        if (previous.isPresent()) {
            return new Receipt(calculated, Math.toIntExact(previous.get().balanceDelta()), earned);
        }
        int granted = MinigameRewardBudget.grant(calculated, earned);
        if (granted > 0) {
            wallet.creditReward(granted, now);
            ledger.saveAndFlush(WalletTransaction.minigameReward(wallet.id(), granted, key, now));
        }
        return new Receipt(calculated, granted, earned + granted);
    }

    private long earned(long userId, Instant now) {
        var zone = MinigameRewardBudget.KST;
        var date = LocalDate.ofInstant(now, zone);
        return MinigameRewardBudget.earned(entities, userId, date.atStartOfDay(zone).toInstant(),
                date.plusDays(1).atStartOfDay(zone).toInstant());
    }

    record Budget(long todayEarned, int dailyCap) { }
    record Receipt(int calculated, int granted, long todayEarned) { }
}
