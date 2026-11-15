package com.ssafy.ontop.world.balloon;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import com.ssafy.ontop.world.map.PreparedParkMap;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

class BalloonFareServiceTests {
    private static final Instant NOW = Instant.parse("2026-11-15T00:00:00Z");
    private static final UUID REQUEST = UUID.fromString("2ad95a0d-9dcf-4139-99b8-18f4da51d1fc");
    private static final String LEDGER_KEY = "balloon:2:" + REQUEST;

    private final WalletRepository wallets = mock(WalletRepository.class);
    private final WalletTransactionRepository transactions = mock(WalletTransactionRepository.class);
    private final WorldChannelRegistry channels = mock(WorldChannelRegistry.class);
    private final Wallet wallet = Wallet.forSignup(123, NOW);
    private BalloonFareService service;

    @BeforeEach
    void 준비() throws Exception {
        var map = mock(WorldMapRuntime.class);
        var prepared = mock(PreparedParkMap.class);
        when(map.prepared()).thenReturn(Optional.of(prepared));
        when(prepared.constructionSites()).thenReturn(new ObjectMapper().readTree("""
                [{"id":"balloon","reachPosition":[-40,22.8,-54],"radius":2,"heightTolerance":1.4}]
                """));
        ReflectionTestUtils.setField(wallet, "id", 2L);
        when(wallets.findForUpdateByUserId(123)).thenReturn(Optional.of(wallet));
        when(channels.positionOf("123")).thenReturn(new WorldChannelRegistry.Position(1, -40, 22.8, -54, 0));
        service = new BalloonFareService(wallets, transactions, channels, map);
    }

    @Test
    void 승강장에서_잔액이_100냥이면_100냥을_차감하고_원장을_기록한다() {
        var entry = ArgumentCaptor.forClass(WalletTransaction.class);

        var receipt = service.buy(123, REQUEST);

        assertThat(receipt).isEqualTo(new BalloonFareService.Receipt(REQUEST, 100));
        assertThat(wallet.balance()).isZero();
        verify(transactions).save(entry.capture());
        assertThat(entry.getValue().balanceDelta()).isEqualTo(-100);
        assertThat(ReflectionTestUtils.getField(entry.getValue(), "idempotencyKey")).isEqualTo(LEDGER_KEY);
    }

    @Test
    void 이미_결제한_요청은_잔액이_0냥이어도_재차감하지_않는다() {
        wallet.debit(100, NOW);
        when(transactions.findByWalletIdAndIdempotencyKey(2, LEDGER_KEY))
                .thenReturn(Optional.of(WalletTransaction.balloonFare(2, 100, LEDGER_KEY, NOW)));

        var receipt = service.buy(123, REQUEST);

        assertThat(receipt.fee()).isEqualTo(100);
        assertThat(wallet.balance()).isZero();
        verify(transactions).findByWalletIdAndIdempotencyKey(2, LEDGER_KEY);
        verifyNoMoreInteractions(transactions);
    }

    @Test
    void 예약금을_뺀_잔액이_부족하면_차감하지_않는다() {
        wallet.reserveGameEntry(1, NOW);

        assertThatThrownBy(() -> service.buy(123, REQUEST))
                .isInstanceOfSatisfying(BalloonFareService.Rejected.class,
                        failure -> assertThat(failure.code()).isEqualTo("INSUFFICIENT_COINS"));
        assertThat(wallet.balance()).isEqualTo(100);
        assertThat(wallet.reserved()).isEqualTo(1);
    }

    @Test
    void 승강장과_높이가_다르면_결제를_거절한다() {
        when(channels.positionOf("123")).thenReturn(new WorldChannelRegistry.Position(1, -40, 8, -54, 0));

        assertThatThrownBy(() -> service.buy(123, REQUEST))
                .isInstanceOfSatisfying(BalloonFareService.Rejected.class,
                        failure -> assertThat(failure.code()).isEqualTo("BALLOON_STATION_REQUIRED"));
        verifyNoInteractions(wallets, transactions);
    }
}
