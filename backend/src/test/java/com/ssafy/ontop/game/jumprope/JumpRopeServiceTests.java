package com.ssafy.ontop.game.jumprope;

import com.ssafy.ontop.wallet.domain.Wallet;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.SimpleTransactionStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class JumpRopeServiceTests {
    private static final Instant START = Instant.parse("2026-11-12T00:00:03Z");
    private static final Instant EXPIRY = START.plusSeconds(95);
    private static final List<Integer> TWO_PERFECTS = List.of(728335, 1723348);
    private final JumpRopeRepository repository = mock(JumpRopeRepository.class);
    private final Clock clock = mock(Clock.class);
    private final PlatformTransactionManager manager = mock(PlatformTransactionManager.class);
    private final SecureRandom random = mock(SecureRandom.class);
    private final JumpRopeRewards rewards = mock(JumpRopeRewards.class);
    private final JumpRopeService service = new JumpRopeService(repository, manager, clock, random, rewards);

    @BeforeEach void configure() {
        when(manager.getTransaction(any())).thenAnswer(invocation -> new SimpleTransactionStatus());
        when(repository.lockUser(101)).thenReturn(true);
        when(repository.lockRound(101, 1)).thenReturn(Optional.of(row(null, null)));
        when(repository.latestId(101)).thenReturn(1L);
        when(random.nextInt()).thenReturn(-1);
    }

    @Test void starts_with_server_times_and_reuses_the_original_window() {
        Instant issued = START.minusSeconds(3);
        when(clock.instant()).thenReturn(issued, issued.plusSeconds(1));
        when(repository.start(eq(101L), eq("same-key"), eq(4294967295L), any(), any())).thenReturn(row(null, null));

        var first = service.start(101, "same-key");
        var again = service.start(101, "same-key");
        assertThat(first).isEqualTo(new JumpRopeDtos.Round("1", 4294967295L, 1, issued, START, EXPIRY, 60_000));
        assertThat(again).isEqualTo(new JumpRopeDtos.Round("1", first.seed(), 1, issued.plusSeconds(1), START, EXPIRY, 60_000));
        verify(repository).start(101L, "same-key", 4294967295L, START, EXPIRY);
        verifyNoInteractions(rewards);
    }

    @Test void rejects_bad_expired_finished_and_superseded_start_keys() {
        assertCode(() -> service.start(101, "two keys"), 400, "JUMP_ROPE_INVALID_KEY");
        when(clock.instant()).thenReturn(EXPIRY.plusNanos(1), START, START);
        when(repository.start(eq(101L), eq("old"), anyLong(), any(), any()))
                .thenReturn(row(null, null), row(result(START), "hash"), row(null, null));
        assertCode(() -> service.start(101, "old"), 409, "JUMP_ROPE_ROUND_EXPIRED");
        assertCode(() -> service.start(101, "old"), 409, "JUMP_ROPE_ROUND_FINISHED");
        when(repository.latestId(101)).thenReturn(2L);
        assertCode(() -> service.start(101, "old"), 409, "JUMP_ROPE_ROUND_SUPERSEDED");
    }

    @Test void settles_early_only_after_the_replayed_minimum_elapsed_time() {
        Instant boundary = START.plusNanos(7_658_564_000L);
        when(clock.instant()).thenReturn(boundary.minusNanos(1), boundary);
        assertCode(() -> service.complete(101, 1, TWO_PERFECTS), 409, "JUMP_ROPE_NOT_FINISHED");
        verify(repository, never()).settle(anyLong(), any(), any(), any());

        var settled = service.complete(101, 1, TWO_PERFECTS);
        assertThat(settled).isEqualTo(result(START.plusMillis(7658)));
        verify(repository).settle(eq(1L), eq(JumpRopeRules.replay(TWO_PERFECTS)), eq(settled.completedAt()), any());
        verify(rewards, never()).grant(any(), anyLong(), anyInt(), any());
    }

    @Test void same_submission_is_idempotent_and_different_input_conflicts_until_expiry() {
        Instant now = START.plusSeconds(8);
        when(clock.instant()).thenReturn(now, EXPIRY, EXPIRY, EXPIRY.plusNanos(1));
        var settled = service.complete(101, 1, TWO_PERFECTS);
        var hash = ArgumentCaptor.forClass(String.class);
        verify(repository).settle(eq(1L), any(), eq(now), hash.capture());
        assertThat(hash.getValue()).matches("[0-9a-f]{64}");
        when(repository.lockRound(101, 1)).thenReturn(Optional.of(row(settled, hash.getValue())));
        when(repository.latestId(101)).thenReturn(2L);
        assertThat(service.complete(101, 1, List.copyOf(TWO_PERFECTS))).isEqualTo(settled);
        assertCode(() -> service.complete(101, 1, List.of()), 409, "JUMP_ROPE_INPUT_CONFLICT");
        assertCode(() -> service.complete(101, 1, TWO_PERFECTS), 409, "JUMP_ROPE_ROUND_EXPIRED");
        verify(repository, times(1)).settle(anyLong(), any(), any(), any());
    }

    @Test void refuses_foreign_expired_superseded_and_too_early_complete() {
        when(clock.instant()).thenReturn(START, EXPIRY.plusSeconds(1), START.plusSeconds(8), START.plusSeconds(59));
        when(repository.lockUser(202)).thenReturn(true);
        when(repository.lockRound(202, 1)).thenReturn(Optional.empty());
        assertCode(() -> service.complete(202, 1, List.of()), 404, "JUMP_ROPE_ROUND_NOT_FOUND");
        assertCode(() -> service.complete(101, 1, List.of()), 409, "JUMP_ROPE_ROUND_EXPIRED");
        when(repository.latestId(101)).thenReturn(2L, 1L);
        assertCode(() -> service.complete(101, 1, List.of()), 409, "JUMP_ROPE_ROUND_SUPERSEDED");
        assertCode(() -> service.complete(101, 1, JumpRopeRulesTests.perfectRound()), 409, "JUMP_ROPE_NOT_FINISHED");
        verify(repository, never()).settle(anyLong(), any(), any(), any());
        verify(rewards, never()).grant(any(), anyLong(), anyInt(), any());
    }

    @Test void full_time_result_requires_a_wallet_for_a_payable_score_and_returns_the_granted_amount() {
        var now = START.plusSeconds(60);
        var inputs = JumpRopeRulesTests.perfectRound();
        when(clock.instant()).thenReturn(now);
        assertCode(() -> service.complete(101, 1, inputs), 503, "JUMP_ROPE_UNAVAILABLE");
        verify(repository, never()).settle(anyLong(), any(), any(), any());

        var wallet = mock(Wallet.class);
        when(rewards.lockWallet(101)).thenReturn(Optional.of(wallet));
        when(rewards.grant(wallet, 1, 39, now)).thenReturn(3);
        var settled = service.complete(101, 1, inputs);
        assertThat(settled).isEqualTo(new JumpRopeDtos.Result("1", 1, 1965, new JumpRopeDtos.Counts(66, 0, 0), "time", now, 3));
        var hash = ArgumentCaptor.forClass(String.class);
        verify(repository).settle(eq(1L), eq(JumpRopeRules.replay(inputs)), eq(now), hash.capture());
        when(repository.lockRound(101, 1)).thenReturn(Optional.of(row(settled.withReward(0), hash.getValue())));
        when(rewards.previous(wallet, 1)).thenReturn(3);
        assertThat(service.complete(101, 1, inputs)).isEqualTo(settled);
        verify(rewards).grant(wallet, 1, 39, now);

        when(rewards.previous(wallet, 1)).thenReturn(0);
        assertThat(service.complete(101, 1, inputs).reward()).isZero();
        verify(rewards).grant(wallet, 1, 39, now);
    }

    @Test void pagination_is_bounded_and_personal_best_is_independent_of_the_page() {
        assertCode(() -> service.rankings(101, 11, 0), 400, "JUMP_ROPE_INVALID_PAGE");
        assertCode(() -> service.rankings(101, 1, -1), 400, "JUMP_ROPE_INVALID_PAGE");
        var me = new JumpRopeDtos.PersonalBest(12, "나", 15);
        when(clock.instant()).thenReturn(START);
        when(repository.participants()).thenReturn(15L);
        when(repository.ranked(10, 0)).thenReturn(List.of(new JumpRopeDtos.Item(1, "첫째", 45)));
        when(repository.me(101)).thenReturn(me);
        var page = service.rankings(101, 10, 0);
        assertThat(page.me()).isEqualTo(me);
        assertThat(page.period()).isEqualTo("ALL_TIME");
        assertThat(page.hasMore()).isTrue();
    }

    private static JumpRopeRepository.Row row(JumpRopeDtos.Result result, String hash) {
        return new JumpRopeRepository.Row(1, 4294967295L, 1, START, EXPIRY, result, hash);
    }

    private static JumpRopeDtos.Result result(Instant at) {
        return new JumpRopeDtos.Result("1", 1, 45, new JumpRopeDtos.Counts(2, 0, 3), "missLimit", at, 0);
    }

    private static void assertCode(Runnable call, int status, String code) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(JumpRopeException.class, error -> {
            assertThat(error.status()).isEqualTo(status);
            assertThat(error.code()).isEqualTo(code);
        });
    }
}
