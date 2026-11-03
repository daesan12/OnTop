package com.ssafy.ontop.admin.walletgrant.service;

import com.ssafy.ontop.admin.walletgrant.AdminWalletGrantException;
import com.ssafy.ontop.admin.walletgrant.domain.AdminWalletGrantBatch;
import com.ssafy.ontop.admin.walletgrant.dto.AdminWalletGrantExecuteRequest;
import com.ssafy.ontop.admin.walletgrant.dto.AdminWalletGrantPreviewRequest;
import com.ssafy.ontop.admin.walletgrant.repository.AdminWalletGrantRepository;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AdminWalletGrantServiceTests {
    private static final Instant NOW = Instant.parse("2026-11-03T08:00:00Z");
    private UserRepository users;
    private WalletRepository wallets;
    private WalletTransactionRepository ledger;
    private AdminWalletGrantRepository grants;
    private AdminWalletGrantService service;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        wallets = mock(WalletRepository.class);
        ledger = mock(WalletTransactionRepository.class);
        grants = mock(AdminWalletGrantRepository.class);
        service = new AdminWalletGrantService(users, wallets, ledger, grants, transactions(),
                Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void 미리보기는_활성_회원과_지갑을_대조하고_총액을_계산한다() {
        when(users.countByDeletedAtIsNull()).thenReturn(3L);
        when(wallets.countForActiveMembers()).thenReturn(3L);

        var result = service.preview(7, new AdminWalletGrantPreviewRequest(100, "출시 기념"));

        assertThat(result.recipientCount()).isEqualTo(3);
        assertThat(result.missingWalletCount()).isZero();
        assertThat(result.totalAmount()).isEqualTo(300);
        assertThat(result.executable()).isTrue();
    }

    @Test
    void 지갑이_없는_회원이_있으면_미리보기에서_실행_불가로_표시한다() {
        when(users.countByDeletedAtIsNull()).thenReturn(3L);
        when(wallets.countForActiveMembers()).thenReturn(2L);

        var result = service.preview(7, new AdminWalletGrantPreviewRequest(100, "출시 기념"));

        assertThat(result.missingWalletCount()).isOne();
        assertThat(result.executable()).isFalse();
    }

    @Test
    void 실행은_모든_지갑을_잠그고_잔액과_원장과_감사_기록을_저장한다() {
        UUID requestId = UUID.fromString("d0bb7009-0580-498d-ae90-95b092347947");
        User first = user(7);
        User second = user(8);
        Wallet firstWallet = wallet(11, 7, 100, 200);
        Wallet secondWallet = wallet(12, 8, 150, 250);
        WalletTransaction firstEntry = ledgerEntry(31);
        WalletTransaction secondEntry = ledgerEntry(32);
        when(grants.findBatch(requestId)).thenReturn(Optional.empty());
        when(users.findAllActiveForAdminGrant()).thenReturn(List.of(first, second));
        when(wallets.findForUpdateByUserIds(List.of(7L, 8L))).thenReturn(List.of(firstWallet, secondWallet));
        when(grants.insertBatch(requestId, 7, 100, "출시 기념", 2, 200, NOW)).thenReturn(21L);
        when(ledger.saveAndFlush(any(WalletTransaction.class))).thenReturn(firstEntry, secondEntry);

        var result = service.execute(7, new AdminWalletGrantExecuteRequest(requestId, 100, " 출시 기념 ", 2));

        assertThat(result.batchId()).isEqualTo(21);
        assertThat(result.recipientCount()).isEqualTo(2);
        assertThat(result.totalAmount()).isEqualTo(200);
        verify(firstWallet).creditAdminGrant(100, NOW);
        verify(secondWallet).creditAdminGrant(100, NOW);
        verify(grants).insertEntry(21, 7, 31, 100, 200);
        verify(grants).insertEntry(21, 8, 32, 150, 250);
    }

    @Test
    void 같은_요청_ID와_내용을_재요청하면_기존_결과만_반환한다() {
        UUID requestId = UUID.fromString("875d2cc4-c3f5-40a0-ae4c-637b9e9daeda");
        var saved = new AdminWalletGrantBatch(21, requestId, 7, 100, "출시 기념", 2, 200, NOW);
        when(grants.findBatch(requestId)).thenReturn(Optional.of(saved));

        var result = service.execute(7, new AdminWalletGrantExecuteRequest(requestId, 100, "출시 기념", 2));

        assertThat(result.batchId()).isEqualTo(21);
        verify(users, never()).findAllActiveForAdminGrant();
        verify(ledger, never()).saveAndFlush(any());
    }

    @Test
    void 미리보기_이후_대상_인원이_달라지면_실행을_거절한다() {
        UUID requestId = UUID.fromString("60632c71-7693-4144-88aa-26136a387ee6");
        User first = user(7);
        User second = user(8);
        when(grants.findBatch(requestId)).thenReturn(Optional.empty());
        when(users.findAllActiveForAdminGrant()).thenReturn(List.of(first, second));

        assertThatThrownBy(() -> service.execute(7,
                new AdminWalletGrantExecuteRequest(requestId, 100, "출시 기념", 3)))
                .isInstanceOf(AdminWalletGrantException.class)
                .satisfies(error -> assertThat(((AdminWalletGrantException) error).code())
                        .isEqualTo("ADMIN_WALLET_GRANT_TARGET_CHANGED"));
        verify(wallets, never()).findForUpdateByUserIds(any());
    }

    private User user(long id) {
        User user = mock(User.class);
        when(user.getId()).thenReturn(id);
        return user;
    }

    private Wallet wallet(long id, long userId, long before, long after) {
        Wallet wallet = mock(Wallet.class);
        when(wallet.id()).thenReturn(id);
        when(wallet.userId()).thenReturn(userId);
        when(wallet.balance()).thenReturn(before, after);
        return wallet;
    }

    private WalletTransaction ledgerEntry(long id) {
        WalletTransaction transaction = mock(WalletTransaction.class);
        when(transaction.id()).thenReturn(id);
        return transaction;
    }

    private PlatformTransactionManager transactions() {
        return new PlatformTransactionManager() {
            @Override
            public TransactionStatus getTransaction(TransactionDefinition definition) {
                return new SimpleTransactionStatus();
            }

            @Override
            public void commit(TransactionStatus status) {
            }

            @Override
            public void rollback(TransactionStatus status) {
            }
        };
    }
}
