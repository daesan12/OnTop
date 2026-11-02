package com.ssafy.ontop.game.skewer;

import com.ssafy.ontop.game.skewer.service.SkewerAdmissionService;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class SkewerAdmissionServiceTests {
    private final WalletRepository wallets = mock(WalletRepository.class);
    private final WalletTransactionRepository ledger = mock(WalletTransactionRepository.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private final Map<String, WalletTransaction> entries = new HashMap<>();
    private Wallet wallet;
    private SkewerAdmissionService service;

    @BeforeEach
    void 준비한다() {
        Instant now = Instant.parse("2026-10-31T00:00:00Z");
        wallet = Wallet.forSignup(101, now);
        ReflectionTestUtils.setField(wallet, "id", 11L);
        when(wallets.findForUpdateByUserId(101)).thenReturn(Optional.of(wallet));
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        when(ledger.findByWalletIdAndIdempotencyKey(anyLong(), anyString())).thenAnswer(call ->
                Optional.ofNullable(entries.get(call.getArgument(1))));
        when(ledger.saveAndFlush(any())).thenAnswer(call -> {
            WalletTransaction entry = call.getArgument(0);
            ReflectionTestUtils.setField(entry, "id", (long) entries.size() + 1);
            entries.put((String) ReflectionTestUtils.getField(entry, "idempotencyKey"), entry);
            return entry;
        });
        service = new SkewerAdmissionService(wallets, ledger, manager, Clock.fixed(now, ZoneOffset.UTC));
    }

    @Test
    void 한_판_이용료_10냥과_원장을_기록하고_예약금은_보존한다() {
        wallet.reserveGameEntry(20, Instant.now());

        var receipt = service.start(101, "round-1");

        assertThat(receipt.fee()).isEqualTo(10);
        assertThat(receipt.availableBalance()).isEqualTo(70);
        assertThat(wallet.balance()).isEqualTo(90);
        assertThat(wallet.reserved()).isEqualTo(20);
        WalletTransaction entry = entries.values().iterator().next();
        assertThat(ReflectionTestUtils.getField(entry, "transactionType")).isEqualTo("MINIGAME_ENTRY_FEE");
        assertThat(ReflectionTestUtils.getField(entry, "balanceDelta")).isEqualTo(-10L);
        assertThat(ReflectionTestUtils.getField(entry, "reservedDelta")).isEqualTo(0L);
    }

    @Test
    void 같은_키의_응답을_다시_확인해도_한번만_차감한다() {
        var first = service.start(101, "round-1");

        var second = service.start(101, "round-1");

        assertThat(second).isEqualTo(first);
        assertThat(wallet.balance()).isEqualTo(90);
        assertThat(entries).hasSize(1);
    }

    @Test
    void 재도전은_새_키로_별도의_10냥을_차감한다() {
        var first = service.start(101, "round-1");

        var retry = service.start(101, "round-2");

        assertThat(retry.id()).isNotEqualTo(first.id());
        assertThat(retry.availableBalance()).isEqualTo(80);
        assertThat(entries).hasSize(2);
    }

    @Test
    void 사용_가능_잔액이_부족하면_예약금을_쓰지_않는다() {
        wallet.reserveGameEntry(95, Instant.now());

        assertThatThrownBy(() -> service.start(101, "round-1")).hasMessageContaining("부족");

        assertThat(wallet.balance()).isEqualTo(100);
        assertThat(wallet.reserved()).isEqualTo(95);
        verify(ledger, never()).saveAndFlush(any());
    }

    @Test
    void 잘못된_키는_지갑에_접근하기_전에_거절한다() {
        assertThatThrownBy(() -> service.start(101, "not:a:valid:key")).hasMessageContaining("요청");

        verifyNoInteractions(wallets, ledger);
    }

    @Test
    void 과도한_새_구매는_막되_기존_영수증은_조회한다() {
        var first = service.start(101, "round-1");
        when(ledger.countByWalletIdAndTransactionTypeAndCreatedAtGreaterThanEqual(anyLong(), anyString(), any()))
                .thenReturn(10L);

        assertThatThrownBy(() -> service.start(101, "round-2")).hasMessageContaining("잠시");
        assertThat(service.start(101, "round-1").id()).isEqualTo(first.id());

        assertThat(wallet.balance()).isEqualTo(90);
    }
}
