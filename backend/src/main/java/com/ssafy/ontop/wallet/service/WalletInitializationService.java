package com.ssafy.ontop.wallet.service;

import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletInitializationGuard;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Profile("db")
public class WalletInitializationService {

    private final UserRepository users;
    private final WalletRepository wallets;
    private final WalletTransactionRepository transactions;
    private final WalletInitializationGuard guard;
    private final Clock clock;

    public WalletInitializationService(UserRepository users, WalletRepository wallets,
            WalletTransactionRepository transactions, WalletInitializationGuard guard,
            @Qualifier("oauthClock") Clock clock) {
        this.users = users;
        this.wallets = wallets;
        this.transactions = transactions;
        this.guard = guard;
        this.clock = clock;
    }

    // REQUIRED: 온보딩의 User/Wallet/원장/Refresh 저장은 같은 트랜잭션에서 커밋한다.
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public Result initializeActiveMember(long userId) {
        // 없는 지갑 행의 gap lock 대신, 항상 존재하는 회원 행을 먼저 잠근다.
        var member = users.findForAuthenticationById(userId);
        if (member.isEmpty() || member.get().getDeletedAt() != null) {
            return Result.INACTIVE;
        }
        if (wallets.findByUserId(userId).isPresent()) {
            // 최초 지급 원장이 없어도 기존 잔액/예약액을 추정하거나 추가 지급하지 않는다.
            return Result.PRESERVED;
        }
        if (transactions.existsByIdempotencyKey(WalletTransaction.signupBonusKey(userId))) {
            throw new DataIntegrityViolationException("WALLET_INITIALIZATION_REVIEW_REQUIRED: 최초 지급 이력이 존재합니다.");
        }
        guard.verifyNoReferences(userId);
        var now = clock.instant();
        Wallet wallet = wallets.saveAndFlush(Wallet.forSignup(userId, now));
        transactions.saveAndFlush(WalletTransaction.signupBonus(wallet.id(), userId, now));
        return Result.CREATED;
    }

    public enum Result { CREATED, PRESERVED, INACTIVE }
}
