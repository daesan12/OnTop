package com.ssafy.ontop.world.jumpmap;

import com.ssafy.ontop.world.jumpmap.JumpmapTracker.Sample;
import com.ssafy.ontop.world.jumpmap.JumpmapTracker.Surface;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import static org.assertj.core.api.Assertions.assertThat;

/** 착지 감지·판 시작·종료 사유. 표본은 서버 물리가 만든 지지면이라고 가정한다. */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JumpmapTrackerTests {
    private JumpCourse course;

    @BeforeAll
    void prepare() throws Exception {
        course = JumpCourse.loadDefault();
    }

    private JumpmapTracker tracker() {
        var ids = new AtomicInteger();
        return new JumpmapTracker(course, () -> "run-" + ids.incrementAndGet());
    }

    private Sample pad(int block) {
        var c = course.colliders().get(block);
        return new Sample(Surface.COURSE, c.id(), block, c.gate(), false, c.top(), 0, false);
    }

    private static Sample air() { return Sample.of(Surface.NONE, null, false, 3, 0); }
    private static Sample ground(String id) { return Sample.of(Surface.GROUND, id, false, .1, 0); }

    private List<JumpmapTracker.Signal> start(JumpmapTracker tracker, String user) {
        tracker.observe(user, "c1", ground("vr-court-floor"), 0);
        tracker.observe(user, "c1", air(), 100);
        return tracker.observe(user, "c1", pad(0), 200);
    }

    @Test
    void 고정최소시간보다_빠른_유효착지흐름도_의심없이_완주한다() {
        var tracker = tracker();
        start(tracker, "7");
        long now = 200;
        var signals = new java.util.ArrayList<JumpmapTracker.Signal>();
        // 이미 서버가 확인한 지지면 표본이다. 실제 이동 속도·충돌 검증을 대신하지 않는다.
        for (int block = 1; block <= JumpRun.FINAL_BLOCK; block++) {
            tracker.observe("7", "c1", air(), now += 150);
            signals.addAll(tracker.observe("7", "c1", pad(block), now += 150));
        }
        var progress = signals.stream().filter(JumpmapTracker.Progress.class::isInstance)
                .map(JumpmapTracker.Progress.class::cast).toList();
        assertThat(progress.stream().filter(p -> p.outcome() instanceof JumpRun.GatePassed)).hasSize(7);
        assertThat(progress).noneMatch(p -> p.outcome() instanceof JumpRun.GateRejected);
        var finished = progress.getLast();
        assertThat(finished.outcome()).isEqualTo(new JumpRun.Ended(JumpRun.EndReason.FINISH, 33_600, 33_600L));
        assertThat(finished.run().suspicious()).isFalse();
        assertThat(finished.run().reasons()).isEmpty();
        assertThat(finished.run().gatesPassed()).isEqualTo(7);
        assertThat(finished.run().finalReached()).isTrue();
        assertThat(tracker.active("7", now)).isEmpty();
    }

    @Test
    void 판이_없을때_0번_착지로_시작하고_서있는동안은_다시_세지않는다() {
        var tracker = tracker();
        assertThat(start(tracker, "7")).containsExactly(new JumpmapTracker.Step("7", "c1", 0),
                new JumpmapTracker.Started("7", "c1", "run-1", 200));
        assertThat(tracker.observe("7", "c1", pad(0), 233)).isEmpty();
        assertThat(tracker.active("7", 300)).get().extracting(JumpmapTracker.RunView::runId).isEqualTo("run-1");
    }

    @Test
    void 배출_중에는_착지_알림만_보내고_새_판은_시작하지_않는다() {
        var tracker = tracker();
        tracker.observe("7", "c1", ground("vr-court-floor"), 0, () -> false);
        tracker.observe("7", "c1", air(), 100, () -> false);

        assertThat(tracker.observe("7", "c1", pad(0), 200, () -> false))
                .containsExactly(new JumpmapTracker.Step("7", "c1", 0));
        assertThat(tracker.active("7", 200)).isEmpty();
    }

    @Test
    void 운영상태는_새_판을_시작할_수_있는_착지에서만_조회한다() {
        var tracker = tracker();
        var checks = new AtomicInteger();
        var allowed = (java.util.function.BooleanSupplier) () -> {
            checks.incrementAndGet();
            return true;
        };

        tracker.observe("7", "c1", ground("vr-court-floor"), 0, allowed);
        tracker.observe("7", "c1", air(), 100, allowed);
        tracker.observe("7", "c1", pad(1), 200, allowed);
        tracker.observe("7", "c1", air(), 300, allowed);
        assertThat(checks).hasValue(0);

        tracker.observe("7", "c1", pad(0), 400, allowed);
        assertThat(checks).hasValue(1);
        assertThat(tracker.active("7", 400)).isPresent();
    }

    @Test
    void 입장_첫표본에서_이미_서있던_발판은_착지가_아니다() {
        var tracker = tracker();
        assertThat(tracker.observe("7", "c1", pad(0), 0)).isEmpty();
        assertThat(tracker.active("7", 0)).isEmpty();
    }

    @Test
    void 따라가기_중이거나_회원이_아니면_시작하지_않지만_착지알림은_보낸다() {
        var tracker = tracker();
        tracker.observe("7", "c1", air(), 0);
        var following = new Sample(Surface.COURSE, "future-jump-pad-0", 0, null, false, .65, 0, true);
        assertThat(tracker.observe("7", "c1", following, 100)).containsExactly(new JumpmapTracker.Step("7", "c1", 0));
        assertThat(tracker.active("7", 100)).isEmpty();

        tracker.observe("dev-1", "c1", air(), 0);
        assertThat(tracker.observe("dev-1", "c1", pad(0), 100)).containsExactly(new JumpmapTracker.Step("dev-1", "c1", 0));
        assertThat(tracker.active("dev-1", 100)).isEmpty();
    }

    @Test
    void 같은_발판_착지알림은_150ms_안에_다시_보내지_않는다() {
        var tracker = tracker();
        start(tracker, "7");
        tracker.observe("7", "c1", air(), 250);
        assertThat(tracker.observe("7", "c1", pad(0), 300)).isEmpty();
        tracker.observe("7", "c1", air(), 320);
        assertThat(tracker.observe("7", "c1", pad(0), 350)).containsExactly(new JumpmapTracker.Step("7", "c1", 0));
    }

    @Test
    void 지면은_FALL이고_높은_구조물은_판을_잇는다() {
        var tracker = tracker();
        start(tracker, "7");
        tracker.observe("7", "c1", air(), 300);
        assertThat(tracker.observe("7", "c1", Sample.of(Surface.STRUCTURE, "vr-pagoda-body", false, 14, 0), 400)).isEmpty();
        assertThat(tracker.active("7", 400)).isPresent();
        tracker.observe("7", "c1", air(), 500);
        var signals = tracker.observe("7", "c1", ground("vr-court-floor"), 600);
        assertThat(signals).singleElement().isInstanceOfSatisfying(JumpmapTracker.Progress.class, p ->
                assertThat(p.outcome()).isEqualTo(new JumpRun.Ended(JumpRun.EndReason.FALL, 400, null)));
        assertThat(tracker.active("7", 600)).isEmpty();
    }

    @Test
    void 서버_순간이동은_RESET이고_호수_진입은_LAKE다() {
        var tracker = tracker();
        start(tracker, "7");
        var moved = Sample.of(Surface.STRUCTURE, "P0-floor", false, 2, 1);
        assertThat(tracker.observe("7", "c1", moved, 400)).singleElement().isInstanceOfSatisfying(JumpmapTracker.Progress.class,
                p -> assertThat(((JumpRun.Ended) p.outcome()).reason()).isEqualTo(JumpRun.EndReason.RESET));

        start(tracker, "8");
        var lake = Sample.of(Surface.NONE, null, true, -.5, 0);
        assertThat(tracker.observe("8", "c1", lake, 700)).singleElement().isInstanceOfSatisfying(JumpmapTracker.Progress.class,
                p -> assertThat(((JumpRun.Ended) p.outcome()).reason()).isEqualTo(JumpRun.EndReason.LAKE));
    }

    @Test
    void 최고높이와_30분_TIMEOUT과_퇴장_사유를_전달한다() {
        var tracker = tracker();
        start(tracker, "7");
        tracker.observe("7", "c1", Sample.of(Surface.NONE, null, false, 27.4, 0), 300);
        tracker.observe("7", "c1", Sample.of(Surface.NONE, null, false, 12, 0), 400);
        assertThat(tracker.active("7", 500)).get().extracting(JumpmapTracker.RunView::maxHeight).isEqualTo(27.4);
        var timeout = tracker.tick("7", 200 + JumpRun.TIMEOUT_MS);
        assertThat(timeout).singleElement().isInstanceOfSatisfying(JumpmapTracker.Progress.class,
                p -> assertThat(((JumpRun.Ended) p.outcome()).reason()).isEqualTo(JumpRun.EndReason.TIMEOUT));

        start(tracker, "8");
        assertThat(tracker.leave("8", JumpRun.EndReason.LEFT, 900)).singleElement().isInstanceOfSatisfying(JumpmapTracker.Progress.class,
                p -> assertThat(((JumpRun.Ended) p.outcome()).reason()).isEqualTo(JumpRun.EndReason.LEFT));
        assertThat(tracker.leave("8", JumpRun.EndReason.DISCONNECT, 950)).isEmpty();
    }

    @Test
    void 다른_채널_표본이_오면_이전_판은_LEFT로_끝난다() {
        var tracker = tracker();
        start(tracker, "7");
        var signals = tracker.observe("7", "c2", air(), 400);
        assertThat(signals).singleElement().isInstanceOfSatisfying(JumpmapTracker.Progress.class, p -> {
            assertThat(p.channelId()).isEqualTo("c1");
            assertThat(((JumpRun.Ended) p.outcome()).reason()).isEqualTo(JumpRun.EndReason.LEFT);
        });
    }

    @Test
    void 문_착지를_판정하고_건너뛰기_우회는_인정하지_않는다() {
        var tracker = tracker();
        start(tracker, "7");
        long at = 200;
        for (int block = 1; block <= 23; block++) {
            tracker.observe("7", "c1", air(), at += 200);
            tracker.observe("7", "c1", pad(block), at += 250);
        }
        tracker.observe("7", "c1", air(), at += 200);
        // 1구간을 건너 3구간 문으로 바로 내려온 우회 착지는 인정하지 않는다.
        var skipped = tracker.observe("7", "c1", pad(48), at += 300);
        assertThat(skipped).filteredOn(JumpmapTracker.Progress.class::isInstance)
                .singleElement().extracting(s -> ((JumpmapTracker.Progress) s).outcome())
                .isEqualTo(new JumpRun.GateRejected(3, "GATE_SKIPPED", false));
        tracker.observe("7", "c1", air(), at += 200);
        var gate = tracker.observe("7", "c1", pad(24), at += 300);
        assertThat(gate).filteredOn(JumpmapTracker.Progress.class::isInstance)
                .singleElement().extracting(s -> ((JumpmapTracker.Progress) s).outcome())
                .isEqualTo(new JumpRun.GatePassed(1, at - 200, 5));
    }
}
