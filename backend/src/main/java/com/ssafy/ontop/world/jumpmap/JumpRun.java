package com.ssafy.ontop.world.jumpmap;

import java.util.ArrayList;
import java.util.List;

/**
 * 한 판의 서버 판정(BE 명세 4·5·7장, 규칙 v2). 입력은 서버가 확인한 착지·호수 진입·시각뿐이며
 * DB·지갑·전송은 하지 않는다. 호출자는 한 사용자에 대해 순서대로 호출한다.
 */
public final class JumpRun {
    public static final long TIMEOUT_MS = 30 * 60 * 1000L;
    public static final long LANDING_MS = 400;
    /** 구간별 착지 횟수(문 착지·호수 다이빙 포함). 최소 시간 = 횟수 × 400ms. */
    public static final List<Integer> SECTION_LANDINGS = List.of(24, 10, 14, 13, 18, 19, 14);
    public static final int FINAL_BLOCK = 112;
    public static final int START_BLOCK = 0;

    public enum EndReason { FINISH, FALL, LAKE, DISCONNECT, TIMEOUT, RESET, LEFT }

    /** 판정 결과. 호출자가 저장·지급·전송으로 옮긴다. */
    public sealed interface Outcome {}
    public record GatePassed(int gate, long elapsedMs, int coinsCalculated) implements Outcome {}
    public record GateRejected(int gate, String reason, boolean suspicious) implements Outcome {}
    public record FinalPad() implements Outcome {}
    public record Ended(EndReason reason, long elapsedMs, Long finishMs) implements Outcome {}

    private final String runId;
    private final long startedAtMs;
    private final List<Integer> rewards;
    private final int[] landings = new int[SECTION_LANDINGS.size()];
    private final List<String> reasons = new ArrayList<>();
    private long sectionStartedAtMs;
    private int gatesPassed;
    private boolean finalReached, suspicious;
    private double maxHeight;
    private EndReason ended;

    /** 판이 없을 때 0번 발판 착지로만 만든다. 시작 착지는 1구간 착지 횟수에 넣지 않는다. */
    public JumpRun(String runId, long startedAtMs, List<Integer> rewards, double feetHeight) {
        if (rewards.size() != SECTION_LANDINGS.size()) throw new IllegalArgumentException("구간 보상은 7개입니다.");
        this.runId = runId;
        this.startedAtMs = startedAtMs;
        this.sectionStartedAtMs = startedAtMs;
        this.rewards = List.copyOf(rewards);
        this.maxHeight = Math.max(0, feetHeight);
    }

    /** 코스 발판 착지. 지형·구조물 착지는 {@link #terrain}과 구조물(무시)로 나눈다. */
    public List<Outcome> land(int block, Integer gate, long nowMs) {
        if (ended != null) return List.of();
        int section = gatesPassed; // 0-based: 다음 차례 문 = gatesPassed + 1
        if (section < landings.length) landings[section]++;
        var result = new ArrayList<Outcome>();
        if (gate != null) {
            if (gate == gatesPassed + 1) {
                result.add(check(gate, nowMs));
            } else if (gate > gatesPassed + 1) {
                reasons.add("GATE_SKIPPED:" + gate);
                result.add(new GateRejected(gate, "GATE_SKIPPED", false));
            }
        }
        if (block == FINAL_BLOCK && !finalReached) {
            if (gatesPassed < 6) {
                reasons.add("GATE_SKIPPED:7");
                result.add(new GateRejected(7, "GATE_SKIPPED", false));
                return result;
            }
            finalReached = true;
            result.add(new FinalPad());
            result.add(check(7, nowMs));
            gatesPassed = 7;
            ended = EndReason.FINISH;
            long elapsed = Math.max(0, nowMs - startedAtMs);
            result.add(new Ended(EndReason.FINISH, elapsed, elapsed));
        }
        return result;
    }

    /** 지형 접지는 진행 중 판을 FALL로 끝낸다. */
    public List<Outcome> terrain(long nowMs) {
        return end(EndReason.FALL, nowMs);
    }

    /** 완주는 마지막 연잎에서 확정하며, 완주 전 수면 진입은 LAKE다. */
    public List<Outcome> lake(long nowMs) {
        return end(EndReason.LAKE, nowMs);
    }

    public void height(double feet) {
        if (ended == null && feet > maxHeight) maxHeight = feet;
    }

    /** 시작 후 30분이 지나면 TIMEOUT. */
    public List<Outcome> tick(long nowMs) {
        return ended == null && nowMs - startedAtMs >= TIMEOUT_MS ? end(EndReason.TIMEOUT, nowMs) : List.of();
    }

    public List<Outcome> end(EndReason reason, long nowMs) {
        if (ended != null) return List.of();
        ended = reason;
        return List.of(new Ended(reason, Math.max(0, nowMs - startedAtMs), null));
    }

    private Outcome check(int gate, long nowMs) {
        int required = SECTION_LANDINGS.get(gate - 1);
        int section = gate - 1;
        if (nowMs - sectionStartedAtMs < required * LANDING_MS) {
            return reject(gate, "TOO_FAST");
        }
        // 절반 이상: 24 → 12, 15 → 8 (올림).
        if (landings[section] * 2 < required) {
            return reject(gate, "TOO_FEW_LANDINGS");
        }
        gatesPassed = gate;
        sectionStartedAtMs = nowMs;
        return new GatePassed(gate, nowMs - startedAtMs, rewards.get(gate - 1));
    }

    private Outcome reject(int gate, String reason) {
        suspicious = true;
        reasons.add(reason + ":" + gate);
        return new GateRejected(gate, reason, true);
    }

    public String runId() { return runId; }
    public long startedAtMs() { return startedAtMs; }
    public int gatesPassed() { return gatesPassed; }
    public boolean finalReached() { return finalReached; }
    public boolean suspicious() { return suspicious; }
    public double maxHeight() { return maxHeight; }
    public boolean active() { return ended == null; }
    public EndReason ended() { return ended; }
    public List<String> reasons() { return List.copyOf(reasons); }
    public List<Integer> landings() {
        var copy = new ArrayList<Integer>();
        for (int value : landings) copy.add(value);
        return List.copyOf(copy);
    }
    public long elapsedMs(long nowMs) { return Math.max(0, nowMs - startedAtMs); }
}
