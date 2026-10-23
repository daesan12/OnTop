package com.ssafy.ontop.wallet.service;

import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.dto.WalletBalanceResponse;
import com.ssafy.ontop.wallet.exception.WalletQueryException;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Instant;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.support.StaticListableBeanFactory;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionSystemException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

class WalletQueryServiceTests {

    private WalletRepository wallets;
    private WalletQueryService service;

    @BeforeEach
    void setup() {
        wallets = mock(WalletRepository.class);
        var beans = new StaticListableBeanFactory();
        beans.addBean("wallets", wallets);
        service = new WalletQueryService(beans.getBeanProvider(WalletRepository.class),
                beans.getBeanProvider(WalletTransactionRepository.class));
    }

    @ParameterizedTest
    @CsvSource({"100,0,100", "100,30,70", "100,100,0", "0,0,0",
        "9223372036854775807,1,9223372036854775806"})
    void 전체와_예약과_사용가능잔액을_long으로_조회하고_저장하지_않는다(long balance, long reserved, long available) {
        Wallet wallet = wallet(balance, reserved);
        when(wallets.findByUserId(42)).thenReturn(Optional.of(wallet));

        assertThat(service.findBalance(42)).isEqualTo(new WalletBalanceResponse(balance, reserved, available));

        assertThat(wallet.balance()).isEqualTo(balance);
        assertThat(wallet.reserved()).isEqualTo(reserved);
        verify(wallets).findByUserId(42);
        verifyNoMoreInteractions(wallets);
    }

    @Test
    void 지갑이_없으면_0으로_위장하지_않고_409이다() {
        fails(WalletQueryException.Error.NOT_READY);
        verify(wallets).findByUserId(42);
        verifyNoMoreInteractions(wallets);
    }

    @Test
    void DB없는_프로필도_구성되며_조회는_안전한_503이다() {
        var beans = new StaticListableBeanFactory();
        service = new WalletQueryService(beans.getBeanProvider(WalletRepository.class),
                beans.getBeanProvider(WalletTransactionRepository.class));
        fails(WalletQueryException.Error.STORAGE);
    }

    @Test
    void DB예외_원문을_노출하지_않는다() {
        when(wallets.findByUserId(42)).thenThrow(new DataAccessResourceFailureException("private-db-detail"));
        fails(WalletQueryException.Error.STORAGE);
    }

    @Test
    void 읽기트랜잭션_장애도_503이다() {
        when(wallets.findByUserId(42)).thenThrow(new TransactionSystemException("private-transaction-detail"));
        fails(WalletQueryException.Error.STORAGE);
    }

    @ParameterizedTest
    @CsvSource({"-1,0", "100,-1", "100,101"})
    void 잘못된_레거시잔액을_정상응답으로_반환하지_않는다(long balance, long reserved) {
        when(wallets.findByUserId(42)).thenReturn(Optional.of(wallet(balance, reserved)));
        fails(WalletQueryException.Error.STORAGE);
    }

    private Wallet wallet(long balance, long reserved) {
        Wallet wallet = Wallet.forSignup(42, Instant.parse("2026-10-23T00:00:00Z"));
        ReflectionTestUtils.setField(wallet, "balance", balance);
        ReflectionTestUtils.setField(wallet, "reserved", reserved);
        return wallet;
    }

    private void fails(WalletQueryException.Error expected) {
        assertThatThrownBy(() -> service.findBalance(42)).isInstanceOfSatisfying(WalletQueryException.class, failure -> {
            assertThat(failure.error()).isEqualTo(expected);
            assertThat(failure.getMessage()).doesNotContain("private-");
            assertThat(failure.getCause()).isNull();
        });
    }
}
