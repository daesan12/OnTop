package com.ssafy.ontop.game.jumprope;

import java.util.Arrays;
import java.util.List;

/**
 * 제출된 점프 시각에서 운영자가 볼 신호를 계산한다. 판정·점수·보상에는 쓰지 않는다.
 *
 * <p>박자 흔들림은 규칙 버전과 무관하게 점프 시각만으로 구한다. 이웃한 세 점프의 간격 차이(2차 차분)를 쓰면
 * 줄이 점점 빨라지는 추세는 사라지고 점프마다의 흔들림만 남는다. MISS로 한 바퀴를 건너뛰거나 v2 위험 스윙으로
 * 한 바퀴가 늘어난 곳은 큰 값 몇 개가 되는데, 중앙값 기준으로 재므로 결과를 바꾸지 못한다.
 * 사람은 숙련자도 십수 ms는 흔들리고, 계산한 시각을 그대로 보내는 스크립트는 1ms에도 못 미친다.
 */
public final class JumpRopeMacroSignals {
    /** 이보다 적은 점프로는 박자 흔들림을 재지 않는다. */
    public static final int MIN_JUMPS = 30;
    /** 박자 흔들림이 이 값 미만이면 사람의 입력으로 보기 어렵다. 실측 전 추정치다. */
    public static final int STEADY_JITTER_US = 4_000;
    /** 줄이 발밑을 지나는 순간보다 이만큼 먼저 뛰면 점프 정점에서 줄을 넘는다(준비 70ms + 체공 400ms의 절반). */
    static final int IDEAL_LEAD_US = 270_000;
    private static final int LEAD_LIMIT_US = 1_200_000;

    /**
     * @param jitterUs 박자 흔들림(μs). 점프가 {@link #MIN_JUMPS}개 미만이면 null.
     * @param leadMeanUs 이상적인 시점에서 벗어난 평균(μs, 양수면 일찍 뜀). 규칙 1 판에서만 구한다.
     * @param leadSdUs 위 값의 표준편차(μs). 규칙 1 판에서만 구한다.
     * @param wholeMsJumps 1ms 단위로 딱 떨어지는 점프 수. 브라우저에 따라 정상일 수 있어 참고용이다.
     */
    public record Signals(int jumpCount, Integer jitterUs, Integer leadMeanUs, Integer leadSdUs, int wholeMsJumps) {
        public boolean steadyRhythm() {
            return jitterUs != null && jitterUs < STEADY_JITTER_US;
        }
    }

    private JumpRopeMacroSignals() { }

    public static Signals analyze(List<Integer> offsets, int rulesVersion) {
        int count = offsets.size();
        int wholeMs = 0;
        for (int offset : offsets) {
            if (offset % 1_000 == 0) wholeMs++;
        }
        Integer jitter = count < MIN_JUMPS ? null : jitter(offsets);
        Integer mean = null, deviation = null;
        if (rulesVersion == JumpRopeRules.VERSION && count > 0) {
            double[] lead = leadErrors(offsets);
            if (lead.length > 0) {
                double average = Arrays.stream(lead).average().orElse(0);
                double variance = Arrays.stream(lead).map(value -> (value - average) * (value - average)).sum() / lead.length;
                mean = (int) Math.round(average);
                deviation = (int) Math.round(Math.sqrt(variance));
            }
        }
        return new Signals(count, jitter, mean, deviation, wholeMs);
    }

    /** 2차 차분의 중앙값 절대 편차를 한 점프의 흔들림 표준편차로 환산한다(정규 분포 1.4826, 2차 차분 분산 6배). */
    private static int jitter(List<Integer> offsets) {
        double[] second = new double[offsets.size() - 2];
        for (int index = 1; index < offsets.size() - 1; index++) {
            second[index - 1] = (double) offsets.get(index + 1) - 2.0 * offsets.get(index) + offsets.get(index - 1);
        }
        double center = median(second);
        double[] distance = new double[second.length];
        for (int index = 0; index < second.length; index++) distance[index] = Math.abs(second[index] - center);
        return (int) Math.round(1.4826 * median(distance) / Math.sqrt(6));
    }

    /** 규칙 1의 줄 통과 시각은 판마다 같다. 각 점프 다음에 오는 통과까지의 여유에서 이상값을 뺀다. */
    private static double[] leadErrors(List<Integer> offsets) {
        double[] errors = new double[offsets.size()];
        int used = 0, turn = 1;
        for (int jump : offsets) {
            while (JumpRopeRules.passageUs(turn) <= jump) turn++;
            int lead = JumpRopeRules.passageUs(turn) - jump;
            // 한 바퀴 넘게 남기고 뛴 입력은 줄을 넘으려던 점프가 아니다.
            if (lead <= LEAD_LIMIT_US) errors[used++] = lead - IDEAL_LEAD_US;
        }
        return Arrays.copyOf(errors, used);
    }

    private static double median(double[] values) {
        double[] sorted = values.clone();
        Arrays.sort(sorted);
        int middle = sorted.length / 2;
        return sorted.length % 2 == 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    }
}
