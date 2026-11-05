package com.ssafy.ontop.world.fitness;

import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JpaFitnessRewardStoreTests {
    private static final Instant NOW = Instant.parse("2026-11-03T14:59:59.999Z");
    private static final Instant FROM = Instant.parse("2026-11-02T15:00:00Z");
    private static final Instant UNTIL = Instant.parse("2026-11-03T15:00:00Z");
    private final WalletRepository wallets = mock(WalletRepository.class);
    private final WalletTransactionRepository transactions = mock(WalletTransactionRepository.class);
    private final JpaFitnessRewardStore store = new JpaFitnessRewardStore(wallets, transactions);
    private final Wallet wallet = Wallet.forSignup(101, NOW);

    @BeforeEach
    void 준비한다() {
        ReflectionTestUtils.setField(wallet, "id", 1L);
        wallet.reserveGameEntry(10, NOW);
        when(wallets.findForUpdateByUserId(101)).thenReturn(Optional.of(wallet));
    }

    @ParameterizedTest
    @ValueSource(longs = {0, 299})
    void 하루_300냥_미만이면_지갑잠금후_운동원장만_집계하고_1냥을_지급한다(long earned) {
        when(transactions.countByWalletIdAndTransactionTypeAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(
                1, "FITNESS_REWARD", FROM, UNTIL)).thenReturn(earned);

        store.grant(101, "visit", 1, NOW);

        assertThat(wallet.balance()).isEqualTo(101);
        assertThat(wallet.reserved()).isEqualTo(10);
        var order = inOrder(wallets, transactions);
        order.verify(wallets).findForUpdateByUserId(101);
        order.verify(transactions).existsByIdempotencyKey("fitness:visit:1");
        order.verify(transactions).countByWalletIdAndTransactionTypeAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(
                1, "FITNESS_REWARD", FROM, UNTIL);
        order.verify(transactions).save(any(WalletTransaction.class));
    }

    @ParameterizedTest
    @ValueSource(longs = {300, 301})
    void 오늘_300냥_이상이면_잔액과_원장을_추가하지_않는다(long earned) {
        when(transactions.countByWalletIdAndTransactionTypeAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(
                1, "FITNESS_REWARD", FROM, UNTIL)).thenReturn(earned);

        store.grant(101, "visit", 1, NOW);

        assertThat(wallet.balance()).isEqualTo(100);
        verify(transactions, never()).save(any());
    }

    @Test
    void 한국_자정이면_다음날_범위로_지급한다() {
        store.grant(101, "visit", 2, UNTIL);

        verify(transactions).countByWalletIdAndTransactionTypeAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(
                1, "FITNESS_REWARD", UNTIL, Instant.parse("2026-11-04T15:00:00Z"));
        assertThat(wallet.balance()).isEqualTo(101);
    }

    @Test
    void 이미_지급한_구간은_다시_지급하지_않는다() {
        when(transactions.existsByIdempotencyKey("fitness:visit:1")).thenReturn(true);

        store.grant(101, "visit", 1, NOW);

        assertThat(wallet.balance()).isEqualTo(100);
        verify(transactions, never()).save(any());
    }

    @Test
    void 수입조회는_한국날짜의_운동원장만_읽으며_지급하지_않는다() {
        when(wallets.findByUserId(101)).thenReturn(Optional.of(wallet));
        when(transactions.countByWalletIdAndTransactionTypeAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(
                1, "FITNESS_REWARD", FROM, UNTIL)).thenReturn(299L);

        assertThat(store.earnedToday(101, NOW)).isEqualTo(299);
        store.earnedToday(101, UNTIL);

        verify(transactions).countByWalletIdAndTransactionTypeAndCreatedAtGreaterThanEqualAndCreatedAtLessThan(
                1, "FITNESS_REWARD", UNTIL, Instant.parse("2026-11-04T15:00:00Z"));
        verify(wallets, never()).findForUpdateByUserId(101);
        verify(transactions, never()).save(any());
        assertThat(wallet.balance()).isEqualTo(100);
    }
}
