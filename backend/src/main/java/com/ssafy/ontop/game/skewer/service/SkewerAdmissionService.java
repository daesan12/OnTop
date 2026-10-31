package com.ssafy.ontop.game.skewer.service;

import com.ssafy.ontop.game.skewer.dto.SkewerAdmissionResponse;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import java.time.Instant;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** 점수 보상 없는 1인 게임의 이용권 구매. 판정 엔진과 분리해 공통 지갑·원장만 사용한다. */
public class SkewerAdmissionService {
    public static final int ENTRY_FEE = 10;
    private static final int STARTS_PER_MINUTE = 10;

    private final WalletRepository wallets;
    private final WalletTransactionRepository ledger;
    private final TransactionTemplate transactions;
    private final Clock clock;

    public SkewerAdmissionService(WalletRepository wallets, WalletTransactionRepository ledger,
            PlatformTransactionManager manager, Clock clock) {
        this.wallets = wallets;
        this.ledger = ledger;
        this.transactions = new TransactionTemplate(manager);
        this.transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.clock = clock;
    }

    public SkewerAdmissionResponse start(long userId, String requestKey) {
        if (userId <= 0 || requestKey == null || !requestKey.matches("[A-Za-z0-9_-]{1,64}")) {
            throw new SkewerAdmissionException(400, "SKEWER_INVALID_REQUEST", "이용 요청을 확인해 주세요.");
        }
        return transactions.execute(status -> {
            Wallet wallet = wallets.findForUpdateByUserId(userId).orElseThrow(() ->
                    new SkewerAdmissionException(409, "WALLET_NOT_READY", "지갑을 확인한 뒤 다시 시작해 주세요."));
            String key = "skewer:" + userId + ":" + requestKey;
            var previous = ledger.findByWalletIdAndIdempotencyKey(wallet.id(), key);
            if (previous.isPresent()) {
                return receipt(previous.get().id(), wallet);
            }
            Instant now = clock.instant();
            if (ledger.countByWalletIdAndTransactionTypeAndCreatedAtGreaterThanEqual(
                    wallet.id(), "MINIGAME_ENTRY_FEE", now.minusSeconds(60)) >= STARTS_PER_MINUTE) {
                throw new SkewerAdmissionException(429, "SKEWER_TOO_MANY_STARTS", "잠시 후 다시 시작해 주세요.");
            }
            if (wallet.balance() - wallet.reserved() < ENTRY_FEE) {
                throw new SkewerAdmissionException(409, "INSUFFICIENT_COINS", "엽전이 부족해요. 한 판에 10냥이 필요해요.");
            }
            wallet.debit(ENTRY_FEE);
            var entry = ledger.saveAndFlush(WalletTransaction.minigameEntryFee(wallet.id(), ENTRY_FEE, key, now));
            return receipt(entry.id(), wallet);
        });
    }

    private SkewerAdmissionResponse receipt(long transactionId, Wallet wallet) {
        return new SkewerAdmissionResponse("skewer-" + transactionId, "skewer", ENTRY_FEE,
                wallet.balance() - wallet.reserved());
    }
}
