package com.ssafy.ontop.wallet.service;

import com.ssafy.ontop.user.domain.CharacterGender;
import com.ssafy.ontop.user.domain.LoginProvider;
import com.ssafy.ontop.user.domain.User;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletInitializationGuard;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class WalletInitializationServiceTests {

    private final UserRepository users = mock(UserRepository.class);
    private final WalletRepository wallets = mock(WalletRepository.class);
    private final WalletTransactionRepository transactions = mock(WalletTransactionRepository.class);
    private final WalletInitializationGuard guard = mock(WalletInitializationGuard.class);
    private final Instant now = Instant.parse("2026-10-23T00:00:00.123Z");
    private final WalletInitializationService service = new WalletInitializationService(users, wallets,
            transactions, guard, Clock.fixed(now, ZoneOffset.UTC));

    @BeforeEach
    void setup() {
        when(users.findForAuthenticationById(1L)).thenReturn(Optional.of(
                new User(LoginProvider.SSAFY, "fixture", "지갑검증", CharacterGender.MALE)));
    }

    @Test
    void 활성회원의_지갑과_최초100코인_원장을_저장한다() {
        when(wallets.saveAndFlush(any())).thenAnswer(call -> {
            Wallet wallet = call.getArgument(0);
            assertThat(wallet.balance()).isEqualTo(100);
            assertThat(wallet.reserved()).isZero();
            ReflectionTestUtils.setField(wallet, "id", 7L);
            return wallet;
        });

        assertThat(service.initializeActiveMember(1)).isEqualTo(WalletInitializationService.Result.CREATED);

        verify(guard).verifyNoReferences(1);
        verify(transactions).saveAndFlush(org.mockito.ArgumentMatchers.argThat(transaction ->
                ReflectionTestUtils.getField(transaction, "walletId").equals(7L)
                        && ReflectionTestUtils.getField(transaction, "balanceDelta").equals(100L)
                        && ReflectionTestUtils.getField(transaction, "reservedDelta").equals(0L)
                        && ReflectionTestUtils.getField(transaction, "transactionType").equals("SIGNUP_BONUS")
                        && ReflectionTestUtils.getField(transaction, "idempotencyKey").equals("signup:1")));
    }

    @Test
    void 기존지갑은_지급원장이_없어도_보존하고_다시지급하지_않는다() {
        when(wallets.findByUserId(1)).thenReturn(Optional.of(Wallet.forSignup(1, now)));

        assertThat(service.initializeActiveMember(1)).isEqualTo(WalletInitializationService.Result.PRESERVED);

        verifyNoInteractions(transactions, guard);
    }

    @Test
    void 탈퇴회원과_없는회원은_지급하지_않는다() {
        var member = users.findForAuthenticationById(1L).orElseThrow();
        member.deactivate(now);
        assertThat(service.initializeActiveMember(1)).isEqualTo(WalletInitializationService.Result.INACTIVE);
        assertThat(service.initializeActiveMember(2)).isEqualTo(WalletInitializationService.Result.INACTIVE);
        verifyNoInteractions(wallets, transactions, guard);
    }

    @Test
    void 지갑없이_최초지급키가_남은경우_재지급하지_않는다() {
        when(transactions.existsByIdempotencyKey("signup:1")).thenReturn(true);

        assertThatThrownBy(() -> service.initializeActiveMember(1))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("WALLET_INITIALIZATION_REVIEW_REQUIRED");
        verifyNoInteractions(guard);
    }

    @Test
    void 가입지갑은_밀리초시각과_고정금액을_사용한다() {
        Wallet wallet = Wallet.forSignup(1, now.plusNanos(999));
        assertThat(wallet.balance() - wallet.reserved()).isEqualTo(100);
        assertThat(ReflectionTestUtils.getField(wallet, "updatedAt")).isEqualTo(now);
        assertThatThrownBy(() -> Wallet.forSignup(0, now)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> WalletTransaction.signupBonus(0, 1, now))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
