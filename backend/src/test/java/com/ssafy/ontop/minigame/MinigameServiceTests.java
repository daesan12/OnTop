package com.ssafy.ontop.minigame;

import com.ssafy.ontop.minigame.domain.BungeoppangProfile;
import com.ssafy.ontop.minigame.domain.BungeoppangRecord;
import com.ssafy.ontop.minigame.domain.MinigameSession;
import com.ssafy.ontop.minigame.repository.MinigameRepository;
import com.ssafy.ontop.minigame.service.MinigameException;
import com.ssafy.ontop.minigame.service.MinigameService;
import com.ssafy.ontop.minigame.dto.MinigameStatusResponse;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.BeanUtils;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MinigameServiceTests {
    private final MinigameRepository repository = mock(MinigameRepository.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private final Instant now = Instant.parse("2026-10-23T00:00:00.123Z");
    private final MinigameService service = new MinigameService(repository, manager, Clock.fixed(now, ZoneOffset.UTC));
    private final java.util.List<Integer> heats = Collections.nCopies(64, 100);
    private Wallet wallet;
    private MinigameSession session;
    private BungeoppangRecord record;

    @BeforeEach
    void fixture() {
        when(manager.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        wallet = BeanUtils.instantiateClass(Wallet.class);
        ReflectionTestUtils.setField(wallet, "id", 1L);
        ReflectionTestUtils.setField(wallet, "balance", 100L);
        ReflectionTestUtils.setField(wallet, "reserved", 10L);
        session = new MinigameSession(101, now.minusSeconds(65));
        ReflectionTestUtils.setField(session, "id", 901L);
        record = new BungeoppangRecord(901, heats.toString(), true);
        when(repository.lockWallet(101)).thenReturn(Optional.of(wallet));
        when(repository.session(101, 901, true)).thenReturn(Optional.of(session));
        when(repository.record(901)).thenReturn(Optional.of(record));
        when(repository.profile(101)).thenReturn(new BungeoppangProfile(101));
    }

    @Test
    void 검증후_한번만_지급하고_재요청에는_처음_결과를_돌려준다() {
        var first = service.complete(101, 901, BungeoppangFixtures.sevenGolden(heats));
        assertThat(first).isEqualTo(service.complete(101, 901, BungeoppangFixtures.body("{\"log\":[]}")));
        assertThat(first.score()).isEqualTo(86);
        assertThat(first.rewardAmount()).isEqualTo(17);
        assertThat(wallet.balance()).isEqualTo(117);
        assertThat(wallet.reserved()).isEqualTo(10);
        assertThat(repository.profile(101).seenTips()).isEqualTo("GOLD,START");
        verify(repository, times(1)).persist(any(WalletTransaction.class));
    }

    @Test
    void v2_완료는_커밋할_이용_상태_해제를_한번만_알린다() {
        var activityEvents = new java.util.ArrayList<com.ssafy.ontop.minigame.service.MinigameActivityChanged>();
        var withEvents = new MinigameService(repository, manager, Clock.fixed(now, ZoneOffset.UTC), 10, false,
                activityEvents::add);

        var first = withEvents.complete(101, 901, BungeoppangFixtures.sevenGolden(heats));
        withEvents.complete(101, 901, BungeoppangFixtures.body("{\"log\":[]}"));

        assertThat(first.status()).isEqualTo("COMPLETED");
        assertThat(activityEvents).containsExactly(
                new com.ssafy.ontop.minigame.service.MinigameActivityChanged(101, 901, null));
    }

    @Test
    void 오늘_998냥이면_2냥만_지급하고_KST_날짜로_조회한다() {
        when(repository.earned(eq(101L), any(), any())).thenReturn(998L);
        var result = service.complete(101, 901, BungeoppangFixtures.sevenGolden(heats));
        assertThat(result.coinsCalculated()).isEqualTo(17);
        assertThat(result.coinsGranted()).isEqualTo(2);
        assertThat(result.todayEarned()).isEqualTo(1000);
        assertThat(result.capReached()).isTrue();
        verify(repository).earned(101, Instant.parse("2026-10-22T15:00:00Z"),
                Instant.parse("2026-10-23T15:00:00Z"));
    }

    @Test
    void 상한이면_지급없이도_정상완료한다() {
        when(repository.earned(eq(101L), any(), any())).thenReturn(1000L);
        assertThat(service.complete(101, 901, BungeoppangFixtures.sevenGolden(heats)).coinsGranted()).isZero();
        assertThat(session.status()).isEqualTo("COMPLETED");
        verify(repository, never()).persist(any(WalletTransaction.class));
    }

    @Test
    void 거부한_기록은_저장하고_다른_기록으로_재시도해도_처음_거부를_유지한다() {
        var invalid = BungeoppangFixtures.body("{\"log\":[{\"slot\":0,\"action\":\"TURN\",\"t\":0}]}");
        assertThatThrownBy(() -> service.complete(101, 901, invalid)).isInstanceOfSatisfying(MinigameException.class,
                e -> assertThat(e.detail()).isEqualTo("ACTION_STATE_MISMATCH"));
        assertThat(session.status()).isEqualTo("INVALID");
        assertThatThrownBy(() -> service.complete(101, 901, BungeoppangFixtures.sevenGolden(heats)))
                .isInstanceOfSatisfying(MinigameException.class, e -> assertThat(e.index()).isZero());
        assertThat(wallet.balance()).isEqualTo(100);
    }

    @Test
    void 너무이른_요청은_재시도가능하고_10분지난_세션은_종료한다() {
        ReflectionTestUtils.setField(session, "startedAt", now.minusSeconds(59));
        assertThatThrownBy(() -> service.complete(101, 901, BungeoppangFixtures.body("{\"log\":[]}")))
                .isInstanceOfSatisfying(MinigameException.class, e -> assertThat(e.code()).isEqualTo("TOO_EARLY"));
        assertThat(session.status()).isEqualTo("PLAYING");
        ReflectionTestUtils.setField(session, "startedAt", now.minusSeconds(600));
        assertThatThrownBy(() -> service.complete(101, 901, BungeoppangFixtures.body("{\"log\":[]}")))
                .isInstanceOfSatisfying(MinigameException.class, e -> assertThat(e.code()).isEqualTo("GAME_NOT_ACTIVE"));
        assertThat(session.status()).isEqualTo("INVALID");
    }

    @Test
    void 타인세션_포기세션_구버전세션은_지급하지_않는다() {
        when(repository.session(101, 901, true)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.complete(101, 901, BungeoppangFixtures.body("{\"log\":[]}")))
                .isInstanceOfSatisfying(MinigameException.class, e -> assertThat(e.status()).isEqualTo(404));
        when(repository.session(101, 901, true)).thenReturn(Optional.of(session));
        session.abandon(now);
        assertThatThrownBy(() -> service.complete(101, 901, BungeoppangFixtures.body("{\"log\":[]}")))
                .isInstanceOfSatisfying(MinigameException.class,
                        e -> assertThat(e.code()).isEqualTo("MINIGAME_ALREADY_ABANDONED"));
        when(repository.record(901)).thenReturn(Optional.empty());
        assertThatThrownBy(() -> service.complete(101, 901, BungeoppangFixtures.body("{\"log\":[]}")))
                .isInstanceOfSatisfying(MinigameException.class,
                        e -> assertThat(e.code()).isEqualTo("RULES_VERSION_MISMATCH"));
    }

    @Test
    void V111이전_v2_세션은_replay_record가_없어도_기존_상태를_조회한다() {
        when(repository.record(901)).thenReturn(Optional.empty());

        Object response = service.loadSession(101, 901, false);

        assertThat(response).isInstanceOfSatisfying(MinigameStatusResponse.class, status -> {
            assertThat(status.minigameSessionId()).isEqualTo("901");
            assertThat(status.status()).isEqualTo("PLAYING");
            assertThat(status.startedAt()).isEqualTo(now.minusSeconds(65));
        });
    }
}
