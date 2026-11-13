package com.ssafy.ontop.game.jumprope;

import java.util.ArrayList;
import java.util.List;

/**
 * Rules v2: the Tapgol grandpa raid on top of the unchanged v1 rope, judgement, score and MISS pause.
 *
 * <p>The visit plan is the FE preview's {@code planGrandpaEvents} evaluated in the same IEEE 754 double
 * operations, so the server picks the same swing anchors as the FE for every seed. Everything the replay
 * compares afterwards uses whole active-time microseconds: passage n is the v1 passage plus every earlier
 * danger stretch, and a broom contact is its anchor passage plus 480 ms.
 */
public final class JumpRopeRulesV2 {
    public static final int VERSION = 2;
    public static final int MAX_DUCK_SPANS = 64;
    static final int HIT_OFFSET_MS = 480;
    static final int HIT_OFFSET_US = HIT_OFFSET_MS * 1_000;
    /** A turn that holds a dangerous swing lasts at least this long, so a dodge still allows the next PERFECT. */
    static final int MIN_DANGER_PERIOD_MS = 930;
    static final int DUCK_TRANSITION_US = 60_000;
    static final int SWING_GAP_PASSES = 2;
    /** A jump touches down here, measured from its input on the active clock. */
    static final int LANDING_US = JumpRopeRules.PREPARE_US + JumpRopeRules.FLIGHT_US;

    static final int WINDUP_MS = 1_000;
    static final int ENTRY_MS = 1_200;
    static final int RECOVER_MS = 450;
    static final int EXIT_MS = 1_200;
    private static final int MAX_FIRST_ANCHOR = 1_000;
    private static final int DURATION_US = JumpRopeRules.DURATION_US;

    enum Kind { SAFE, DANGER }

    record Window(int fromMs, int toMs, List<Kind> kinds) { }

    static final List<Window> WINDOWS = List.of(
            new Window(15_000, 30_000, List.of(Kind.SAFE, Kind.DANGER, Kind.DANGER)),
            new Window(40_000, 60_000, List.of(Kind.DANGER, Kind.DANGER, Kind.DANGER)));

    /** One held duck on the active clock. The round end closes a span that is still held. */
    public record DuckSpan(int startUs, int endUs) { }

    /** A broom swing after its anchor passage. A dangerous one lengthens the following turn by stretchUs. */
    record Swing(Kind kind, int anchor, int hitUs, int stretchUs) { }

    /** The public result plus the broom outcomes, which only tests read. */
    record Outcome(JumpRopeRules.Result result, int dodged, int hit) { }

    private record Planned(Kind kind, int anchor, int stretchUs) { }

    private record Layout(List<Planned> swings, double lagMs, double startMs, double endMs, double nextPassageMs) { }

    private JumpRopeRulesV2() { }

    /** Converts the request's [startUs, endUs] pairs and checks their shape. */
    static List<DuckSpan> spans(List<List<Integer>> pairs) {
        if (pairs == null || pairs.size() > MAX_DUCK_SPANS) throw invalidDucks();
        var spans = new ArrayList<DuckSpan>(pairs.size());
        for (List<Integer> pair : pairs) {
            if (pair == null || pair.size() != 2 || pair.get(0) == null || pair.get(1) == null) throw invalidDucks();
            spans.add(new DuckSpan(pair.get(0), pair.get(1)));
        }
        validateSpans(spans);
        return List.copyOf(spans);
    }

    /**
     * At most 64 spans within the 60 s play clock, each at least 1 us long, strictly increasing and not touching:
     * a release and a press at the same microsecond (for example inside one MISS freeze) form one span.
     */
    static void validateSpans(List<DuckSpan> spans) {
        if (spans == null || spans.size() > MAX_DUCK_SPANS) throw invalidDucks();
        int previousEnd = -1;
        for (DuckSpan span : spans) {
            if (span == null || span.startUs() <= previousEnd || span.endUs() <= span.startUs() || span.endUs() > DURATION_US) {
                throw invalidDucks();
            }
            previousEnd = span.endUs();
        }
    }

    public static JumpRopeRules.Result replay(long seed, List<Integer> jumps, List<DuckSpan> spans) {
        return outcome(seed, jumps, spans).result();
    }

    static Outcome outcome(long seed, List<Integer> jumps, List<DuckSpan> spans) {
        JumpRopeRules.validateInputs(jumps);
        validateSpans(spans);
        return new Replay(schedule(seed), jumps, spans).run();
    }

    /** The FE preview plan for the ranked rope (speed 1, 1000 ms to 800 ms over 60 s, 480 ms contact, 930 ms turn). */
    static List<Swing> schedule(long seed) {
        var random = new Mulberry32(grandpaSeed(seed));
        double lagMs = 0;
        var picked = new ArrayList<Planned>();
        for (Window window : WINDOWS) {
            // One draw per window, even when no visit fits.
            long draw = random.next();
            var candidates = new ArrayList<Layout>();
            for (int first = 1; first < MAX_FIRST_ANCHOR; first++) {
                Layout layout = layout(first, window.kinds(), lagMs);
                if (!(layout.startMs() <= window.toMs())) break;
                // The last dangerous swing must be followed by a passage, which delivers its stun MISS.
                if (layout.startMs() >= window.fromMs() && layout.endMs() <= window.toMs()
                        && layout.nextPassageMs() < JumpRopeRules.DURATION_MS) {
                    candidates.add(layout);
                }
            }
            if (candidates.isEmpty()) continue;
            // Math.floor(draw / 2^32 * count) without rounding.
            Layout chosen = candidates.get((int) ((draw * candidates.size()) >>> 32));
            lagMs = chosen.lagMs();
            picked.addAll(chosen.swings());
        }
        var swings = new ArrayList<Swing>(picked.size());
        int lagUs = 0;
        for (Planned swing : picked) {
            swings.add(new Swing(swing.kind(), swing.anchor(),
                    JumpRopeRules.passageUs(swing.anchor()) + lagUs + HIT_OFFSET_US, swing.stretchUs()));
            lagUs += swing.stretchUs();
        }
        return List.copyOf(swings);
    }

    /** Same expressions as the FE layoutEvent and grandpaEventSpan, in the same order. */
    private static Layout layout(int first, List<Kind> kinds, double lagMs) {
        double lag = lagMs;
        double firstHitMs = 0, lastHitMs = 0;
        int lastAnchor = first;
        var swings = new ArrayList<Planned>(kinds.size());
        for (int i = 0; i < kinds.size(); i++) {
            int anchor = first + i * SWING_GAP_PASSES;
            double hitMs = JumpRopeRules.passageMs(anchor) + lag + HIT_OFFSET_MS;
            int stretchUs = kinds.get(i) == Kind.DANGER ? stretchUs(anchor) : 0;
            lag += stretchUs / 1_000.0;
            swings.add(new Planned(kinds.get(i), anchor, stretchUs));
            if (i == 0) firstHitMs = hitMs;
            lastHitMs = hitMs;
            lastAnchor = anchor;
        }
        return new Layout(swings, lag, firstHitMs - WINDUP_MS - ENTRY_MS, lastHitMs + RECOVER_MS + EXIT_MS,
                JumpRopeRules.passageMs(lastAnchor + 1) + lag);
    }

    /** The FE dangerStretchMs before its division by 1000: the turn's shortfall from 930 ms, rounded up to 1 us. */
    static int stretchUs(int anchor) {
        double periodMs = JumpRopeRules.passageMs(anchor + 1) - JumpRopeRules.passageMs(anchor);
        return (int) Math.max(0, Math.ceil((MIN_DANGER_PERIOD_MS - periodMs) * 1_000));
    }

    /** Keeps the grandpa draws apart from the pigeon distraction stream, which uses the seed itself. */
    static int grandpaSeed(long seed) {
        return ((int) seed ^ 0x5bd1e995) * 0x27d4eb2d;
    }

    /** Mulberry32 as the FE writes it; JS Math.imul and ToInt32 match Java int overflow. */
    static final class Mulberry32 {
        private int state;

        Mulberry32(int seed) { state = seed; }

        /** The unsigned 32-bit output; the FE divides it by 2^32. */
        long next() {
            state += 0x6D2B79F5;
            int value = (state ^ (state >>> 15)) * (state | 1);
            value ^= value + (value ^ (value >>> 7)) * (value | 61);
            return (value ^ (value >>> 14)) & 0xffff_ffffL;
        }
    }

    /**
     * Event order at one microsecond: the timer, a passage or a broom contact first, then the inputs logged
     * there. A press at a contact therefore comes too late, and a release there still counts as held.
     */
    private static final class Replay {
        private final List<Swing> swings;
        private final List<Integer> jumps;
        private final List<DuckSpan> spans;
        private int score, combo, perfect, good, miss, dodged, hit;
        private int index, lastJump = -1, lastMiss = -1, stunnedAt = -1;
        private long pausedUs;

        Replay(List<Swing> swings, List<Integer> jumps, List<DuckSpan> spans) {
            this.swings = swings;
            this.jumps = jumps;
            this.spans = spans;
        }

        Outcome run() {
            int turn = 1, lagUs = 0, nextSwing = 0;
            Swing pending = null;
            for (;;) {
                int passage = Math.min(DURATION_US, JumpRopeRules.passageUs(turn) + lagUs);
                // Every contact lands inside the turn after its anchor: 480 ms is shorter than any turn.
                if (pending != null) {
                    takeJumpsBefore(pending.hitUs());
                    if (pending.kind() == Kind.DANGER) {
                        if (dodges(pending.hitUs())) {
                            dodged++;
                        } else {
                            hit++;
                            stunnedAt = pending.hitUs();
                        }
                    }
                    pending = null;
                }
                takeJumpsBefore(passage);
                if (passage == DURATION_US) return finish(JumpRopeRules.EndReason.TIME, DURATION_US);
                // A broom hit turns exactly the next passage into the usual MISS.
                var judgement = stunnedAt >= 0 ? JumpRopeRules.Judgement.MISS : JumpRopeRules.judgePass(passage, lastJump);
                stunnedAt = -1;
                switch (judgement) {
                    case PERFECT -> {
                        perfect++;
                        score += ++combo == 1 ? 15 : 30;
                    }
                    case GOOD -> {
                        good++;
                        score += 10;
                        combo = 0;
                    }
                    case MISS -> {
                        if (++miss == 3) {
                            if (index != jumps.size()) throw JumpRopeRules.invalidInputs();
                            // A duck still held when the round stops is closed at this passage.
                            if (!spans.isEmpty() && spans.getLast().endUs() > passage) throw invalidDucks();
                            return finish(JumpRopeRules.EndReason.MISS_LIMIT, passage);
                        }
                        pausedUs += JumpRopeRules.REACTION_US
                                + (lastJump < 0 ? 0 : Math.max(0, lastJump + JumpRopeRules.READY_US - passage));
                        lastMiss = passage;
                        lastJump = -1;
                        combo = 0;
                    }
                }
                if (nextSwing < swings.size() && swings.get(nextSwing).anchor() == turn) {
                    pending = swings.get(nextSwing++);
                    lagUs += pending.stretchUs();
                }
                turn++;
            }
        }

        private Outcome finish(JumpRopeRules.EndReason reason, int endUs) {
            return new Outcome(new JumpRopeRules.Result(score, perfect, good, miss, reason, endUs + pausedUs), dodged, hit);
        }

        private void takeJumpsBefore(int limit) {
            while (index < jumps.size() && jumps.get(index) < limit) {
                int jump = jumps.get(index++);
                // The FE rejects Space while a duck key is held or the stun lasts, so such a jump is never logged.
                if (jump <= lastMiss || (lastJump >= 0 && jump - lastJump < JumpRopeRules.NEXT_JUMP_US)
                        || (stunnedAt >= 0 && jump >= stunnedAt) || ducking(jump)) {
                    throw JumpRopeRules.invalidInputs();
                }
                lastJump = jump;
            }
        }

        private boolean ducking(int jump) {
            for (DuckSpan span : spans) {
                if (span.startUs() <= jump && jump <= span.endUs()) return true;
            }
            return false;
        }

        /**
         * The FE starts the 60 ms transition at max(key down, touchdown of an airborne jump) and restarts it at
         * each MISS passage while the key is held. A key pressed during a MISS freeze is logged at that passage.
         */
        private boolean dodges(int contact) {
            for (DuckSpan span : spans) {
                if (span.startUs() < contact && contact <= span.endUs()) {
                    int ready = lastMiss >= span.startUs() ? lastMiss
                            : lastJump < 0 ? span.startUs() : Math.max(span.startUs(), lastJump + LANDING_US);
                    return ready + DUCK_TRANSITION_US <= contact;
                }
            }
            return false;
        }
    }

    static JumpRopeException invalidDucks() {
        return new JumpRopeException(400, "JUMP_ROPE_INVALID_INPUTS", "숙이기 기록의 시간과 순서를 확인해 주세요.");
    }
}
