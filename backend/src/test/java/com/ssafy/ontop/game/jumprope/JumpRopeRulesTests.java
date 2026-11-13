package com.ssafy.ontop.game.jumprope;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JumpRopeRulesTests {
    record Boundary(int leadUs, JumpRopeRules.Judgement kind) { }
    record Round(List<Integer> offsets, int score, int perfect, int good, int miss,
                 JumpRopeRules.EndReason reason, long minimumElapsedUs) { }
    record Fixtures(List<Integer> passagesUs, List<Boundary> judgements, List<Round> rounds) { }

    private static final Fixtures FIXTURES = fixtures();

    private static Fixtures fixtures() {
        try (var input = JumpRopeRulesTests.class.getResourceAsStream("/jump-rope/rules-v1.json")) {
            return new ObjectMapper().readValue(input, Fixtures.class);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test void matches_the_shared_passage_and_judgement_boundaries() {
        for (int i = 0; i < FIXTURES.passagesUs().size(); i++) {
            assertThat(JumpRopeRules.passageUs(i + 1)).as("turn %s", i + 1).isEqualTo(FIXTURES.passagesUs().get(i));
        }
        for (var test : FIXTURES.judgements()) {
            int passage = JumpRopeRules.passageUs(1);
            assertThat(JumpRopeRules.judgePass(passage, passage - test.leadUs())).as("lead %s", test.leadUs())
                    .isEqualTo(test.kind());
        }
    }

    @Test void applies_score_combo_resets_and_wall_time_for_early_endings() {
        for (var test : FIXTURES.rounds()) {
            assertThat(JumpRopeRules.replay(test.offsets())).as("offsets %s", test.offsets())
                    .isEqualTo(new JumpRopeRules.Result(test.score(), test.perfect(), test.good(), test.miss(),
                            test.reason(), test.minimumElapsedUs()));
        }
    }

    @Test void finishes_all_66_accelerated_turns_and_prioritizes_the_60_second_deadline() {
        var offsets = new ArrayList<>(perfectRound());
        offsets.add(JumpRopeRules.DURATION_US - 1);
        assertThat(JumpRopeRules.replay(offsets)).isEqualTo(
                new JumpRopeRules.Result(1_965, 66, 0, 0, JumpRopeRules.EndReason.TIME, 60_000_000));
        assertThat(JumpRopeRules.passageUs(66)).isLessThan(JumpRopeRules.DURATION_US);
        assertThat(JumpRopeRules.passageUs(67)).isGreaterThan(JumpRopeRules.DURATION_US);
        offsets.set(offsets.size() - 1, JumpRopeRules.DURATION_US);
        assertInvalid(offsets);
    }

    @Test void retains_the_accelerated_clock_after_two_misses_and_can_still_finish() {
        var offsets = new ArrayList<>(perfectRound());
        offsets.remove(64);
        offsets.remove(0);
        assertThat(JumpRopeRules.replay(offsets)).isEqualTo(
                new JumpRopeRules.Result(1_890, 64, 0, 2, JumpRopeRules.EndReason.TIME, 62_700_000));
    }

    @Test void rejects_out_of_order_duplicate_out_of_range_and_post_result_input() {
        assertInvalid(null);
        assertInvalid(Arrays.asList(1, null));
        assertInvalid(List.of(-1));
        assertInvalid(List.of(300_000, 299_999));
        assertInvalid(List.of(1, 1));
        assertInvalid(List.of(JumpRopeRules.passageUs(3)));
        assertInvalid(List.of(JumpRopeRules.passageUs(3) + 1));
        assertInvalid(IntStream.rangeClosed(0, JumpRopeRules.MAX_INPUTS).boxed().toList());
    }

    @Test void rejects_locked_jumps_and_resets_the_lock_only_after_a_miss() {
        assertInvalid(List.of(0, 514_999));
        assertThat(JumpRopeRules.replay(List.of(0, 515_000)).miss()).isEqualTo(3);
        assertInvalid(List.of(980_000, JumpRopeRules.passageUs(1)));
        assertThat(JumpRopeRules.replay(List.of(980_000, JumpRopeRules.passageUs(1) + 1)).miss()).isEqualTo(3);
    }

    static List<Integer> perfectRound() {
        return FIXTURES.passagesUs().subList(0, 66).stream().map(passage -> passage - 270_000).toList();
    }

    private static void assertInvalid(List<Integer> offsets) {
        assertThatThrownBy(() -> JumpRopeRules.replay(offsets)).isInstanceOfSatisfying(JumpRopeException.class,
                error -> assertThat(error.code()).isEqualTo("JUMP_ROPE_INVALID_INPUTS"));
    }
}
