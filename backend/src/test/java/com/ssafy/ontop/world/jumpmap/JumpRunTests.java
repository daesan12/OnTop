package com.ssafy.ontop.world.jumpmap;

import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** BE 명세 15장 "판 시작과 끝", "문 순서와 시간" 표의 서버 판정. */
class JumpRunTests {
    private static final List<Integer> REWARDS = List.of(2, 4, 7, 11, 16, 24, 36);
    private static final int[] GATE_BLOCKS = {24, 34, 48, 61, 79, 98};

    private static JumpRun run() {
        return new JumpRun("run-1", 0, REWARDS, .65);
    }

    /** 구간 k의 착지 count번(마지막이 문 착지)을 at ms에 끝낸다. */
    private static List<JumpRun.Outcome> section(JumpRun run, int gate, int count, long at) {
        for (int i = 1; i < count; i++) run.land(GATE_BLOCKS[gate - 1] - 1, null, at - 1);
        return run.land(GATE_BLOCKS[gate - 1], gate, at);
    }

    @Test
    void 문1을_최소시간과_착지횟수로_통과하면_2냥_계산이다() {
        var run = run();
        assertThat(section(run, 1, 24, 9_600)).containsExactly(new JumpRun.GatePassed(1, 9_600, 2));
        assertThat(run.gatesPassed()).isEqualTo(1);
        assertThat(run.suspicious()).isFalse();
    }

    @Test
    void 최소시간_1ms_전이면_TOO_FAST로_인정하지_않고_의심판이다() {
        var run = run();
        assertThat(section(run, 1, 24, 9_599)).containsExactly(new JumpRun.GateRejected(1, "TOO_FAST", true));
        assertThat(run.gatesPassed()).isZero();
        assertThat(run.suspicious()).isTrue();
        assertThat(run.reasons()).containsExactly("TOO_FAST:1");
        // 다음 차례는 그대로. 시간이 지난 뒤 같은 문에 다시 착지하면 인정한다.
        assertThat(run.land(24, 1, 9_700)).containsExactly(new JumpRun.GatePassed(1, 9_700, 2));
    }

    @Test
    void 문2는_문1_착지부터_4000ms가_필요하다() {
        var run = run();
        section(run, 1, 24, 20_000);
        assertThat(section(run, 2, 10, 23_999)).containsExactly(new JumpRun.GateRejected(2, "TOO_FAST", true));
        assertThat(run.land(34, 2, 24_000)).containsExactly(new JumpRun.GatePassed(2, 24_000, 4));
    }

    @Test
    void 착지가_절반_미만이면_TOO_FEW_LANDINGS다() {
        var run = run();
        assertThat(section(run, 1, 11, 30_000)).containsExactly(new JumpRun.GateRejected(1, "TOO_FEW_LANDINGS", true));
        var enough = run();
        assertThat(section(enough, 1, 12, 30_000)).containsExactly(new JumpRun.GatePassed(1, 30_000, 2));
    }

    @Test
    void 지난_문_재착지는_무시하고_건너뛴_문은_기록만_한다() {
        var run = run();
        section(run, 1, 24, 10_000);
        assertThat(run.land(24, 1, 11_000)).isEmpty();
        assertThat(run.land(48, 3, 30_000)).containsExactly(new JumpRun.GateRejected(3, "GATE_SKIPPED", false));
        assertThat(run.gatesPassed()).isEqualTo(1);
        assertThat(run.suspicious()).isFalse();
        assertThat(run.reasons()).containsExactly("GATE_SKIPPED:3");
    }

    @Test
    void 진행중_0번_재착지는_새판이_아니고_착지로만_센다() {
        var run = run();
        assertThat(run.land(0, null, 500)).isEmpty();
        assertThat(run.landings().getFirst()).isEqualTo(1);
    }

    @Test
    void 문1_뒤_지형이면_FALL이고_이후_판정은_없다() {
        var run = run();
        section(run, 1, 24, 10_000);
        assertThat(run.terrain(12_000)).containsExactly(new JumpRun.Ended(JumpRun.EndReason.FALL, 12_000, null));
        assertThat(run.land(34, 2, 20_000)).isEmpty();
        assertThat(run.lake(20_000)).isEmpty();
        assertThat(run.gatesPassed()).isEqualTo(1);
    }

    @Test
    void 마지막_연잎_전_호수는_LAKE다() {
        var run = completeToGate6();
        assertThat(run.lake(60_000)).containsExactly(new JumpRun.Ended(JumpRun.EndReason.LAKE, 60_000, null));
    }

    @Test
    void 마지막_연잎_착지에_7구간_보상과_완주시간을_확정한다() {
        var run = completeToGate6();
        long at = 60_000;
        for (int block = 99; block <= 111; block++) run.land(block, null, at += 500);
        at += 500;
        assertThat(run.land(112, null, at)).containsExactly(new JumpRun.FinalPad(),
                new JumpRun.GatePassed(7, at, 36), new JumpRun.Ended(JumpRun.EndReason.FINISH, at, at));
        assertThat(run.land(112, null, at += 10)).isEmpty();
        assertThat(run.lake(at += 600)).isEmpty();
        assertThat(run.gatesPassed()).isEqualTo(7);
        assertThat(run.finalReached()).isTrue();
    }

    @Test
    void 완주도_7구간_검사에_걸리면_엽전없이_FINISH와_의심판이다() {
        var run = completeToGate6();
        // 문 6은 39,200ms. 7구간 최소 6,000ms 전에 뛰어든다.
        var outcomes = run.land(112, null, 40_000);
        assertThat(outcomes.get(1)).isEqualTo(new JumpRun.GateRejected(7, "TOO_FAST", true));
        assertThat(outcomes.get(2)).isEqualTo(new JumpRun.Ended(JumpRun.EndReason.FINISH, 40_000, 40_000L));
        assertThat(run.gatesPassed()).isEqualTo(7);
        assertThat(run.suspicious()).isTrue();
    }

    @Test
    void 문을_건너뛰고_마지막_연잎에서_뛰어들면_LAKE다() {
        var run = run();
        run.land(112, null, 100_000);
        assertThat(run.lake(100_500)).containsExactly(new JumpRun.Ended(JumpRun.EndReason.LAKE, 100_500, null));
        assertThat(run.reasons()).containsExactly("GATE_SKIPPED:7");
    }

    @Test
    void 시작_30분이면_TIMEOUT이다() {
        var run = run();
        assertThat(run.tick(JumpRun.TIMEOUT_MS - 1)).isEmpty();
        assertThat(run.tick(JumpRun.TIMEOUT_MS)).containsExactly(new JumpRun.Ended(JumpRun.EndReason.TIMEOUT, JumpRun.TIMEOUT_MS, null));
        assertThat(run.active()).isFalse();
    }

    @Test
    void 종료는_한번만이고_최고높이는_진행중에만_기록한다() {
        var run = run();
        run.height(27.4);
        run.height(3);
        assertThat(run.end(JumpRun.EndReason.RESET, 1_000)).hasSize(1);
        assertThat(run.end(JumpRun.EndReason.DISCONNECT, 2_000)).isEmpty();
        run.height(40);
        assertThat(run.maxHeight()).isEqualTo(27.4);
        assertThat(run.ended()).isEqualTo(JumpRun.EndReason.RESET);
    }

    private static JumpRun completeToGate6() {
        var run = run();
        int[] counts = {24, 10, 14, 13, 18, 19};
        long at = 0;
        var passed = new ArrayList<JumpRun.Outcome>();
        for (int gate = 1; gate <= 6; gate++) {
            at += counts[gate - 1] * JumpRun.LANDING_MS;
            passed.addAll(section(run, gate, counts[gate - 1], at));
        }
        assertThat(passed).allMatch(outcome -> outcome instanceof JumpRun.GatePassed);
        assertThat(run.gatesPassed()).isEqualTo(6);
        return run;
    }
}
