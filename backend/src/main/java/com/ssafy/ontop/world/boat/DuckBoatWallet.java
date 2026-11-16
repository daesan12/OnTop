package com.ssafy.ontop.world.boat;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Instant;
import java.util.function.BooleanSupplier;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 오리배 1회 탑승 요금. 탑승(출발) 순간 이용권마다 한 번만 차감한다. */
@Service
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
public class DuckBoatWallet {
    public enum Payment { PAID, INSUFFICIENT, ALREADY_PAID, CANCELLED, FAILED }

    static final class PaymentCancelled extends RuntimeException { }

    private final WalletRepository wallets;
    private final WalletTransactionRepository transactions;

    public DuckBoatWallet(WalletRepository wallets, WalletTransactionRepository transactions) {
        this.wallets = wallets;
        this.transactions = transactions;
    }

    @Transactional(timeout = 4)
    public Payment charge(long account, String leaseId, int price, BooleanSupplier authorizeCommit) {
        var wallet = wallets.findForUpdateByUserId(account).orElse(null);
        if (wallet == null) {
            return Payment.INSUFFICIENT;
        }
        String key = "duck-boat:" + wallet.id() + ":" + leaseId;
        if (transactions.existsByIdempotencyKey(key)) {
            return Payment.ALREADY_PAID;
        }
        if (wallet.balance() - wallet.reserved() < price) {
            return Payment.INSUFFICIENT;
        }
        Instant now = Instant.now();
        wallet.debit(price, now);
        transactions.saveAndFlush(WalletTransaction.duckBoatFee(wallet.id(), price, key, now));
        // 하차가 결정을 먼저 가져가면 여기서 던져 잔액과 원장을 함께 되돌린다.
        if (!authorizeCommit.getAsBoolean()) {
            throw new PaymentCancelled();
        }
        return Payment.PAID;
    }
}
