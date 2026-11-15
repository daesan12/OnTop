package com.ssafy.ontop.world.jumpmap;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * 같은 회원의 최근 판끼리 출발 루틴과 초반 착지 박자를 비교해 녹화 재생으로 보이는 판을 찾는다.
 * 운영자 확인용 기록만 만들며 판정·보상·랭킹·이용자 전송에는 관여하지 않는다.
 *
 * <p>서버가 보는 착지 시각은 위치 보고 간격(약 60ms)만큼 흔들린다. 그래서 한 판만으로는 판단하지 않고,
 * 이전 판 {@link #MIN_MATCHES}개 이상과 맞을 때만 기록한다. 기준값은 추정치이므로 실제 기록을 보고 조정한다.
 * 저장 스레드 하나에서만 호출한다. 서버를 재시작하면 비교 대상은 비워진다.
 */
public final class JumpmapMacroWatch {
    /** 초반 착지의 발판 순서와 박자가 이전 판들과 같다. */
    public static final String REPLAY = "REPLAY";
    /** 같은 자리에 멈췄다가 같은 시간 뒤에 판을 시작했다. */
    public static final String FIXED_START = "FIXED_START";

    static final int HISTORY = 20;
    static final long HISTORY_MS = 3 * 60 * 60 * 1000L;
    static final int MIN_MATCHES = 3;
    static final int REPLAY_LANDINGS = 20;
    /** 착지 시각 차이가 중앙값에서 벗어난 정도. 20건 중 16건이 이 안에 들어야 같은 박자로 본다. */
    static final long REPLAY_DEVIATION_MS = 45;
    static final double START_RADIUS = .05;
    static final long START_LEAD_MS = 150;
    private static final int USERS = 5_000;

    public record Detection(String rule, int matchedRuns, Map<String, Object> evidence) {}

    private record Past(long atMs, JumpmapTracker.RunTrace trace) {}

    private final Map<String, Deque<Past>> recent = new LinkedHashMap<>(16, .75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, Deque<Past>> eldest) {
            return size() > USERS;
        }
    };

    /** 끝난 판 하나를 이전 판들과 비교한 뒤 비교 대상에 넣는다. */
    public List<Detection> evaluate(String userId, JumpmapTracker.RunTrace trace, long nowMs) {
        var history = recent.computeIfAbsent(userId, ignored -> new ArrayDeque<>());
        history.removeIf(entry -> nowMs - entry.atMs() > HISTORY_MS);
        var found = new ArrayList<Detection>();
        replay(trace, history).ifPresent(found::add);
        fixedStart(trace, history).ifPresent(found::add);
        history.addLast(new Past(nowMs, trace));
        while (history.size() > HISTORY) history.removeFirst();
        return found;
    }

    private static Optional<Detection> replay(JumpmapTracker.RunTrace trace, Deque<Past> history) {
        if (trace.landings().size() < REPLAY_LANDINGS) return Optional.empty();
        int compared = 0, matched = 0;
        long tightest = Long.MAX_VALUE;
        for (var entry : history) {
            var other = entry.trace().landings();
            if (other.size() < REPLAY_LANDINGS) continue;
            compared++;
            long deviation = deviation(trace.landings(), other);
            if (deviation > REPLAY_DEVIATION_MS) continue;
            matched++;
            tightest = Math.min(tightest, deviation);
        }
        if (matched < MIN_MATCHES) return Optional.empty();
        var evidence = new LinkedHashMap<String, Object>();
        evidence.put("landings", REPLAY_LANDINGS);
        evidence.put("compared", compared);
        evidence.put("matched", matched);
        evidence.put("deviationMs", tightest);
        return Optional.of(new Detection(REPLAY, matched, evidence));
    }

    /**
     * 두 판의 앞쪽 착지를 짝지어 시각 차이를 구하고, 그 차이가 중앙값에서 벗어난 크기의 80번째 백분위를 돌려준다.
     * 발판 순서가 다르면 비교하지 않는다. 사람은 뒤로 갈수록 차이가 벌어지고 재생은 벌어지지 않는다.
     */
    static long deviation(List<JumpmapTracker.Landing> current, List<JumpmapTracker.Landing> other) {
        long[] offsets = new long[REPLAY_LANDINGS];
        for (int index = 0; index < REPLAY_LANDINGS; index++) {
            if (current.get(index).block() != other.get(index).block()) return Long.MAX_VALUE;
            offsets[index] = current.get(index).atMs() - other.get(index).atMs();
        }
        long[] sorted = offsets.clone();
        java.util.Arrays.sort(sorted);
        long median = (sorted[REPLAY_LANDINGS / 2 - 1] + sorted[REPLAY_LANDINGS / 2]) / 2;
        long[] distances = new long[REPLAY_LANDINGS];
        for (int index = 0; index < REPLAY_LANDINGS; index++) distances[index] = Math.abs(offsets[index] - median);
        java.util.Arrays.sort(distances);
        return distances[REPLAY_LANDINGS * 4 / 5 - 1];
    }

    private static Optional<Detection> fixedStart(JumpmapTracker.RunTrace trace, Deque<Past> history) {
        var dwell = trace.dwell();
        // 벤치 좌석은 누구에게나 같은 좌표라 고정 출발의 근거가 되지 못한다.
        if (dwell == null || dwell.seated()) return Optional.empty();
        int compared = 0, matched = 0;
        long widest = 0;
        for (var entry : history) {
            var other = entry.trace().dwell();
            if (other == null || other.seated()) continue;
            compared++;
            long difference = Math.abs(dwell.leadMs() - other.leadMs());
            if (Math.hypot(dwell.x() - other.x(), dwell.z() - other.z()) > START_RADIUS || difference > START_LEAD_MS) {
                continue;
            }
            matched++;
            widest = Math.max(widest, difference);
        }
        if (matched < MIN_MATCHES) return Optional.empty();
        var evidence = new LinkedHashMap<String, Object>();
        evidence.put("x", round(dwell.x()));
        evidence.put("z", round(dwell.z()));
        evidence.put("stillMs", dwell.stillMs());
        evidence.put("leadMs", dwell.leadMs());
        evidence.put("compared", compared);
        evidence.put("matched", matched);
        evidence.put("leadSpreadMs", widest);
        return Optional.of(new Detection(FIXED_START, matched, evidence));
    }

    private static double round(double value) {
        return Math.round(value * 100) / 100.0;
    }
}
