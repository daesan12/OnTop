package com.ssafy.ontop.game.speedmole;

import com.ssafy.ontop.game.mole.domain.MoleRules;
import com.ssafy.ontop.game.mole.repository.MoleRepository;
import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import jakarta.persistence.EntityManager;
import java.time.Instant;
import java.time.LocalDate;

/** Reuses the mole-family ledger and the existing shared KST daily budget. No new wallet SQL/schema. */
public class SpeedMoleRewards {
    private final EntityManager entities;
    private final MoleRepository wallets;
    public SpeedMoleRewards(EntityManager entities) {
        this.entities = entities;
        wallets = new MoleRepository(entities);
    }
    public Wallet lock(long user) {
        return wallets.lockWallet(user).orElseThrow(() ->
                new SpeedMoleException(409, "WALLET_NOT_READY", "지갑을 확인한 뒤 다시 시작해 주세요."));
    }
    public long earned(long user, Instant now) {
        var today = LocalDate.ofInstant(now, MinigameRewardBudget.KST);
        return wallets.earned(user, today.atStartOfDay(MinigameRewardBudget.KST).toInstant(),
                today.plusDays(1).atStartOfDay(MinigameRewardBudget.KST).toInstant());
    }
    public int grant(Wallet wallet, long roundId, int score, Instant now) {
        int granted = MinigameRewardBudget.grant(score / MoleRules.POINTS_PER_COIN, earned(wallet.userId(), now));
        if (granted > 0) {
            wallet.creditReward(granted);
            wallets.persist(WalletTransaction.moleReward(wallet.id(), granted, key(roundId), now));
            wallets.flush();
        }
        return granted;
    }
    public int previous(Wallet wallet, long roundId) {
        Number amount = (Number) entities.createNativeQuery("SELECT COALESCE(SUM(balance_delta),0) FROM wallet_transactions "
                        + "WHERE wallet_id=:wallet AND idempotency_key=:key AND transaction_type='MOLE_REWARD'")
                .setParameter("wallet", wallet.id()).setParameter("key", key(roundId)).getSingleResult();
        return amount.intValue();
    }
    private static String key(long id) { return "mole:reward:speed:" + id; }
}
