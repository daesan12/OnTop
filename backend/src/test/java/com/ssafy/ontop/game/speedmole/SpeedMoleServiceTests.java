package com.ssafy.ontop.game.speedmole;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
