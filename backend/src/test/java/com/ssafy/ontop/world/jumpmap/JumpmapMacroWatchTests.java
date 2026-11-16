package com.ssafy.ontop.world.jumpmap;

import com.ssafy.ontop.world.jumpmap.JumpmapTracker.Dwell;
import com.ssafy.ontop.world.jumpmap.JumpmapTracker.Landing;
import com.ssafy.ontop.world.jumpmap.JumpmapTracker.RunTrace;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** 반복 패턴 판별. 한 판만으로는 기록하지 않고 이전 판 3개 이상과 맞을 때만 기록한다. */
class JumpmapMacroWatchTests {
    private static final long HOUR = 60 * 60 * 1000L;

    /** 발판 1..count를 700ms마다 밟되 판마다 driftPerLanding만큼 뒤로 갈수록 벌어진다. 보고 간격 수준의 흔들림을 섞는다. */
    private static RunTrace run(int index, int count, long driftPerLanding, Dwell dwell) {
        var landings = new ArrayList<Landing>();
        for (int block = 1; block <= count; block++) {
            long jitter = (block * 7 + index * 13) % 21 - 10;
            landings.add(new Landing(block, block * 700L + index * driftPerLanding * block + jitter));
        }
        return new RunTrace(0, 0, dwell, landings, JumpRun.EndReason.FALL, 20_000);
    }

    private static List<String> rules(List<JumpmapMacroWatch.Detection> detections) {
        return detections.stream().map(JumpmapMacroWatch.Detection::rule).toList();
    }

    @Test
    void 같은_박자의_판이_이전_세판과_맞으면_네번째_판부터_기록한다() {
        var watch = new JumpmapMacroWatch();
        for (int index = 0; index < 3; index++) {
            assertThat(watch.evaluate("7", run(index, 20, 0, null), index * 60_000L)).isEmpty();
        }

        var fourth = watch.evaluate("7", run(3, 20, 0, null), 180_000);
        var fifth = watch.evaluate("7", run(4, 24, 0, null), 240_000);

        assertThat(rules(fourth)).containsExactly(JumpmapMacroWatch.REPLAY);
        assertThat(fourth.getFirst().matchedRuns()).isEqualTo(3);
        assertThat(fourth.getFirst().evidence()).containsEntry("landings", 20).containsEntry("compared", 3)
                .containsEntry("matched", 3);
        assertThat((long) fourth.getFirst().evidence().get("deviationMs")).isLessThanOrEqualTo(45);
        assertThat(fifth.getFirst().matchedRuns()).isEqualTo(4);
    }

    @Test
    void 뒤로_갈수록_벌어지는_사람의_판은_기록하지_않는다() {
        var watch = new JumpmapMacroWatch();
        for (int index = 0; index < 8; index++) {
            assertThat(watch.evaluate("7", run(index, 24, 25, null), index * 60_000L)).isEmpty();
        }
    }

    @Test
    void 발판_순서가_다르거나_착지가_스무개_미만이면_비교하지_않는다() {
        var watch = new JumpmapMacroWatch();
        for (int index = 0; index < 5; index++) {
            assertThat(watch.evaluate("7", run(index, 19, 0, null), index * 60_000L)).isEmpty();
        }
        var other = new JumpmapMacroWatch();
        for (int index = 0; index < 5; index++) {
            var landings = new ArrayList<>(run(index, 20, 0, null).landings());
            // 판마다 다른 자리의 발판 하나를 다시 밟았다.
            landings.set(index + 2, new Landing(index + 2, landings.get(index + 2).atMs()));
            var trace = new RunTrace(0, 0, null, landings, JumpRun.EndReason.FALL, 20_000);
            assertThat(other.evaluate("7", trace, index * 60_000L)).isEmpty();
        }
    }

    @Test
    void 같은_자리에_멈췄다가_같은_시간_뒤에_시작하면_고정_출발로_기록한다() {
        var watch = new JumpmapMacroWatch();
        for (int index = 0; index < 3; index++) {
            var dwell = new Dwell(-53.2 + index * .01, -11.4, 2_000, 1_500 + index * 40, false);
            assertThat(watch.evaluate("7", run(index, 5, 0, dwell), index * 60_000L)).isEmpty();
        }

        var found = watch.evaluate("7", run(3, 5, 0, new Dwell(-53.19, -11.41, 2_100, 1_560, false)), 180_000);

        assertThat(rules(found)).containsExactly(JumpmapMacroWatch.FIXED_START);
        assertThat(found.getFirst().matchedRuns()).isEqualTo(3);
        assertThat(found.getFirst().evidence()).containsEntry("x", -53.19).containsEntry("z", -11.41)
                .containsEntry("leadMs", 1_560L).containsEntry("stillMs", 2_100L).containsEntry("matched", 3)
                .containsEntry("leadSpreadMs", 60L);
    }

    @Test
    void 벤치_좌석이나_다른_자리_다른_간격은_고정_출발이_아니다() {
        var seated = new JumpmapMacroWatch();
        var elsewhere = new JumpmapMacroWatch();
        var irregular = new JumpmapMacroWatch();
        for (int index = 0; index < 6; index++) {
            assertThat(seated.evaluate("7", run(index, 5, 0, new Dwell(-53.2, -11.4, 2_000, 1_500, true)),
                    index * 60_000L)).isEmpty();
            assertThat(elsewhere.evaluate("7", run(index, 5, 0, new Dwell(-53.2 + index * .2, -11.4, 2_000, 1_500, false)),
                    index * 60_000L)).isEmpty();
            assertThat(irregular.evaluate("7", run(index, 5, 0, new Dwell(-53.2, -11.4, 2_000, 1_500 + index * 400, false)),
                    index * 60_000L)).isEmpty();
        }
    }

    @Test
    void 세시간이_지난_판이나_다른_회원의_판과는_비교하지_않는다() {
        var watch = new JumpmapMacroWatch();
        for (int index = 0; index < 3; index++) {
            watch.evaluate("7", run(index, 20, 0, null), index * 60_000L);
        }

        assertThat(watch.evaluate("8", run(3, 20, 0, null), 180_000)).isEmpty();
        assertThat(watch.evaluate("7", run(3, 20, 0, null), 3 * HOUR + 180_000)).isEmpty();
    }

    @Test
    void 두_규칙에_함께_걸린_판은_규칙마다_한건씩_돌려준다() {
        var watch = new JumpmapMacroWatch();
        var dwell = new Dwell(-53.2, -11.4, 2_000, 1_500, false);
        for (int index = 0; index < 3; index++) {
            watch.evaluate("7", run(index, 20, 0, dwell), index * 60_000L);
        }

        assertThat(rules(watch.evaluate("7", run(3, 20, 0, dwell), 180_000)))
                .containsExactly(JumpmapMacroWatch.REPLAY, JumpmapMacroWatch.FIXED_START);
    }
}
