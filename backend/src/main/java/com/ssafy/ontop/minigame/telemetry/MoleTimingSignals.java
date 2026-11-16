package com.ssafy.ontop.minigame.telemetry;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.ssafy.ontop.game.mole.domain.MoleRules;
import io.swagger.v3.oas.annotations.media.Schema;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/**
 * 확정된 두더지 판의 타격 시각에서 운영자가 볼 타이밍 신호를 계산한다. 판정·점수·보상에는 쓰지 않는다.
 *
 * <p>두더지가 나온 시각은 클라이언트 보고값이 아니라 서버가 시드로 다시 만든 출현 순서에서 얻는다.
 * 화면을 보고 조작하는 매크로는 표적 ID를 정상으로 보내므로 함정 표적에 걸리지 않지만, 고정된 지연으로 반응하거나
 * 일정한 간격으로 누르는 흔적이 남는다. 게임 구간(난이도)마다 사람의 반응은 달라지므로 흔들림은 구간 안에서만 잰다.
 * 지속 고속 적중의 기준은 운영 표본으로 예비 점검했다.
 */
public final class MoleTimingSignals {
    /** 반응 시간 중앙값이 이보다 짧으면 사람이 보고 친 것으로 보기 어렵다. */
    public static final int FAST_MEDIAN_MS = 150;
    /** 초고속 반응을 재는 최소 반응 수. */
    public static final int FAST_MIN_REACTIONS = 20;
    /** 두더지 잡기: 구간 안 반응 시간의 흔들림이 이보다 작으면 일정한 반응으로 본다. */
    public static final int STEADY_REACTION_MS = 12;
    /** 스피드 두더지: 구간 안 연속 타격 간격의 흔들림이 이보다 작으면 일정한 간격으로 본다. */
    public static final int STEADY_INTERVAL_MS = 8;
    static final int SEGMENT_MIN_REACTIONS = 8;
    static final int SEGMENT_MIN_INTERVALS = 10;
    static final int MIN_STEADY_SEGMENTS = 2;
    static final int SPEED_SEGMENT_MS = 20_000;
    static final int SPEED_SEGMENTS = 3;
    static final int SUSTAINED_MIN_HITS = 140;
    static final int SUSTAINED_MIN_ACCURACY_PERCENT = 97;
    static final int SUSTAINED_MAX_P90_MS = 180;
    static final int EARLY_MOLE_REACTION_MS = 50;
    static final int EARLY_SPEED_REACTION_MS = 100;
    static final int EARLY_MIN_SAMPLES = 16;
    static final int EARLY_MIN_SEGMENTS = 2;

    /**
     * @param samples 구간의 표본 수. 두더지 잡기는 반응 시간, 스피드 두더지는 연속 타격 간격.
     * @param medianMs 표본의 중앙값. 표본이 없으면 null.
     * @param spreadMs 표본의 흔들림(중앙값 절대 편차 × 1.4826, 정규 분포의 표준편차에 해당). 표본이 없으면 null.
     */
    @Schema(name = "MoleTimingSegment")
    public record Segment(int samples, Integer medianMs, Integer spreadMs,
                          @JsonInclude(JsonInclude.Include.NON_NULL) Pace pace,
                          @JsonInclude(JsonInclude.Include.NON_NULL) EarlyReaction earlyReaction) {
        public Segment(int samples, Integer medianMs, Integer spreadMs) {
            this(samples, medianMs, spreadMs, null, null);
        }

        public Segment(int samples, Integer medianMs, Integer spreadMs, Pace pace) {
            this(samples, medianMs, spreadMs, pace, null);
        }
    }

    @Schema(name = "MoleAuditEarlyReaction")
    public record EarlyReaction(int samples, int quickHits, boolean qualifies) {
        static EarlyReaction measure(List<Integer> reactions, int maximumMs) {
            int quickHits = (int) reactions.stream().filter(ms -> ms <= maximumMs).count();
            boolean qualifies = reactions.size() >= EARLY_MIN_SAMPLES && 2 * quickHits >= reactions.size();
            return new EarlyReaction(reactions.size(), quickHits, qualifies);
        }
    }

    public record Reaction(int appearedAt, int latencyMs) {
    }

    @Schema(name = "SpeedMoleAuditPace")
    public record Pace(int taps, int hits, @Schema(nullable = true) Integer p90IntervalMs, boolean qualifies) {
        static Pace measured(int taps, int hits, Integer p90IntervalMs) {
            boolean qualifies = hits >= SUSTAINED_MIN_HITS && 100 * hits >= SUSTAINED_MIN_ACCURACY_PERCENT * taps
                    && p90IntervalMs != null && p90IntervalMs <= SUSTAINED_MAX_P90_MS;
            return new Pace(taps, hits, p90IntervalMs, qualifies);
        }
    }

    /**
     * @param reactions 반응 시간을 잰 타격 수.
     * @param medianReactionMs 판 전체 반응 시간 중앙값. 반응이 없으면 null.
     * @param segments 구간별 흔들림. 두더지 잡기는 30초 구간별 반응 시간, 스피드 두더지는 20초 구간별 타격 간격.
     * @param fastReaction 초고속 반응 신호.
     * @param steady 구간 안 일정한 반응(두더지 잡기) 또는 일정한 간격(스피드 두더지) 신호.
     */
    public record Signals(int reactions, Integer medianReactionMs, List<Segment> segments, boolean fastReaction,
                          boolean steady) {
        public boolean sustainedPace() {
            return MoleTimingSignals.sustainedPace(segments);
        }

        public boolean repeatedEarlyReaction() {
            return MoleTimingSignals.repeatedEarlyReaction(segments);
        }
    }

    private MoleTimingSignals() {
    }

    /**
     * 두더지 잡기. 나온 두더지(치면 안 되는 친구 제외)마다 그 구멍을 처음 친 시각까지를 반응 시간으로 잰다.
     * 판정에서 무시되는 너무 이른 타격도 그대로 잰다. 구간은 두더지가 나온 시각의 30초 구간이다.
     */
    public static Signals mole(List<MoleRules.Mole> moles, List<MoleRules.Hit> hits) {
        int segmentCount = MoleRules.DURATION_MS / MoleRules.PHASE_MS;
        var bySegment = new ArrayList<List<Integer>>();
        for (int i = 0; i < segmentCount; i++) {
            bySegment.add(new ArrayList<>());
        }
        var all = new ArrayList<Integer>();
        boolean[] reacted = new boolean[moles.size()];
        var ordered = hits.stream().sorted(Comparator.comparingInt(MoleRules.Hit::at)).toList();
        for (var hit : ordered) {
            for (var mole : moles) {
                if (mole.hole() == hit.hole() && mole.appearAt() <= hit.at() && hit.at() < mole.leaveAt()) {
                    if (mole.kind() != MoleRules.Kind.DECOY && !reacted[mole.id()]) {
                        reacted[mole.id()] = true;
                        int reaction = hit.at() - mole.appearAt();
                        all.add(reaction);
                        bySegment.get(Math.min(segmentCount - 1, MoleRules.phaseOf(mole.appearAt()))).add(reaction);
                    }
                    break;
                }
            }
        }
        var segments = bySegment.stream().map(reactions -> {
            var stats = segment(reactions);
            return new Segment(stats.samples(), stats.medianMs(), stats.spreadMs(), null,
                    EarlyReaction.measure(reactions, EARLY_MOLE_REACTION_MS));
        }).toList();
        return signals(all, segments, steady(segments, SEGMENT_MIN_REACTIONS, STEADY_REACTION_MS));
    }

    /**
     * 스피드 두더지. 판 중에 새로 나온 두더지를 친 반응 시간과, 판정에 들어간 연속 타격 사이 간격을 잰다.
     * 두더지 4마리가 늘 떠 있어 사람도 오래된 두더지를 치므로, 흔들림은 반응 시간이 아니라 타격 간격으로 잰다.
     *
     * @param reactions 처음 4마리를 뺀 적중의 반응 시간
     * @param tapTimes 판정에 들어간 타격 시각(시간 순서)
     * @param hitTimes 서버 리플레이에서 적중한 타격 시각(첫 4마리 포함)
     */
    public static Signals speed(List<Reaction> reactions, List<Integer> tapTimes, List<Integer> hitTimes) {
        var bySegment = new ArrayList<List<Integer>>();
        var reactionsBySegment = new ArrayList<List<Integer>>();
        int[] taps = new int[SPEED_SEGMENTS];
        int[] hits = new int[SPEED_SEGMENTS];
        int[] firstInternalGap = new int[SPEED_SEGMENTS];
        for (int i = 0; i < SPEED_SEGMENTS; i++) {
            bySegment.add(new ArrayList<>());
            reactionsBySegment.add(new ArrayList<>());
        }
        int previousSegment = 0;
        for (int i = 0; i < tapTimes.size(); i++) {
            int at = tapTimes.get(i);
            int currentSegment = at / SPEED_SEGMENT_MS;
            taps[currentSegment]++;
            if (i > 0) {
                bySegment.get(currentSegment).add(at - tapTimes.get(i - 1));
                if (currentSegment != previousSegment) {
                    firstInternalGap[currentSegment] = 1;
                }
            }
            previousSegment = currentSegment;
        }
        hitTimes.forEach(at -> hits[at / SPEED_SEGMENT_MS]++);
        reactions.forEach(reaction ->
                reactionsBySegment.get(reaction.appearedAt() / SPEED_SEGMENT_MS).add(reaction.latencyMs()));
        var segments = new ArrayList<Segment>(SPEED_SEGMENTS);
        for (int i = 0; i < SPEED_SEGMENTS; i++) {
            var gaps = bySegment.get(i);
            var timing = segment(gaps);
            // 기존 흔들림과 달리 지속 속도는 같은 구간의 연속 입력만 비교한다.
            var pace = Pace.measured(taps[i], hits[i], p90(gaps.subList(firstInternalGap[i], gaps.size())));
            segments.add(new Segment(timing.samples(), timing.medianMs(), timing.spreadMs(), pace,
                    EarlyReaction.measure(reactionsBySegment.get(i), EARLY_SPEED_REACTION_MS)));
        }
        return signals(reactions.stream().map(Reaction::latencyMs).toList(), List.copyOf(segments),
                steady(segments, SEGMENT_MIN_INTERVALS, STEADY_INTERVAL_MS));
    }

    static boolean repeatedEarlyReaction(List<Segment> segments) {
        return segments.stream().filter(segment -> segment.earlyReaction() != null
                && segment.earlyReaction().qualifies()).count() >= EARLY_MIN_SEGMENTS;
    }

    static boolean sustainedPace(List<Segment> segments) {
        return segments.size() == SPEED_SEGMENTS
                && segments.stream().allMatch(segment -> segment.pace() != null && segment.pace().qualifies());
    }

    private static Integer p90(List<Integer> gaps) {
        if (gaps.isEmpty()) {
            return null;
        }
        var sorted = gaps.stream().sorted().toList();
        return sorted.get((9 * sorted.size() - 1) / 10);
    }

    private static Signals signals(List<Integer> reactions, List<Segment> segments, boolean steady) {
        Integer median = reactions.isEmpty() ? null : median(reactions);
        boolean fast = reactions.size() >= FAST_MIN_REACTIONS && median < FAST_MEDIAN_MS;
        return new Signals(reactions.size(), median, segments, fast, steady);
    }

    /** 표본이 충분하고 기준보다 덜 흔들리는 구간이 둘 이상이면 신호를 남긴다. */
    static boolean steady(List<Segment> segments, int minSamples, int thresholdMs) {
        return segments.stream()
                .filter(segment -> segment.samples() >= minSamples && segment.spreadMs() < thresholdMs)
                .count() >= MIN_STEADY_SEGMENTS;
    }

    private static Segment segment(List<Integer> values) {
        if (values.isEmpty()) {
            return new Segment(0, null, null);
        }
        double center = exactMedian(values);
        var distance = values.stream().map(value -> Math.abs(value - center)).toList();
        return new Segment(values.size(), (int) Math.round(center),
                (int) Math.round(1.4826 * exactMedian(distance)));
    }

    private static int median(List<Integer> values) {
        return (int) Math.round(exactMedian(values));
    }

    private static double exactMedian(List<? extends Number> values) {
        double[] sorted = values.stream().mapToDouble(Number::doubleValue).sorted().toArray();
        int middle = sorted.length / 2;
        return sorted.length % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }
}
