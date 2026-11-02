package com.ssafy.ontop.raffle.service;

import com.ssafy.ontop.raffle.RaffleException;
import com.ssafy.ontop.raffle.domain.RaffleNumberGenerator;
import com.ssafy.ontop.raffle.domain.RaffleRound;
import com.ssafy.ontop.raffle.domain.RaffleTicket;
import com.ssafy.ontop.raffle.repository.RaffleRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RaffleServiceTests {
    private static final Instant NOW = Instant.parse("2026-11-02T00:30:00Z");
    private RaffleRepository raffles;
    private WalletRepository wallets;
    private WalletTransactionRepository ledger;
    private RaffleNumberGenerator numbers;
    private RaffleService service;

    @BeforeEach
    void setUp() {
        raffles = mock(RaffleRepository.class);
        wallets = mock(WalletRepository.class);
        ledger = mock(WalletTransactionRepository.class);
        numbers = mock(RaffleNumberGenerator.class);
        service = new RaffleService(raffles, wallets, ledger, transactions(),
                Clock.fixed(NOW, ZoneOffset.UTC), numbers);
    }

    @Test
    void 판매_중이면_지갑을_잠그고_차감과_원장과_응모권을_한번만_저장한다() {
        RaffleRound round = round("OPEN", 10);
        Wallet wallet = mock(Wallet.class);
        WalletTransaction transaction = mock(WalletTransaction.class);
        when(raffles.lockRound(LocalDate.of(2026, 11, 2))).thenReturn(Optional.of(round));
        when(raffles.ticket(3, 7, "request-1")).thenReturn(Optional.empty());
        when(raffles.ticketCount(3, 7)).thenReturn(0);
        when(wallets.findForUpdateByUserId(7)).thenReturn(Optional.of(wallet));
        when(wallet.id()).thenReturn(9L);
        when(wallet.balance()).thenReturn(500L, 400L);
        when(wallet.reserved()).thenReturn(100L);
        when(raffles.usedNumbers(3)).thenReturn(Set.of(10, 20));
        when(numbers.unusedNumber(Set.of(10, 20))).thenReturn(3140);
        when(ledger.saveAndFlush(any(WalletTransaction.class))).thenReturn(transaction);
        when(transaction.id()).thenReturn(11L);
        when(raffles.insertTicket(3, 7, 3140, 100, 400, 11, "request-1", NOW)).thenReturn(13L);

        var result = service.purchase(7, "request-1");

        assertThat(result.ticketId()).isEqualTo(13);
        assertThat(result.ticketNumber()).isEqualTo(3140);
        assertThat(result.balanceAfter()).isEqualTo(400);
        assertThat(result.purchasedCount()).isOne();
        assertThat(result.remainingCount()).isEqualTo(9);
        verify(wallet).debit(100, NOW);
        verify(ledger).saveAndFlush(any(WalletTransaction.class));
    }

    @Test
    void 같은_멱등키를_재요청하면_기존_응모권을_반환하고_다시_차감하지_않는다() {
        RaffleRound round = round("OPEN", 10);
        RaffleTicket saved = new RaffleTicket(13, 3, 7, 3140, 100, 400, 11, "request-1", NOW);
        when(raffles.lockRound(LocalDate.of(2026, 11, 2))).thenReturn(Optional.of(round));
        when(raffles.ticket(3, 7, "request-1")).thenReturn(Optional.of(saved));
        when(raffles.ticketCount(3, 7)).thenReturn(1);

        var result = service.purchase(7, "request-1");

        assertThat(result.ticketId()).isEqualTo(13);
        assertThat(result.ticketNumber()).isEqualTo(3140);
        verify(wallets, never()).findForUpdateByUserId(anyLong());
        verify(ledger, never()).saveAndFlush(any());
    }

    @Test
    void 주간_구매_한도를_모두_사용하면_추가_구매를_거절한다() {
        when(raffles.lockRound(LocalDate.of(2026, 11, 2))).thenReturn(Optional.of(round("OPEN", 10)));
        when(raffles.ticket(anyLong(), anyLong(), anyString())).thenReturn(Optional.empty());
        when(raffles.ticketCount(3, 7)).thenReturn(10);

        assertThatThrownBy(() -> service.purchase(7, "request-11"))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_WEEKLY_LIMIT_REACHED"));
        verify(wallets, never()).findForUpdateByUserId(anyLong());
    }

    @Test
    void 예약금을_제외한_사용_가능_잔액이_가격보다_적으면_구매를_거절한다() {
        Wallet wallet = mock(Wallet.class);
        when(raffles.lockRound(LocalDate.of(2026, 11, 2))).thenReturn(Optional.of(round("OPEN", 10)));
        when(raffles.ticket(anyLong(), anyLong(), anyString())).thenReturn(Optional.empty());
        when(raffles.ticketCount(3, 7)).thenReturn(0);
        when(wallets.findForUpdateByUserId(7)).thenReturn(Optional.of(wallet));
        when(wallet.balance()).thenReturn(150L);
        when(wallet.reserved()).thenReturn(100L);

        assertThatThrownBy(() -> service.purchase(7, "request-1"))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("INSUFFICIENT_BALANCE"));
        verify(numbers, never()).unusedNumber(any());
    }

    private RaffleRound round(String status, int limit) {
        return new RaffleRound(3, LocalDate.of(2026, 11, 2),
                Instant.parse("2026-11-02T00:00:00Z"), Instant.parse("2026-11-08T15:00:00Z"),
                100, limit, status);
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
