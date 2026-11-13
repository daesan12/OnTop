package com.ssafy.ontop.world.mobility;

import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MobilityWalletTests {
    private final WalletRepository wallets = mock(WalletRepository.class);
    private final WalletTransactionRepository transactions = mock(WalletTransactionRepository.class);
    private final MobilityWallet service = new MobilityWallet(wallets, transactions);
    private final Wallet wallet = Wallet.forSignup(42, Instant.EPOCH);

    @BeforeEach
    void 지갑_준비() {
        ReflectionTestUtils.setField(wallet, "id", 7L);
        when(wallets.findForUpdateByUserId(42)).thenReturn(Optional.of(wallet));
    }

    @Test
    void 같은_대여_구간_재요청은_한_번만_차감한다() {
        when(transactions.existsByIdempotencyKey("mobility:7:lease:1")).thenReturn(false, true);

        assertThat(service.charge(42, "lease", 1, 2)).isEqualTo(MobilityWallet.Payment.PAID);
        assertThat(service.charge(42, "lease", 1, 2)).isEqualTo(MobilityWallet.Payment.ALREADY_PAID);

        assertThat(wallet.balance()).isEqualTo(98);
        verify(transactions).save(any(WalletTransaction.class));
    }

    @Test
    void 예약_잔액을_제외하면_부족한_경우_차감하지_않는다() {
        wallet.reserveGameEntry(99, Instant.EPOCH);

        assertThat(service.charge(42, "lease", 1, 2)).isEqualTo(MobilityWallet.Payment.INSUFFICIENT);

        assertThat(wallet.balance()).isEqualTo(100);
        assertThat(wallet.reserved()).isEqualTo(99);
        verify(transactions, never()).save(any(WalletTransaction.class));
    }
}
