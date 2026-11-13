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

/**
 * Story 426: the server replays the grandpa raid from the input log alone.
 * The fixture was produced by the FE preview engine (planGrandpaEvents and advancePreviewRound).
 */
class JumpRopeRulesV2Tests {
    record Window(int fromUs, int toUs, List<JumpRopeRulesV2.Kind> kinds) { }
    record Constants(int hitOffsetUs, int minDangerPeriodUs, int duckTransitionUs, int swingGapPasses,
                     int entryLeadUs, int exitTailUs, List<Window> windows) { }
    record Draws(long seed, long grandpaSeed, List<Long> draws) { }
    record Swing(JumpRopeRulesV2.Kind kind, int anchor, int hitUs, int stretchUs) { }
    record Schedule(long seed, List<Integer> choices, List<Swing> swings, List<Integer> passagesUs) { }
    record Round(String name, long seed, List<Integer> jumpOffsetsUs, List<List<Integer>> duckSpansUs, int score,
                 int perfect, int good, int miss, JumpRopeRules.EndReason reason, int dodged, int hit) { }
    record Fixtures(Constants constants, List<Draws> random, List<Schedule> schedules, List<Round> rounds) { }

    private static final Fixtures FIXTURES = fixtures();
    private static final long SEED = 42;
    /** Seed 42: the first dangerous swing follows passage 20, the second one passage 22. */
    private static final int P20 = 19_347_904, P21 = 20_281_854, P22 = 21_212_696, P23 = 22_142_696;
    private static final int CONTACT_20 = P20 + 480_000, CONTACT_22 = P22 + 480_000;
    private static final int JUMP_20 = P20 - 270_000, JUMP_21 = P21 - 270_000, JUMP_23 = P23 - 270_000;

    private static Fixtures fixtures() {
        try (var input = JumpRopeRulesV2Tests.class.getResourceAsStream("/jump-rope/rules-v2.json")) {
            return new ObjectMapper().readValue(input, Fixtures.class);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }

    @Test void fixes_the_constants_the_fe_preview_derives_from_its_default_settings() {
        var constants = FIXTURES.constants();
        assertThat(JumpRopeRulesV2.HIT_OFFSET_US).isEqualTo(constants.hitOffsetUs()).isEqualTo(480_000);
        assertThat(JumpRopeRulesV2.MIN_DANGER_PERIOD_MS * 1_000).isEqualTo(constants.minDangerPeriodUs()).isEqualTo(930_000);
        assertThat(JumpRopeRulesV2.DUCK_TRANSITION_US).isEqualTo(constants.duckTransitionUs()).isEqualTo(60_000);
        assertThat(JumpRopeRulesV2.SWING_GAP_PASSES).isEqualTo(constants.swingGapPasses()).isEqualTo(2);
        assertThat((JumpRopeRulesV2.WINDUP_MS + JumpRopeRulesV2.ENTRY_MS) * 1_000).isEqualTo(constants.entryLeadUs());
        assertThat((JumpRopeRulesV2.RECOVER_MS + JumpRopeRulesV2.EXIT_MS) * 1_000).isEqualTo(constants.exitTailUs());
        assertThat(JumpRopeRulesV2.WINDOWS.stream().map(window -> new Window(window.fromMs() * 1_000, window.toMs() * 1_000,
                window.kinds())).toList()).isEqualTo(constants.windows());
    }

    @Test void derives_the_grandpa_stream_like_the_fe_mulberry32() {
        for (var expected : FIXTURES.random()) {
            int seed = JumpRopeRulesV2.grandpaSeed(expected.seed());
            assertThat(Integer.toUnsignedLong(seed)).as("seed %s", expected.seed()).isEqualTo(expected.grandpaSeed());
            var random = new JumpRopeRulesV2.Mulberry32(seed);
            assertThat(IntStream.range(0, expected.draws().size()).mapToObj(i -> random.next()).toList())
                    .isEqualTo(expected.draws());
        }
    }

    @Test void plans_the_same_visits_contacts_and_stretches_as_the_fe_for_every_window_choice() {
        // The schedules cover all 121 (window 1, window 2) candidate choices, including the one where the
        // integer and the double layouts disagree by 3 us on the 60 s exit.
        assertThat(FIXTURES.schedules()).hasSizeGreaterThanOrEqualTo(121);
        for (var expected : FIXTURES.schedules()) {
            var swings = JumpRopeRulesV2.schedule(expected.seed());
            assertThat(swings.stream().map(swing -> new Swing(swing.kind(), swing.anchor(), swing.hitUs(), swing.stretchUs())).toList())
                    .as("seed %s", expected.seed()).isEqualTo(expected.swings());
            if (expected.passagesUs() != null) {
                assertThat(IntStream.rangeClosed(1, expected.passagesUs().size()).map(turn -> passage(swings, turn)).boxed().toList())
                        .as("seed %s", expected.seed()).isEqualTo(expected.passagesUs());
            }
        }
    }

    @Test void every_seed_gets_two_visits_whose_contacts_fit_inside_their_turns() {
        for (long seed : IntStream.range(0, 5_000).mapToLong(i -> Integer.toUnsignedLong(i * 0x9E3779B1 + 7)).toArray()) {
            var swings = JumpRopeRulesV2.schedule(seed);
            assertThat(swings).isEqualTo(JumpRopeRulesV2.schedule(seed));
            assertThat(swings.stream().map(JumpRopeRulesV2.Swing::kind).toList()).as("seed %s", seed).containsExactly(
                    JumpRopeRulesV2.Kind.SAFE, JumpRopeRulesV2.Kind.DANGER, JumpRopeRulesV2.Kind.DANGER,
                    JumpRopeRulesV2.Kind.DANGER, JumpRopeRulesV2.Kind.DANGER, JumpRopeRulesV2.Kind.DANGER);
            for (int i = 0; i < swings.size(); i++) {
                var swing = swings.get(i);
                int anchor = passage(swings, swing.anchor()), next = passage(swings, swing.anchor() + 1);
                assertThat(swing.hitUs()).isEqualTo(anchor + JumpRopeRulesV2.HIT_OFFSET_US).isLessThan(next);
                if (swing.kind() == JumpRopeRulesV2.Kind.DANGER) {
                    // A dodge leaves at least 450 ms before the next passage: release, then a PERFECT jump.
                    assertThat(next - anchor).as("seed %s anchor %s", seed, swing.anchor()).isGreaterThanOrEqualTo(930_000);
                    assertThat(next - swing.hitUs()).isGreaterThanOrEqualTo(450_000);
                    assertThat(next).isLessThan(JumpRopeRules.DURATION_US);
                }
                if (i % 3 > 0) assertThat(swing.anchor() - swings.get(i - 1).anchor()).isEqualTo(2);
            }
            assertThat(swings.get(0).hitUs() - 2_200_000).isGreaterThanOrEqualTo(15_000_000 - 1);
            assertThat(swings.get(2).hitUs() + 1_650_000).isLessThanOrEqualTo(30_000_000 + 2);
            assertThat(swings.get(3).hitUs() - 2_200_000).isGreaterThanOrEqualTo(40_000_000 - 1);
            assertThat(swings.get(5).hitUs() + 1_650_000).isLessThanOrEqualTo(60_000_000 + 2);
        }
    }

    @Test void replays_the_rounds_played_by_the_fe_preview_engine() {
        assertThat(FIXTURES.rounds()).hasSizeGreaterThanOrEqualTo(30);
        for (var expected : FIXTURES.rounds()) {
            var outcome = outcome(expected.seed(), expected.jumpOffsetsUs(), expected.duckSpansUs());
            var result = outcome.result();
            assertThat(List.of(result.score(), result.perfect(), result.good(), result.miss(), outcome.dodged(), outcome.hit()))
                    .as("%s seed %s", expected.name(), expected.seed())
                    .isEqualTo(List.of(expected.score(), expected.perfect(), expected.good(), expected.miss(), expected.dodged(), expected.hit()));
            assertThat(result.reason()).as(expected.name()).isEqualTo(expected.reason());
        }
    }

    @Test void a_broom_hit_costs_exactly_one_miss_and_freezes_the_clock_like_any_miss() {
        for (var expected : FIXTURES.rounds()) {
            if (expected.name().equals("neverDucks") || expected.name().startsWith("lateDuck")) {
                assertThat(expected.miss()).as(expected.name()).isEqualTo(expected.hit()).isPositive();
            }
        }
        var neverDucks = round("neverDucks", SEED);
        var stunned = outcome(SEED, neverDucks.jumpOffsetsUs(), neverDucks.duckSpansUs());
        assertThat(stunned.hit()).isEqualTo(3);
        assertThat(stunned.result().reason()).isEqualTo(JumpRopeRules.EndReason.MISS_LIMIT);

        var lateDuck = round("lateDuckIsHitAndStunMissesTheNextPassage", SEED);
        assertThat(outcome(SEED, lateDuck.jumpOffsetsUs(), lateDuck.duckSpansUs()).result())
                .isEqualTo(new JumpRopeRules.Result(1_920, 65, 0, 1, JumpRopeRules.EndReason.TIME, 61_350_000));
        var bot = bot();
        assertThat(outcome(SEED, bot.jumpOffsetsUs(), bot.duckSpansUs()).result())
                .isEqualTo(new JumpRopeRules.Result(1_965, 66, 0, 0, JumpRopeRules.EndReason.TIME, 60_000_000));
    }

    @Test void a_stun_misses_the_next_passage_even_with_a_jump_made_before_the_contact() {
        // Passage 23 follows a stretched 930 ms turn, so a GOOD lead of 455.831 ms starts before the contact.
        int early = P23 - 455_831;
        assertThat(early).isLessThan(CONTACT_22);
        assertThat(JumpRopeRules.judgePass(P23, early)).isEqualTo(JumpRopeRules.Judgement.GOOD);
        var jumps = new ArrayList<>(bot().jumpOffsetsUs());
        jumps.set(jumps.indexOf(JUMP_23), early);
        var spans = new ArrayList<>(bot().duckSpansUs());
        spans.remove(1);
        var outcome = outcome(SEED, jumps, spans);
        assertThat(outcome.hit()).isEqualTo(1);
        // The airborne jump still delays the resume: 1350 ms plus its remaining landing and recovery.
        assertThat(outcome.result()).isEqualTo(new JumpRopeRules.Result(1_920, 65, 0, 1, JumpRopeRules.EndReason.TIME,
                60_000_000 + 1_350_000 + (early + JumpRopeRules.READY_US - P23)));
    }

    @Test void the_duck_must_be_complete_at_the_contact_and_a_release_at_the_contact_still_counts() {
        assertThat(firstDanger(CONTACT_20 - 60_000, CONTACT_20 + 120_000, false).hit()).isZero();
        assertThat(firstDanger(CONTACT_20 - 59_999, CONTACT_20 + 120_000, true).hit()).isEqualTo(1);
        assertThat(firstDanger(CONTACT_20 - 100_000, CONTACT_20, false).hit()).isZero();
        assertThat(firstDanger(CONTACT_20 - 100_000, CONTACT_20 - 1, true).hit()).isEqualTo(1);
        // The contact resolves before a press logged at the same microsecond.
        var pressedAtContact = firstDanger(CONTACT_20, CONTACT_20 + 120_000, true);
        assertThat(pressedAtContact.hit()).isEqualTo(1);
        assertThat(pressedAtContact.result().miss()).isEqualTo(1);
    }

    @Test void a_press_in_the_air_waits_for_touchdown_unless_a_miss_restarts_the_transition() {
        // A jump after the anchor passage lands too late: max(key down, touchdown) + 60 ms passes the contact.
        int late = P20 + JumpRopeRules.NEXT_JUMP_US - 270_000;
        var jumps = new ArrayList<>(bot().jumpOffsetsUs());
        jumps.set(jumps.indexOf(JUMP_21), late);
        var airborne = spansWithFirst(late + 1, CONTACT_20 + 120_000);
        assertThat(JumpRopeRulesV2.outcome(SEED, jumps, airborne).hit()).isEqualTo(1);
        jumps.remove(Integer.valueOf(late));
        assertThat(JumpRopeRulesV2.outcome(SEED, jumps, airborne).hit()).isZero();

        // A 40 ms lead misses passage 20; the MISS restarts the held duck at the passage instead of touchdown.
        int tooLate = P20 - 40_000;
        var missed = new ArrayList<>(bot().jumpOffsetsUs());
        missed.set(missed.indexOf(JUMP_20), tooLate);
        assertThat(tooLate + JumpRopeRulesV2.LANDING_US + JumpRopeRulesV2.DUCK_TRANSITION_US).isGreaterThan(CONTACT_20);
        var restarted = JumpRopeRulesV2.outcome(SEED, missed, spansWithFirst(tooLate + 1, CONTACT_20 + 120_000));
        assertThat(restarted.hit()).isZero();
        assertThat(restarted.result().miss()).isEqualTo(1);
    }

    @Test void a_duck_pressed_or_held_through_a_miss_freeze_is_ready_60_ms_after_that_passage() {
        for (String name : List.of("duckPressedDuringAnchorMissFreeze", "duckHeldThroughAnchorMiss",
                "releaseAndPressAgainInOneFreezeIsOneSpan")) {
            var expected = round(name, SEED);
            var outcome = outcome(SEED, expected.jumpOffsetsUs(), expected.duckSpansUs());
            assertThat(outcome.hit()).as(name).isZero();
            assertThat(outcome.result().miss()).as(name).isEqualTo(1);
        }
        // A press during the freeze is logged at the frozen passage.
        assertThat(round("duckPressedDuringAnchorMissFreeze", SEED).duckSpansUs().getFirst().getFirst()).isEqualTo(P20);
        // A release and a press inside one freeze must arrive as one span, so the log has one encoding.
        assertThat(round("releaseAndPressAgainInOneFreezeIsOneSpan", SEED).duckSpansUs())
                .isEqualTo(round("duckHeldThroughAnchorMiss", SEED).duckSpansUs());
        var held = round("duckHeldThroughAnchorMiss", SEED);
        var split = new ArrayList<>(held.duckSpansUs());
        var first = split.removeFirst();
        split.addAll(0, List.of(List.of(first.get(0), P20), List.of(P20, first.get(1))));
        assertInvalid(() -> outcome(SEED, held.jumpOffsetsUs(), split));
    }

    @Test void a_duck_and_a_stun_may_overlap_but_jumps_inside_either_are_forged() {
        // A late duck held across the stun MISS changes nothing: the broom already hit.
        var overlapping = firstDanger(CONTACT_20 - 30_000, P21 + 100_000, true);
        assertThat(overlapping.hit()).isEqualTo(1);
        assertThat(overlapping.result().miss()).isEqualTo(1);
        // The FE rejects Space during the stun, so a logged jump there is forged.
        assertInvalid(() -> firstDanger(CONTACT_20, CONTACT_20 + 120_000, false));
        var jumps = new ArrayList<>(bot().jumpOffsetsUs());
        jumps.remove(Integer.valueOf(JUMP_21));
        var spans = spansWithFirst(CONTACT_20 - 10_000, CONTACT_20 + 10_000);
        for (int forged : List.of(CONTACT_20 + 10_001, P21 - 1)) {
            var withJump = new ArrayList<>(jumps);
            withJump.add(withJump.indexOf(JUMP_20) + 1, forged);
            assertInvalid(() -> JumpRopeRulesV2.outcome(SEED, withJump, spans));
        }
    }

    @Test void a_jump_on_a_duck_boundary_or_inside_a_span_is_rejected() {
        var bot = bot();
        for (var extra : List.of(List.of(JUMP_21, JUMP_21 + 1_000), List.of(JUMP_21 - 1_000, JUMP_21),
                List.of(JUMP_21 - 1, JUMP_21 + 1))) {
            assertInvalid(() -> outcome(SEED, bot.jumpOffsetsUs(), withExtraSpan(bot.duckSpansUs(), extra)));
        }
        for (var extra : List.of(List.of(JUMP_21 + 1, JUMP_21 + 1_000), List.of(JUMP_21 - 1_000, JUMP_21 - 1))) {
            var outcome = outcome(SEED, bot.jumpOffsetsUs(), withExtraSpan(bot.duckSpansUs(), extra));
            assertThat(outcome.result().score()).isEqualTo(1_965);
        }
    }

    @Test void a_span_held_at_the_end_closes_at_the_final_play_time() {
        var finish = round("duckHeldUntilTheSixtySecondFinish", SEED);
        assertThat(finish.duckSpansUs().getLast().getLast()).isEqualTo(JumpRopeRules.DURATION_US);
        var ended = round("duckHeldUntilTheThirdMissEndsTheRound", SEED);
        int lastPassage = ended.duckSpansUs().getLast().getLast();
        var outcome = outcome(SEED, ended.jumpOffsetsUs(), ended.duckSpansUs());
        assertThat(outcome.result().reason()).isEqualTo(JumpRopeRules.EndReason.MISS_LIMIT);
        assertThat(outcome.result().minimumElapsedUs()).isGreaterThan(lastPassage);
        for (int end : List.of(lastPassage + 1, JumpRopeRules.DURATION_US)) {
            var spans = new ArrayList<>(ended.duckSpansUs());
            spans.set(spans.size() - 1, List.of(spans.getLast().getFirst(), end));
            assertInvalid(() -> outcome(SEED, ended.jumpOffsetsUs(), spans));
        }
        assertInvalid(() -> outcome(SEED, ended.jumpOffsetsUs(),
                withExtraSpan(ended.duckSpansUs(), List.of(lastPassage + 1, lastPassage + 2))));
        var neverDucks = round("neverDucks", SEED);
        var afterTheEnd = new ArrayList<>(neverDucks.jumpOffsetsUs());
        afterTheEnd.add(JumpRopeRules.DURATION_US - 1);
        assertInvalid(() -> outcome(SEED, afterTheEnd, List.of()));
    }

    @Test void checks_the_span_shape_count_and_order() {
        for (var invalid : List.<List<List<Integer>>>of(List.of(List.of(2, 1)), List.of(List.of(1, 1)), List.of(List.of(-1, 5)),
                List.of(List.of(0, 60_000_001)), List.of(List.of(1, 5), List.of(5, 9)), List.of(List.of(1, 5), List.of(4, 9)),
                List.of(List.of(5, 9), List.of(1, 3)), List.of(List.of(1, 2, 3)), List.of(List.of(1)))) {
            assertInvalid(() -> JumpRopeRulesV2.spans(invalid));
        }
        assertInvalid(() -> JumpRopeRulesV2.spans(null));
        assertInvalid(() -> JumpRopeRulesV2.spans(Arrays.asList(List.of(1, 2), null)));
        assertInvalid(() -> JumpRopeRulesV2.spans(List.of(Arrays.asList(1, null))));
        assertInvalid(() -> JumpRopeRulesV2.replay(SEED, List.of(), null));
        assertThat(JumpRopeRulesV2.spans(List.of(List.of(0, 60_000_000)))).containsExactly(new JumpRopeRulesV2.DuckSpan(0, 60_000_000));
        var most = IntStream.range(0, JumpRopeRulesV2.MAX_DUCK_SPANS).mapToObj(i -> List.of(i * 10, i * 10 + 5)).toList();
        assertThat(JumpRopeRulesV2.spans(most)).hasSize(64);
        var tooMany = new ArrayList<>(most);
        tooMany.add(List.of(1_000, 1_005));
        assertInvalid(() -> JumpRopeRulesV2.spans(tooMany));
    }

    @Test void a_log_that_ends_before_the_first_visit_scores_like_v1() {
        for (var test : List.of(List.<Integer>of(), List.of(728335, 1723348))) {
            assertThat(JumpRopeRulesV2.replay(SEED, test, List.of())).isEqualTo(JumpRopeRules.replay(test));
        }
        assertInvalid(() -> JumpRopeRulesV2.replay(SEED, List.of(0, 514_999), List.of()));
    }

    private static JumpRopeRulesV2.Outcome firstDanger(int start, int end, boolean blockedJump) {
        var jumps = new ArrayList<>(bot().jumpOffsetsUs());
        if (blockedJump) jumps.remove(Integer.valueOf(JUMP_21));
        return JumpRopeRulesV2.outcome(SEED, jumps, spansWithFirst(start, end));
    }

    private static List<JumpRopeRulesV2.DuckSpan> spansWithFirst(int start, int end) {
        var spans = new ArrayList<>(bot().duckSpansUs());
        spans.set(0, List.of(start, end));
        return JumpRopeRulesV2.spans(spans);
    }

    private static List<List<Integer>> withExtraSpan(List<List<Integer>> spans, List<Integer> extra) {
        var list = new ArrayList<>(spans);
        list.add(extra);
        list.sort((a, b) -> Integer.compare(a.getFirst(), b.getFirst()));
        return list;
    }

    private static JumpRopeRulesV2.Outcome outcome(long seed, List<Integer> jumps, List<List<Integer>> spans) {
        return JumpRopeRulesV2.outcome(seed, jumps, JumpRopeRulesV2.spans(spans));
    }

    static Round bot() { return round("botDodgesEverything", SEED); }

    static Round round(String name, long seed) {
        return FIXTURES.rounds().stream().filter(round -> round.name().equals(name) && round.seed() == seed).findFirst().orElseThrow();
    }

    /** P2(n): the v1 passage plus every stretch applied after an earlier dangerous anchor. */
    private static int passage(List<JumpRopeRulesV2.Swing> swings, int turn) {
        return JumpRopeRules.passageUs(turn) + swings.stream().filter(swing -> swing.anchor() < turn)
                .mapToInt(JumpRopeRulesV2.Swing::stretchUs).sum();
    }

    private static void assertInvalid(Runnable call) {
        assertThatThrownBy(call::run).isInstanceOfSatisfying(JumpRopeException.class, error -> {
            assertThat(error.status()).isEqualTo(400);
            assertThat(error.code()).isEqualTo("JUMP_ROPE_INVALID_INPUTS");
        });
    }
}
