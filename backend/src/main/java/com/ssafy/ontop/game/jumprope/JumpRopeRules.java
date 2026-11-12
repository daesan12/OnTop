package com.ssafy.ontop.game.jumprope;

import java.util.List;

public final class JumpRopeRules {
    public static final int VERSION = 1;
    public static final int COUNTDOWN_MS = 3_000;
    public static final int DURATION_MS = 60_000;
    public static final int EXPIRY_SECONDS = 95;
    public static final int MAX_INPUTS = 128;
    static final int DURATION_US = DURATION_MS * 1_000;

    private static final int START_PERIOD_MS = 1_000;
    private static final int END_PERIOD_MS = 800;
    private static final double PERIOD_SLOPE = (START_PERIOD_MS - END_PERIOD_MS) / (double) DURATION_MS;
    private static final double TURNS_AT_DEADLINE = -Math.log1p(-PERIOD_SLOPE * DURATION_MS / START_PERIOD_MS) / PERIOD_SLOPE;
    private static final int PREPARE_US = 70_000;
    private static final int FLIGHT_US = 400_000;
    private static final int NEXT_JUMP_US = PREPARE_US + FLIGHT_US + 45_000;
    private static final int READY_US = NEXT_JUMP_US + 65_000;
    private static final int REACTION_US = 1_350_000;
    private static final int PERFECT_WINDOW_US = 50_000;
    private static final double PEAK = 0.6;
    private static final double REQUIRED_HEIGHT = 0.017 + 0.035 + 0.03;

    enum Judgement { PERFECT, GOOD, MISS }

    public enum EndReason {
        TIME("time"), MISS_LIMIT("missLimit");

        private final String wireValue;

        EndReason(String wireValue) { this.wireValue = wireValue; }

        public String wireValue() { return wireValue; }
    }

    public record Result(int score, int perfect, int good, int miss, EndReason reason, long minimumElapsedUs) { }

    static void validateInputs(List<Integer> offsets) {
        if (offsets == null || offsets.size() > MAX_INPUTS) throw invalidInputs();
        int previous = -1;
        for (Integer offset : offsets) {
            if (offset == null || offset <= previous || offset >= DURATION_US) throw invalidInputs();
            previous = offset;
        }
    }

    public static Result replay(List<Integer> offsets) {
        validateInputs(offsets);
        int score = 0, combo = 0, perfect = 0, good = 0, miss = 0;
        int index = 0, turn = 1, lastJump = -1, lastMiss = -1;
        long pausedUs = 0;
        for (;;) {
            int passage = Math.min(DURATION_US, passageUs(turn));
            // Like the FE's step-before-input handler, resolve a passage before an input at its time.
            while (index < offsets.size() && offsets.get(index) < passage) {
                int jump = offsets.get(index++);
                if (jump <= lastMiss || (lastJump >= 0 && jump - lastJump < NEXT_JUMP_US)) throw invalidInputs();
                lastJump = jump;
            }
            if (passage == DURATION_US) {
                return new Result(score, perfect, good, miss, EndReason.TIME, DURATION_US + pausedUs);
            }
            switch (judgePass(passage, lastJump)) {
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
                        if (index != offsets.size()) throw invalidInputs();
                        return new Result(score, perfect, good, miss, EndReason.MISS_LIMIT, passage + pausedUs);
                    }
                    // Landing/recovery and the reaction run off the play clock. A full new turn
                    // starts at the same active time, preserving acceleration and resetting the jump.
                    pausedUs += REACTION_US + (lastJump < 0 ? 0 : Math.max(0, lastJump + READY_US - passage));
                    lastMiss = passage;
                    lastJump = -1;
                    combo = 0;
                }
            }
            turn++;
        }
    }

    /** Canonical play-clock passage: inverse integral of 1 / period, rounded once like Math.round(ms * 1000) in JS. */
    static int passageUs(int turn) {
        double elapsedMs = turn >= TURNS_AT_DEADLINE ? DURATION_MS + (turn - TURNS_AT_DEADLINE) * END_PERIOD_MS
                : -START_PERIOD_MS * Math.expm1(-PERIOD_SLOPE * turn) / PERIOD_SLOPE;
        return (int) Math.round(elapsedMs * 1_000);
    }

    static Judgement judgePass(int passage, int jump) {
        if (jump < 0) return Judgement.MISS;
        int lead = passage - jump;
        double progress = (lead - PREPARE_US) / (double) FLIGHT_US;
        if (progress <= 0 || progress >= 1 || 4 * PEAK * progress * (1 - progress) < REQUIRED_HEIGHT) {
            return Judgement.MISS;
        }
        return Math.abs(lead - PREPARE_US - FLIGHT_US / 2) <= PERFECT_WINDOW_US ? Judgement.PERFECT : Judgement.GOOD;
    }

    private static JumpRopeException invalidInputs() {
        return new JumpRopeException(400, "JUMP_ROPE_INVALID_INPUTS", "점프 기록의 시간과 순서를 확인해 주세요.");
    }
}
