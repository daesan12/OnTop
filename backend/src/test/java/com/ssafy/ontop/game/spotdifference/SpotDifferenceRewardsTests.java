package com.ssafy.ontop.game.spotdifference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import jakarta.persistence.EntityManager;
import jakarta.persistence.Query;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class SpotDifferenceRewardsTests {
    private static final long USER_ID = 10L;
    private static final long WALLET_ID = 20L;
    private final EntityManager entities = mock(EntityManager.class);
    private final WalletRepository wallets = mock(WalletRepository.class);
    private final WalletTransactionRepository ledger = mock(WalletTransactionRepository.class);
    private final Wallet wallet = mock(Wallet.class);
    private final SpotDifferenceRewards rewards = new SpotDifferenceRewards(entities, wallets, ledger);
    private final UUID id = UUID.randomUUID();

    @Test
    void 다른_미니게임_보상으로_한도가_찼으면_엽전을_지급하지_않는다() {
        setup(1000);
        assertThat(rewards.settle(USER_ID, id, 108))
                .isEqualTo(new SpotDifferenceRewards.Receipt(108, 0, 1000));
        verify(wallets).findForUpdateByUserId(USER_ID);
        verify(wallet, never()).creditReward(anyLong(), any());
        verify(ledger, never()).saveAndFlush(any());
    }

    @Test
    void 공통_일일_잔여_한도만_지급하고_같은_판의_재호출은_이전_지급을_반환한다() {
        var query = setup(995);
        var key = "spot-difference:reward:" + id;
        assertThat(rewards.settle(USER_ID, id, 108))
                .isEqualTo(new SpotDifferenceRewards.Receipt(108, 5, 1000));
        var entry = ArgumentCaptor.forClass(WalletTransaction.class);
        verify(ledger).saveAndFlush(entry.capture());
        assertThat(entry.getValue().balanceDelta()).isEqualTo(5);
        when(ledger.findByWalletIdAndIdempotencyKey(WALLET_ID, key)).thenReturn(Optional.of(entry.getValue()));
        when(query.getSingleResult()).thenReturn(1000L);
        assertThat(rewards.settle(USER_ID, id, 108))
                .isEqualTo(new SpotDifferenceRewards.Receipt(108, 5, 1000));
        verify(wallet).creditReward(eq(5L), any(Instant.class));
        verify(ledger).saveAndFlush(any());
    }

    @Test
    void 보상_상태_조회는_지갑을_수정하지_않는다() {
        setup(27);
        assertThat(rewards.status(USER_ID)).isEqualTo(new SpotDifferenceRewards.Budget(27, 1000));
        verifyNoInteractions(wallets, ledger, wallet);
    }

    private Query setup(long earned) {
        var query = mock(Query.class);
        when(entities.createNativeQuery(anyString())).thenReturn(query);
        when(query.setParameter(anyString(), any())).thenReturn(query);
        when(query.getSingleResult()).thenReturn(earned);
        when(wallets.findForUpdateByUserId(USER_ID)).thenReturn(Optional.of(wallet));
        when(wallet.id()).thenReturn(WALLET_ID);
        return query;
    }
}
