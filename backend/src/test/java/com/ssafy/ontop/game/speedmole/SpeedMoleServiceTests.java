package com.ssafy.ontop.game.speedmole;

import com.ssafy.ontop.minigame.service.MoleTargets;
import com.ssafy.ontop.minigame.telemetry.MoleTimingAudit;
import com.ssafy.ontop.minigame.telemetry.MoleTimingSignals;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Collections;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class SpeedMoleServiceTests {
    private final Instant now = Instant.parse("2030-01-01T00:01:03Z");
    private SpeedMoleRepository repository;
    private SpeedMoleService service;
    private SpeedMoleRewards rewards;
    @BeforeEach void setup() {
        repository = mock(SpeedMoleRepository.class);
        var tx = mock(PlatformTransactionManager.class);
        when(tx.getTransaction(any())).thenReturn(new SimpleTransactionStatus());
        rewards = mock(SpeedMoleRewards.class);
        when(rewards.lock(anyLong())).thenAnswer(call -> com.ssafy.ontop.wallet.domain.Wallet.forSignup(call.getArgument(0),now));
        when(repository.latestId(anyLong())).thenReturn(7L);
        service = new SpeedMoleService(repository,tx,Clock.fixed(now,ZoneOffset.UTC),new SecureRandom(),rewards);
    }
    private SpeedMoleRepository.Row active(long elapsed) { return new SpeedMoleRepository.Row(7,42,1,1,"ACTIVE",now.minusMillis(elapsed),null,null,null,null); }
    @Test void completes_only_after_server_deadline_and_replays_instead_of_accepting_a_score() {
        when(repository.lock(42,7)).thenReturn(active(60000));
        var result = service.complete(42,7,List.of(new SpeedMoleRules.Tap(1,0)));
        assertThat(result.score()).isEqualTo(1);
        verify(repository).settle(7,new SpeedMoleRules.Score(1,1,0),now);
    }
    @Test
    @SuppressWarnings("unchecked")
    void 확정한_판의_타이밍_신호를_숨은_표적을_뺀_타격으로_한_번만_넘긴다() {
        var audit = mock(MoleTimingAudit.class);
        service.timingAudit(audit);
        when(repository.lock(42, 7)).thenReturn(active(60_000),
                new SpeedMoleRepository.Row(7, 42, 1, 1, "SETTLED", now.minusSeconds(60), now, 2, 2, 0));
        var hidden = new MoleTargets("speed-mole", 7, 1).hiddenIds(8).iterator().next();
        var taps = List.of(new SpeedMoleRules.Tap(1, 0), new SpeedMoleRules.Tap(3, 100),
                new SpeedMoleRules.Tap(4, 150, hidden), new SpeedMoleRules.Tap(5, 200));

        service.complete(42, 7, taps);
        service.complete(42, 7, taps);

        var signals = org.mockito.ArgumentCaptor.forClass(java.util.function.Supplier.class);
        verify(audit).settled(eq("speed-mole"), eq(42L), eq(7L), eq(1), signals.capture(), eq(now));
        verifyNoMoreInteractions(audit);
        var value = (MoleTimingSignals.Signals) signals.getValue().get();
        assertThat(value.segments()).first().isEqualTo(new MoleTimingSignals.Segment(2, 100, 0,
                new MoleTimingSignals.Pace(3, 3, 100, false)));
    }

    @Test
    @ExtendWith(OutputCaptureExtension.class)
    void 숨은_표적은_점수와_실수에_포함하지_않고_재시도에도_한_번만_기록한다(CapturedOutput output) {
        when(repository.start(eq(42L), eq("round-1"), anyLong(), any())).thenReturn(active(60_000));
        when(repository.lock(42, 7)).thenReturn(active(60_000),
                new SpeedMoleRepository.Row(7, 42, 1, 1, "SETTLED", now.minusSeconds(60), now, 5, 5, 0));
        when(rewards.grant(any(), eq(7L), eq(5), eq(now))).thenReturn(1);
        when(rewards.previous(any(), eq(7L))).thenReturn(1);
        var round = service.start(42, "round-1");
        assertThat(round.targets()).hasSize(8).allSatisfy(target -> assertThat(target.ids()).hasSize(2));
        assertThat(round.targets()).isEqualTo(service.start(42, "round-1").targets());
        var wrongRound = new MoleTargets("speed-mole", 8, 1);
        // 판 ID 7에서 구멍 1과 7의 실제 슬롯은 1이다.
        var taps = List.of(new SpeedMoleRules.Tap(7, 0, round.targets().get(7).ids().get(0)),
                new SpeedMoleRules.Tap(1, 0, round.targets().get(1).ids().get(1)),
                new SpeedMoleRules.Tap(3, 100, wrongRound.hiddenIds(8).iterator().next()),
                new SpeedMoleRules.Tap(5, 200), new SpeedMoleRules.Tap(6, 300), new SpeedMoleRules.Tap(0, 400));

        var result = service.complete(42, 7, taps);
        var retry = service.complete(42, 7, taps);

        assertThat(result.score()).isEqualTo(5);
        assertThat(result.misses()).isZero();
        assertThat(result.reward()).isEqualTo(1);
        assertThat(retry).isEqualTo(result);
        verify(repository).settle(7, new SpeedMoleRules.Score(5, 5, 0), now);
        assertThat(output.getOut()).containsOnlyOnce("mole_honeypot_hit game=speed-mole userId=42 roundId=7 hits=1");
    }

    @Test
    void 완료_타격에_null이_있으면_400을_반환한다() {
        when(repository.lock(42, 7)).thenReturn(active(60_000));

        assertThatThrownBy(() -> service.complete(42, 7, Collections.singletonList(null)))
                .isInstanceOfSatisfying(SpeedMoleException.class, error -> {
                    assertThat(error.status()).isEqualTo(400);
                    assertThat(error.code()).isEqualTo("SPEED_MOLE_INVALID_TAPS");
                });
        verify(repository, never()).settle(anyLong(), any(), any());
    }
    @Test void early_late_and_old_version_rounds_are_not_saved() {
        for (long elapsed : new long[]{-1,0,59999,90001}) {
            when(repository.lock(42,7)).thenReturn(active(elapsed));
            assertThatThrownBy(() -> service.complete(42,7,List.of())).isInstanceOf(SpeedMoleException.class);
        }
        when(repository.lock(42,7)).thenReturn(new SpeedMoleRepository.Row(7,42,1,2,"ACTIVE",now.minusSeconds(60),null,null,null,null));
        assertThatThrownBy(() -> service.complete(42,7,List.of())).isInstanceOf(SpeedMoleException.class);
        verify(repository,never()).settle(anyLong(),any(),any());
    }
    @Test void duplicate_completion_returns_the_already_committed_result_without_scoring_again() {
        when(repository.lock(42,7)).thenReturn(new SpeedMoleRepository.Row(7,42,1,1,"SETTLED",now.minusSeconds(60),now,12,12,0));
        assertThat(service.complete(42,7,null).score()).isEqualTo(12);
        verify(repository,never()).settle(anyLong(),any(),any());
    }
    @Test void missing_and_other_users_round_is_not_visible() {
        when(repository.lock(43,7)).thenThrow(new SpeedMoleException(404,"SPEED_MOLE_ROUND_NOT_FOUND","missing"));
        assertThatThrownBy(() -> service.complete(43,7,List.of())).isInstanceOf(SpeedMoleException.class);
        verify(repository,never()).settle(anyLong(),any(),any());
    }
    @Test void malformed_start_key_does_not_create_a_row() {
        for (String key : new String[]{null,"","a b","x".repeat(65)}) assertThatThrownBy(() -> service.start(42,key)).isInstanceOf(SpeedMoleException.class);
        verify(repository,never()).start(anyLong(),any(),anyLong(),any());
    }
    @Test void pagination_rejects_unbounded_requests() {
        for (int[] page : new int[][]{{0,0},{101,0},{20,-1},{20,10001}}) assertThatThrownBy(() -> service.rankings(42,page[0],page[1])).isInstanceOf(SpeedMoleException.class);
        verify(repository,never()).ranked(anyInt(),anyInt());
    }
    @Test void superseded_unfinished_round_cannot_pay_but_a_settled_retry_only_reads_previous_receipt() {
        when(repository.latestId(42)).thenReturn(8L);
        when(repository.lock(42,7)).thenReturn(active(60000));
        assertThatThrownBy(() -> service.complete(42,7,List.of())).isInstanceOf(SpeedMoleException.class);
        verify(rewards,never()).grant(any(),anyLong(),anyInt(),any());
        when(repository.lock(42,7)).thenReturn(new SpeedMoleRepository.Row(7,42,1,1,"SETTLED",now.minusSeconds(60),now,120,120,0));
        when(rewards.previous(any(),eq(7L))).thenReturn(3);
        assertThat(service.complete(42,7,null).reward()).isEqualTo(3);
        verify(rewards,never()).grant(any(),anyLong(),anyInt(),any());
    }
}
