package com.ssafy.ontop.world.mobility;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Instant;
import java.util.function.BooleanSupplier;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile(RuntimeProfiles.PRODUCT_FEATURE_WITH_DB)
public class MobilityWallet {
    public enum Payment { PAID, INSUFFICIENT, ALREADY_PAID, CANCELLED, FAILED }

    static final class PaymentCancelled extends RuntimeException { }

    private final WalletRepository wallets;
    private final WalletTransactionRepository transactions;

    public MobilityWallet(WalletRepository wallets, WalletTransactionRepository transactions) {
        this.wallets = wallets;
        this.transactions = transactions;
    }

    @Transactional(timeout = 4)
    public Payment charge(long account, String leaseId, long second, int price, BooleanSupplier authorizeCommit) {
        var wallet = wallets.findForUpdateByUserId(account).orElse(null);
        if (wallet == null) {
            return Payment.INSUFFICIENT;
        }
        String key = "mobility:" + wallet.id() + ":" + leaseId + ":" + second;
        if (transactions.existsByIdempotencyKey(key)) {
            return Payment.ALREADY_PAID;
        }
        if (wallet.balance() - wallet.reserved() < price) {
            return Payment.INSUFFICIENT;
        }
        Instant now = Instant.now();
        wallet.debit(price, now);
        transactions.saveAndFlush(WalletTransaction.mobilityFee(wallet.id(), price, key, now));
        // The worker and dismount compete for this decision after the database writes have flushed.
        // Throwing here rolls back both the balance and the ledger entry when dismount won.
        if (!authorizeCommit.getAsBoolean()) {
            throw new PaymentCancelled();
        }
        return Payment.PAID;
    }
}
