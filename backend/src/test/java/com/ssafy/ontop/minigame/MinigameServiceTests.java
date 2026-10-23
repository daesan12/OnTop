package com.ssafy.ontop.minigame;

import com.ssafy.ontop.minigame.domain.MinigameSession;
import com.ssafy.ontop.minigame.repository.MinigameRepository;
import com.ssafy.ontop.minigame.service.MinigameException;
import com.ssafy.ontop.minigame.service.MinigameService;
import com.ssafy.ontop.minigame.service.VerifiedMinigameResultSource;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Optional;
import java.util.OptionalLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/** 저장소/트랜잭션 대역을 사용하는 서비스 계약 검사. 실제 롤백·행 잠금 검증과 구분한다. */
class MinigameServiceTests {
    private final MinigameRepository repository = mock(MinigameRepository.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private final VerifiedMinigameResultSource verified = mock(VerifiedMinigameResultSource.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<VerifiedMinigameResultSource> sources = mock(ObjectProvider.class);
    private final Clock clock = Clock.fixed(Instant.parse("2026-10-23T00:00:00.123456Z"), ZoneOffset.UTC);
    private final MinigameService service = new MinigameService(repository, manager, sources, clock);
    private Wallet wallet;
    private MinigameSession session;

    @BeforeEach
    void fixture() {
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        wallet = BeanUtils.instantiateClass(Wallet.class);
        ReflectionTestUtils.setField(wallet, "id", 1L);
        ReflectionTestUtils.setField(wallet, "balance", 100L);
        ReflectionTestUtils.setField(wallet, "reserved", 10L);
        session = new MinigameSession(101, clock.instant());
        ReflectionTestUtils.setField(session, "id", 901L);
        when(repository.lockWallet(101)).thenReturn(Optional.of(wallet));
        when(repository.session(101, 901, true)).thenReturn(Optional.of(session));
        when(sources.getIfAvailable()).thenReturn(verified);
    }

    @Test
    void 검증모듈없음과미검증결과는상태와돈을변경하지않는다() {
        when(sources.getIfAvailable()).thenReturn(null);
        assertNotVerified();
        when(sources.getIfAvailable()).thenReturn(verified);
        when(verified.findCompletedCount(101, 901)).thenReturn(OptionalLong.empty());
        assertNotVerified();
        assertThat(wallet.balance()).isEqualTo(100);
        assertThat(session.status()).isEqualTo("PLAYING");
        verify(repository, never()).persist(any());
    }

    @Test
    void 확정결과는예약금을유지하고한번만지급한다() {
        when(verified.findCompletedCount(101, 901)).thenReturn(OptionalLong.of(3));
        var first = service.complete(101, 901);
        assertThat(first).isEqualTo(service.complete(101, 901));
        assertThat(first.rewardAmount()).isEqualTo(2);
        assertThat(wallet.balance()).isEqualTo(102);
        assertThat(wallet.reserved()).isEqualTo(10);
        assertThat(session.endedAt()).isEqualTo(Instant.parse("2026-10-23T00:00:00.123Z"));
        verify(repository, times(1)).persist(any(WalletTransaction.class));
        verify(verified, times(1)).findCompletedCount(101, 901);
    }

    @Test
    void 타인세션과이미포기한세션은검증이나지급하지않는다() {
        when(repository.session(101, 901, true)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.complete(101, 901)).isInstanceOfSatisfying(MinigameException.class,
                error -> assertThat(error.code()).isEqualTo("MINIGAME_NOT_FOUND"));
        when(repository.session(101, 901, true)).thenReturn(Optional.of(session));
        service.abandon(101, 901);
        assertThatThrownBy(() -> service.complete(101, 901)).isInstanceOfSatisfying(MinigameException.class,
                error -> assertThat(error.code()).isEqualTo("MINIGAME_ALREADY_ABANDONED"));
        assertThat(wallet.balance()).isEqualTo(100);
        verifyNoInteractions(verified);
    }

    @Test
    void 미확정잔여정책과비정상검증개수는보상을만들지않는다() {
        for (long count : new long[]{1, 2, 4, 5, -1, 9007199254740992L}) {
            when(verified.findCompletedCount(101, 901)).thenReturn(OptionalLong.of(count));
            assertThatThrownBy(() -> service.complete(101, 901)).isInstanceOf(MinigameException.class);
        }
        assertThat(wallet.balance()).isEqualTo(100);
        assertThat(session.status()).isEqualTo("PLAYING");
        verify(repository, never()).persist(any());
    }

    @Test
    void 보유잔액오버플로우는완료로확정하지않는다() {
        ReflectionTestUtils.setField(wallet, "balance", Long.MAX_VALUE);
        when(verified.findCompletedCount(101, 901)).thenReturn(OptionalLong.of(3));
        assertThatThrownBy(() -> service.complete(101, 901)).isInstanceOf(ArithmeticException.class);
        assertThat(session.status()).isEqualTo("PLAYING");
        assertThat(wallet.balance()).isEqualTo(Long.MAX_VALUE);
    }

    private void assertNotVerified() {
        assertThatThrownBy(() -> service.complete(101, 901)).isInstanceOfSatisfying(MinigameException.class,
                error -> assertThat(error.code()).isEqualTo("MINIGAME_NOT_VERIFIED"));
    }
}
