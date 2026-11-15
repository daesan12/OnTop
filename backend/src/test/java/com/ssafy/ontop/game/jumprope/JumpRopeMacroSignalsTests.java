package com.ssafy.ontop.game.jumprope;

import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 운영자 조회용 신호. 계산한 시각을 그대로 보낸 기록과 사람처럼 흔들리는 기록을 가른다. */
class JumpRopeMacroSignalsTests {
    private static final int TURNS = 66;

    /** 모든 줄 통과의 정점에 맞춘 기록. noise가 있으면 점프마다 표준편차 20ms로 흔든다. */
    private static List<Integer> log(Random noise) {
        var offsets = new ArrayList<Integer>();
        for (int turn = 1; turn <= TURNS; turn++) {
            int shift = noise == null ? 0 : (int) Math.round(noise.nextGaussian() * 20_000);
            offsets.add(JumpRopeRules.passageUs(turn) - JumpRopeMacroSignals.IDEAL_LEAD_US + shift);
        }
        return offsets;
    }

    @Test
    void 계산한_시각을_그대로_보낸_기록은_박자_흔들림이_거의_없다() {
        var offsets = log(null);
        // 서버 판정으로도 전부 PERFECT인 기록이어야 이 신호가 실제 만점 스크립트를 가리킨다.
        assertThat(JumpRopeRules.replay(offsets).perfect()).isEqualTo(TURNS);

        var signals = JumpRopeMacroSignals.analyze(offsets, JumpRopeRules.VERSION);

        assertThat(signals.jumpCount()).isEqualTo(TURNS);
        assertThat(signals.jitterUs()).isLessThan(500);
        assertThat(signals.steadyRhythm()).isTrue();
        assertThat(signals.leadMeanUs()).isZero();
        assertThat(signals.leadSdUs()).isZero();
    }

    @Test
    void 사람처럼_흔들리는_기록은_흔들림을_그_크기로_재고_의심하지_않는다() {
        var signals = JumpRopeMacroSignals.analyze(log(new Random(42)), JumpRopeRules.VERSION);

        assertThat(signals.jitterUs()).isBetween(8_000, 40_000);
        assertThat(signals.steadyRhythm()).isFalse();
        assertThat(signals.leadSdUs()).isBetween(10_000, 32_000);
        assertThat(Math.abs(signals.leadMeanUs())).isLessThan(12_000);
    }

    @Test
    void 한_바퀴를_건너뛴_곳이_있어도_나머지_박자로_잰다() {
        var offsets = new ArrayList<>(log(null));
        offsets.remove(40);
        offsets.remove(20);

        var signals = JumpRopeMacroSignals.analyze(offsets, JumpRopeRules.VERSION);

        assertThat(signals.jumpCount()).isEqualTo(TURNS - 2);
        assertThat(signals.jitterUs()).isLessThan(500);
        assertThat(signals.steadyRhythm()).isTrue();
    }

    @Test
    void 점프가_서른개_미만이면_박자를_재지_않는다() {
        var signals = JumpRopeMacroSignals.analyze(log(null).subList(0, 29), JumpRopeRules.VERSION);

        assertThat(signals.jitterUs()).isNull();
        assertThat(signals.steadyRhythm()).isFalse();
        assertThat(signals.leadMeanUs()).isZero();
        assertThat(JumpRopeMacroSignals.analyze(List.of(), JumpRopeRules.VERSION))
                .isEqualTo(new JumpRopeMacroSignals.Signals(0, null, null, null, 0));
    }

    @Test
    void 다른_규칙_버전의_판은_줄_통과_기준_오차를_구하지_않고_박자만_잰다() {
        var signals = JumpRopeMacroSignals.analyze(log(null), JumpRopeRules.VERSION + 1);

        assertThat(signals.leadMeanUs()).isNull();
        assertThat(signals.leadSdUs()).isNull();
        assertThat(signals.steadyRhythm()).isTrue();
    }

    @Test
    void 일_밀리초_단위로_떨어지는_점프_수를_센다() {
        var rounded = log(null).stream().map(offset -> offset / 1_000 * 1_000).toList();

        assertThat(JumpRopeMacroSignals.analyze(rounded, JumpRopeRules.VERSION).wholeMsJumps()).isEqualTo(TURNS);
        assertThat(JumpRopeMacroSignals.analyze(List.of(728_335, 1_723_000), JumpRopeRules.VERSION).wholeMsJumps())
                .isEqualTo(1);
    }
}
