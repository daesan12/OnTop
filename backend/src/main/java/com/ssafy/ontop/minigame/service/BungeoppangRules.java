package com.ssafy.ontop.minigame.service;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Arrays;
import java.util.List;
import java.util.Set;

/** v2 입력 기록을 순서대로 재생한다. 클라이언트 점수와 서버 수신 지연은 판정에 쓰지 않는다. */
public final class BungeoppangRules {
    public static final String VERSION = "v2";
    public static final int DAILY_CAP = MinigameRewardBudget.DAILY_CAP;
    public static final Set<String> TIP_KEYS = Set.of("START", "POUR", "GOLD", "BURNT", "RUSH");

    public Result replay(JsonNode body, List<Integer> heats) {
        JsonNode log = body.path("log");
        if (!log.isArray()) { throw invalid("BAD_LOG", -1); }
        if (log.size() > 1200) { throw invalid("LOG_TOO_LONG", -1); }
        int[] state = new int[6];
        int[] started = new int[6];
        int[] heat = new int[6];
        int[] front = new int[6];
        int[] last = new int[6];
        Arrays.fill(last, -300);
        int previous = -50;
        int consumed = 0;
        int score = 0, made = 0, golden = 0, failed = 0, wasted = 0, combo = 0, maxCombo = 0;
        for (int i = 0; i < log.size(); i++) {
            JsonNode entry = log.get(i);
            if (!entry.isObject() || entry.size() != 3 || !entry.path("slot").isIntegralNumber()
                    || !entry.path("t").isIntegralNumber() || !entry.path("action").isTextual()
                    || !entry.path("slot").canConvertToInt() || !entry.path("t").canConvertToInt()) {
                throw invalid("BAD_ENTRY", i);
            }
            int slot = entry.path("slot").intValue();
            int t = entry.path("t").intValue();
            String action = entry.path("action").textValue();
            if (slot < 0 || slot > 5 || t < 0 || t > 60000
                    || !Set.of("POUR", "FILL", "TURN", "DISCARD").contains(action)) {
                throw invalid("BAD_ENTRY", i);
            }
            if (t < previous) { throw invalid("TIME_REVERSED", i); }
            if (t - previous < 50) { throw invalid("TOO_FAST", i); }
            if (t - last[slot] < 300) { throw invalid("SAME_SLOT_TOO_FAST", i); }
            boolean allowed = switch (state[slot]) {
                case 0 -> action.equals("POUR");
                case 1 -> action.equals("FILL") || action.equals("DISCARD");
                default -> action.equals("TURN") || action.equals("DISCARD");
            };
            if (!allowed) { throw invalid("ACTION_STATE_MISMATCH", i); }
            switch (action) {
                case "POUR" -> state[slot] = 1;
                case "FILL" -> {
                    if (consumed == heats.size()) { throw invalid("TOO_MANY_FILLS", i); }
                    heat[slot] = heats.get(consumed++);
                    started[slot] = t;
                    state[slot] = 2;
                }
                case "DISCARD" -> {
                    state[slot] = 0;
                    wasted++;
                    combo = 0;
                }
                case "TURN" -> {
                    int cooked = doneness(started[slot], t, heat[slot]);
                    if (state[slot] == 2) {
                        front[slot] = cooked;
                        started[slot] = t;
                        state[slot] = 3;
                    } else {
                        int a = sideScore(front[slot]), b = sideScore(cooked);
                        int base = a == 0 || b == 0 ? 0 : a + b;
                        if (base == 10) { combo++; golden++; }
                        else if (base == 0) { combo = 0; failed++; }
                        score += base * (combo >= 6 ? 15 : combo >= 3 ? 12 : 10) / 10;
                        maxCombo = Math.max(maxCombo, combo);
                        made++;
                        state[slot] = 0;
                    }
                }
                default -> throw invalid("BAD_ENTRY", i);
            }
            previous = t;
            last[slot] = t;
        }
        return new Result(score, made, golden, failed, wasted, maxCombo);
    }

    public static int doneness(int start, int now, int heat) {
        long boundary = Math.min(Math.max(40000, start), now);
        long normal = boundary - start;
        long rush = now - boundary;
        return (int) ((normal * 100 * 6000 + rush * 100 * 8000) * heat / (8000L * 6000 * 100));
    }

    public static int sideScore(int cooked) {
        if (cooked < 50 || cooked >= 100) { return 0; }
        return cooked >= 70 && cooked <= 90 ? 5 : 2;
    }

    private MinigameException invalid(String detail, int index) {
        return new MinigameException(422, "LOG_INVALID", "입력 기록을 확인할 수 없습니다.", detail, index);
    }

    public record Result(int score, int made, int golden, int failed, int wasted, int maxCombo) { }
}
