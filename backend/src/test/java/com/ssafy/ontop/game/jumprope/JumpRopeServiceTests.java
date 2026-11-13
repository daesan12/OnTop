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
    private final JumpRopeService service = new JumpRopeService(repository, manager, clock, random, rewards, 1);

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
        when(repository.start(eq(101L), eq("same-key"), eq(4294967295L), eq(1), any(), any())).thenReturn(row(null, null));

        var first = service.start(101, "same-key");
        var again = service.start(101, "same-key");
        assertThat(first).isEqualTo(new JumpRopeDtos.Round("1", 4294967295L, 1, issued, START, EXPIRY, 60_000));
        assertThat(again).isEqualTo(new JumpRopeDtos.Round("1", first.seed(), 1, issued.plusSeconds(1), START, EXPIRY, 60_000));
        verify(repository).start(101L, "same-key", 4294967295L, 1, START, EXPIRY);
        verifyNoInteractions(rewards);
    }

    @Test void rejects_bad_expired_finished_and_superseded_start_keys() {
        assertCode(() -> service.start(101, "two keys"), 400, "JUMP_ROPE_INVALID_KEY");
        when(clock.instant()).thenReturn(EXPIRY.plusNanos(1), START, START);
        when(repository.start(eq(101L), eq("old"), anyLong(), anyInt(), any(), any()))
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
        when(repository.participants(1)).thenReturn(15L);
        when(repository.ranked(1, 10, 0)).thenReturn(List.of(new JumpRopeDtos.Item(1, "첫째", 45)));
        when(repository.me(1, 101)).thenReturn(me);
        var page = service.rankings(101, 10, 0);
        assertThat(page.me()).isEqualTo(me);
        assertThat(page.period()).isEqualTo("ALL_TIME");
        assertThat(page.hasMore()).isTrue();
    }

    @Test void new_rounds_and_the_board_follow_the_configured_rules_version() {
        var v2 = new JumpRopeService(repository, manager, clock, random, rewards, 2);
        Instant issued = START.minusSeconds(3);
        when(clock.instant()).thenReturn(issued);
        when(repository.start(eq(101L), eq("new"), eq(4294967295L), eq(2), any(), any())).thenReturn(rowV2(4294967295L, null, null));
        assertThat(v2.start(101, "new").rulesVersion()).isEqualTo(2);
        // A retried key returns the round as it started, even if new rounds have switched since.
        when(repository.start(eq(101L), eq("old"), anyLong(), eq(2), any(), any())).thenReturn(row(null, null));
        assertThat(v2.start(101, "old").rulesVersion()).isEqualTo(1);

        when(repository.participants(2)).thenReturn(1L);
        when(repository.ranked(2, 10, 0)).thenReturn(List.of(new JumpRopeDtos.Item(1, "둘째판", 1965)));
        var page = v2.rankings(101, 10, 0);
        assertThat(page.rulesVersion()).isEqualTo(2);
        assertThat(page.items()).extracting(JumpRopeDtos.Item::score).containsExactly(1965);
        verify(repository).me(2, 101);
        verify(repository, never()).participants(1);
        verify(repository, never()).ranked(eq(1), anyInt(), anyInt());
        assertThatThrownBy(() -> new JumpRopeService(repository, manager, clock, random, rewards, 3))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test void an_active_v1_round_completes_with_v1_rules_after_new_rounds_switch_to_v2() {
        var v2 = new JumpRopeService(repository, manager, clock, random, rewards, 2);
        when(clock.instant()).thenReturn(START.plusNanos(7_658_564_000L));
        assertCode(() -> v2.complete(101, 1, TWO_PERFECTS, List.of()), 400, "JUMP_ROPE_INVALID_INPUTS");
        var settled = v2.complete(101, 1, TWO_PERFECTS);
        assertThat(settled).isEqualTo(result(START.plusMillis(7658)));
        verify(repository).settle(1L, JumpRopeRules.replay(TWO_PERFECTS), settled.completedAt(), JumpRopeService.hash(TWO_PERFECTS));
        when(repository.lockRound(101, 1)).thenReturn(Optional.of(row(settled, JumpRopeService.hash(TWO_PERFECTS))));
        when(repository.latestId(101)).thenReturn(2L);
        assertThat(v2.complete(101, 1, List.copyOf(TWO_PERFECTS))).isEqualTo(settled);
        assertCode(() -> v2.complete(101, 1, List.of()), 409, "JUMP_ROPE_INPUT_CONFLICT");
        verify(repository, times(1)).settle(anyLong(), any(), any(), any());
    }

    @Test void a_v2_round_replays_its_stored_seed_with_the_duck_log_and_pays_like_v1() {
        var bot = JumpRopeRulesV2Tests.bot();
        var spans = JumpRopeRulesV2.spans(bot.duckSpansUs());
        Instant now = START.plusSeconds(60);
        var wallet = mock(Wallet.class);
        when(rewards.lockWallet(101)).thenReturn(Optional.of(wallet));
        when(rewards.grant(wallet, 1, 39, now)).thenReturn(39);
        when(repository.lockRound(101, 1)).thenReturn(Optional.of(rowV2(42, null, null)));
        when(clock.instant()).thenReturn(now.minusNanos(1));
        assertCode(() -> service.complete(101, 1, bot.jumpOffsetsUs(), bot.duckSpansUs()), 409, "JUMP_ROPE_NOT_FINISHED");
        when(clock.instant()).thenReturn(now);
        assertCode(() -> service.complete(101, 1, bot.jumpOffsetsUs()), 400, "JUMP_ROPE_INVALID_INPUTS");
        assertCode(() -> service.complete(101, 1, bot.jumpOffsetsUs(), List.of(List.of(5, 5))), 400, "JUMP_ROPE_INVALID_INPUTS");
        // Without the spans the same jumps land inside broom stuns, which the FE never logs.
        assertCode(() -> service.complete(101, 1, bot.jumpOffsetsUs(), List.of()), 400, "JUMP_ROPE_INVALID_INPUTS");
        verify(repository, never()).settle(anyLong(), any(), any(), any());

        // The round's stored version wins over the service default (1) and its seed fixes the schedule.
        var settled = service.complete(101, 1, bot.jumpOffsetsUs(), bot.duckSpansUs());
        assertThat(settled).isEqualTo(new JumpRopeDtos.Result("1", 2, 1965, new JumpRopeDtos.Counts(66, 0, 0), "time", now, 39));
        String hash = JumpRopeService.hashV2(bot.jumpOffsetsUs(), spans);
        verify(repository).settle(1L, JumpRopeRulesV2.replay(42, bot.jumpOffsetsUs(), spans), now, hash);

        when(repository.lockRound(101, 1)).thenReturn(Optional.of(rowV2(42, settled.withReward(0), hash)));
        when(rewards.previous(wallet, 1)).thenReturn(39);
        assertThat(service.complete(101, 1, List.copyOf(bot.jumpOffsetsUs()), List.copyOf(bot.duckSpansUs()))).isEqualTo(settled);
        var shifted = new java.util.ArrayList<>(bot.duckSpansUs());
        shifted.set(0, List.of(shifted.getFirst().get(0) + 1, shifted.getFirst().get(1)));
        assertCode(() -> service.complete(101, 1, bot.jumpOffsetsUs(), shifted), 409, "JUMP_ROPE_INPUT_CONFLICT");
        assertCode(() -> service.complete(101, 1, bot.jumpOffsetsUs()), 400, "JUMP_ROPE_INVALID_INPUTS");
        verify(rewards, times(1)).grant(any(), anyLong(), anyInt(), any());
    }

    @Test void refuses_an_active_round_of_an_unknown_rules_version() {
        when(clock.instant()).thenReturn(START.plusSeconds(10));
        when(repository.lockRound(101, 1)).thenReturn(Optional.of(new JumpRopeRepository.Row(1, 1, 3, START, EXPIRY, null, null)));
        assertCode(() -> service.complete(101, 1, TWO_PERFECTS), 409, "JUMP_ROPE_ROUND_EXPIRED");
        verify(repository, never()).settle(anyLong(), any(), any(), any());
    }

    @Test void keeps_the_v1_hash_and_gives_the_v2_log_its_own_unambiguous_encoding() throws Exception {
        var bytes = java.nio.ByteBuffer.allocate(8).putInt(728335).putInt(1723348).array();
        assertThat(JumpRopeService.hash(TWO_PERFECTS)).isEqualTo(java.util.HexFormat.of()
                .formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(bytes)));
        var span = new JumpRopeRulesV2.DuckSpan(1_723_348, 1_800_000);
        assertThat(JumpRopeService.hashV2(TWO_PERFECTS, List.of())).isNotEqualTo(JumpRopeService.hash(TWO_PERFECTS));
        assertThat(JumpRopeService.hashV2(TWO_PERFECTS, List.of()))
                .isNotEqualTo(JumpRopeService.hashV2(List.of(728335), List.of(span)));
        assertThat(JumpRopeService.hashV2(TWO_PERFECTS, List.of(span)))
                .isEqualTo(JumpRopeService.hashV2(List.copyOf(TWO_PERFECTS), List.of(new JumpRopeRulesV2.DuckSpan(1_723_348, 1_800_000))));
    }

    private static JumpRopeRepository.Row row(JumpRopeDtos.Result result, String hash) {
        return new JumpRopeRepository.Row(1, 4294967295L, 1, START, EXPIRY, result, hash);
    }

    private static JumpRopeRepository.Row rowV2(long seed, JumpRopeDtos.Result result, String hash) {
        return new JumpRopeRepository.Row(1, seed, 2, START, EXPIRY, result, hash);
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
