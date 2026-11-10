package com.ssafy.ontop.game.speedmole;

import java.util.ArrayList;
import java.util.List;

/** Version 1: same unsigned 32-bit LCG and ordered four-hole replacement as the client. */
public final class SpeedMoleRules {
    public static final int VERSION = 1, DURATION_MS = 60_000, COUNTDOWN_MS = 3_000, MAX_TAPS = 6_000;
    /** 기존 두더지(MoleRules)와 별도인 스피드 두더지 지급 비율. */
    public static final int POINTS_PER_COIN = 5;
    public record Tap(int hole, int at) { }
    public record Score(int score, int hits, int misses) { }
    private long state;
    private SpeedMoleRules(long seed) { state = seed & 0xffffffffL; }
    private int pick(int length) {
        state = (state * 1664525L + 1013904223L) & 0xffffffffL;
        return (int) (state * length / 4294967296L);
    }
    public static Score replay(long seed, List<Tap> taps) {
        if (taps == null || taps.size() > MAX_TAPS) throw invalid();
        var random = new SpeedMoleRules(seed);
        var available = new ArrayList<>(List.of(0, 1, 2, 3, 4, 5, 6, 7));
        var targets = new ArrayList<Integer>();
        for (int n = 0; n < 4; n++) targets.add(available.remove(random.pick(available.size())));
        int score = 0, hits = 0, misses = 0, previous = -1;
        for (Tap tap : taps) {
            if (tap == null || tap.hole < 0 || tap.hole > 7 || tap.at < previous
                    || tap.at < 0 || tap.at >= DURATION_MS) throw invalid();
            previous = tap.at;
            int index = targets.indexOf(tap.hole);
            if (index < 0) { misses++; score = Math.max(0, score - 3); continue; }
            var empty = new ArrayList<Integer>();
            for (int h = 0; h < 8; h++) if (!targets.contains(h)) empty.add(h);
            targets.set(index, empty.get(random.pick(empty.size())));
            score++; hits++;
        }
        return new Score(score, hits, misses);
    }
    private static SpeedMoleException invalid() { return new SpeedMoleException(400, "SPEED_MOLE_INVALID_TAPS", "타격 기록을 확인해 주세요."); }
}
