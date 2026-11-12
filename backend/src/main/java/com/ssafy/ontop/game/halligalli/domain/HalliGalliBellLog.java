package com.ssafy.ontop.game.halligalli.domain;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

// 참가자별 종 기록. 매크로 판별 분석용 자료이고 승패 판정에는 쓰지 않는다.
// 반응 시간은 종 창을 연 카드 공개가 처리된 시각부터 종 요청이 서버에 닿은 시각까지다(통신 시간 포함).
// 사람은 공개를 보고 과일 수를 세야 해서 보통 0.4초 이상 걸리므로 150·300ms 미만 횟수를 따로 센다.
public final class HalliGalliBellLog {
    public static final int FAST_MS = 150;
    public static final int QUICK_MS = 300;

    private final Map<Long, Counts> counts = new LinkedHashMap<>();

    HalliGalliBellLog(List<Long> players) {
        for (long player : players) {
            counts.put(player, new Counts());
        }
    }

    void success(long user, long reactionMs) {
        Counts count = counts.get(user);
        count.success++;
        count.reactions.add(clamp(reactionMs));
    }

    void penalty(long user) {
        counts.get(user).penalty++;
    }

    // 이미 닫힌 창(다른 사람이 먼저 쳤거나 새 카드가 공개됨)에 늦게 닿은 종. 같은 요청을 다시 보내면 두 번 셀 수 있다.
    void late(long user) {
        counts.get(user).late++;
    }

    public List<Summary> summaries() {
        List<Summary> summaries = new ArrayList<>(counts.size());
        counts.forEach((user, count) -> summaries.add(count.summary(user)));
        return List.copyOf(summaries);
    }

    private static int clamp(long millis) {
        return (int) Math.max(0, Math.min(Integer.MAX_VALUE, millis));
    }

    // 반응 시간 값은 성공한 종이 없으면 null이다. 중앙값은 짝수 개면 가운데 두 값의 평균(내림)이다.
    public record Summary(long userId, int successRings, int penaltyRings, int lateRings, Integer reactionMinMs,
            Integer reactionMedianMs, Integer reactionAvgMs, int under150Ms, int under300Ms) {
    }

    private static final class Counts {
        private int success;
        private int penalty;
        private int late;
        private final List<Integer> reactions = new ArrayList<>();

        private Summary summary(long user) {
            if (reactions.isEmpty()) {
                return new Summary(user, success, penalty, late, null, null, null, 0, 0);
            }
            List<Integer> sorted = reactions.stream().sorted(Comparator.naturalOrder()).toList();
            int size = sorted.size();
            int median = size % 2 == 1 ? sorted.get(size / 2)
                    : (int) (((long) sorted.get(size / 2 - 1) + sorted.get(size / 2)) / 2);
            long sum = sorted.stream().mapToLong(Integer::longValue).sum();
            int under150 = (int) sorted.stream().filter(ms -> ms < FAST_MS).count();
            int under300 = (int) sorted.stream().filter(ms -> ms < QUICK_MS).count();
            return new Summary(user, success, penalty, late, sorted.getFirst(), median, (int) (sum / size),
                    under150, under300);
        }
    }
}
