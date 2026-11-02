package com.ssafy.ontop.world.movement;

import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/** BE 명세 15장 코요테·점프 버퍼 표(30Hz, 코요테 3틱, 버퍼 4틱). 점프맵 활성 채널에서만 적용된다. */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JumpGraceTests {
    private ParkScene scene;
    private JumpCourse course;
    private long now;
    private long seq;

    @BeforeAll
    void prepare() throws Exception {
        scene = PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"), Set.of("channel-1")).createScene();
        course = JumpCourse.loadDefault();
    }

    private WorldPhysics physics(boolean grace, boolean tuned) {
        var physics = new WorldPhysics(scene, false, () -> now, tuned, grace ? course : null);
        physics.add("a");
        return physics;
    }

    private void step(WorldPhysics physics, double dx, boolean jump) {
        physics.input("a", new MoveInput(++seq, dx, 0, false, jump), now);
        physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
    }

    /** 기존 석탑 몸체(꼭대기 14m, x -56~-50) 위에서 +x 가장자리로 걸어 떨어진다. 코스 유무와 상관없이 있는 구조물이다. */
    private void walkOff(WorldPhysics physics, int airborne) {
        physics.place("a", -50.6, 15, -23);
        for (int i = 0; i < 30; i++) physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
        assertThat(physics.snapshot("a").motion().grounded()).isTrue();
        int air = 0;
        for (int i = 0; i < 60 && air < airborne; i++) {
            step(physics, 1, false);
            air = physics.snapshot("a").motion().grounded() ? 0 : air + 1;
        }
        assertThat(air).isEqualTo(airborne);
    }

    private boolean jumped(WorldPhysics physics, double dx) {
        double before = physics.snapshot("a").y();
        step(physics, dx, true);
        step(physics, dx, false);
        return physics.snapshot("a").y() > before;
    }

    @ParameterizedTest
    @ValueSource(booleans = {true, false})
    void 걸어나가_3틱째_입력은_코요테로_뛰고_4틱째는_뛰지_않는다(boolean tuned) {
        try (var physics = physics(true, tuned)) {
            walkOff(physics, 2);
            assertThat(jumped(physics, 1)).as("3틱째").isTrue();
        }
        try (var physics = physics(true, tuned)) {
            walkOff(physics, 3);
            assertThat(jumped(physics, 1)).as("4틱째").isFalse();
        }
    }

    @Test
    void 코요테로_뛴_공중에서_다시_뛰지_못하고_점프로_떠나면_코요테가_없다() {
        try (var physics = physics(true, true)) {
            walkOff(physics, 1);
            assertThat(jumped(physics, 1)).isTrue();
            double vy = physics.snapshot("a").motion().velocityY();
            step(physics, 1, true);
            step(physics, 1, false);
            assertThat(physics.snapshot("a").motion().velocityY()).as("같은 공중 두 번째").isLessThan(vy);
        }
        try (var physics = physics(true, true)) {
            var pad = course.colliders().get(13);
            physics.place("a", pad.x(), pad.top() + 1, pad.z());
            for (int i = 0; i < 30; i++) physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            step(physics, 0, true);
            step(physics, 0, false);
            assertThat(physics.snapshot("a").motion().grounded()).isFalse();
            double vy = physics.snapshot("a").motion().velocityY();
            step(physics, 0, true);
            step(physics, 0, false);
            assertThat(physics.snapshot("a").motion().velocityY()).as("점프 후 1틱째 재점프 없음").isLessThan(vy);
        }
    }

    /** 0.9m 높이에서 떨어뜨려 착지 틱을 구한 뒤, 착지 n틱 전에 점프를 넣는다. */
    private boolean bufferedJump(int ticksBeforeLanding) {
        int landing;
        try (var probe = physics(true, true)) {
            probe.place("a", 10, 3.5, 70);
            landing = 0;
            while (!probe.snapshot("a").motion().grounded()) { probe.step(now += WorldPhysics.STEP_NANOS, Set.of()); landing++; }
        }
        try (var physics = physics(true, true)) {
            physics.place("a", 10, 3.5, 70);
            for (int i = 0; i < landing - ticksBeforeLanding; i++) physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            physics.input("a", new MoveInput(++seq, 0, 0, false, true), now);
            double highest = Double.NEGATIVE_INFINITY, landedY = Double.NaN;
            for (int i = 0; i < 40; i++) {
                physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
                var state = physics.snapshot("a");
                if (Double.isNaN(landedY) && state.motion().grounded()) landedY = state.y();
                if (!Double.isNaN(landedY)) highest = Math.max(highest, state.y());
            }
            return highest > landedY + .3;
        }
    }

    @Test
    void 착지_4틱_전_입력은_착지하자마자_뛰고_5틱_전은_버린다() {
        assertThat(bufferedJump(4)).isTrue();
        assertThat(bufferedJump(5)).isFalse();
    }

    @Test
    void 점프맵_비활성은_기존처럼_공중_점프입력을_버리고_보조_필드를_싣지_않는다() {
        try (var physics = physics(false, true)) {
            walkOff(physics, 1);
            assertThat(jumped(physics, 1)).isFalse();
            assertThat(physics.snapshot("a").motion().jumpGrace()).isNull();
        }
        try (var physics = physics(true, true)) {
            var pad = course.colliders().get(13);
            physics.place("a", pad.x(), pad.top() + 1, pad.z());
            for (int i = 0; i < 30; i++) physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            assertThat(physics.snapshot("a").motion().jumpGrace()).isEqualTo(new WorldPhysics.JumpGrace(3, 0));
            physics.input("a", new MoveInput(++seq, 0, 0, false, true), now);
            assertThat(physics.snapshot("a").motion().jumpGrace().jumpBufferTicks()).isEqualTo(4);
            physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            // 점프 소비 후 모두 0, 순간 이동은 창을 지운다.
            assertThat(physics.snapshot("a").motion().jumpGrace()).isEqualTo(new WorldPhysics.JumpGrace(0, 0));
            physics.input("a", new MoveInput(++seq, 0, 0, false, true), now);
            physics.place("a", pad.x(), pad.top() + 1, pad.z());
            assertThat(physics.snapshot("a").motion().jumpGrace().jumpBufferTicks()).isZero();
        }
    }

    @Test
    void 위치보고_검증은_걸어나간_직후_한번의_코요테_점프만_받는다() {
        var clock = new AtomicLong();
        ClientPositionValidator.Geometry edge = new ClientPositionValidator.Geometry() {
            public boolean supported(ClientPositionValidator.Pose pose) { return pose.x() < 0 && Math.abs(pose.y() - 1) < .01; }
            public boolean clear(ClientPositionValidator.Pose from, ClientPositionValidator.Pose to, boolean step) { return true; }
            public Double ceiling(ClientPositionValidator.Pose from, double rise) { return null; }
        };
        for (boolean grace : new boolean[] {true, false}) {
            clock.set(0);
            var validator = new ClientPositionValidator(new ClientPositionValidator.Pose(-.1, 1, 0), 1, 80, edge, clock::get, true);
            validator.jumpGrace(grace);
            clock.set(50_000_000);
            assertThat(validator.accept(candidate(1, .2, .98, false)).accepted()).isTrue();
            clock.set(110_000_000);
            var jump = validator.accept(candidate(2, .5, 1.25, true));
            assertThat(jump.accepted()).as("코요테 grace=%s %s", grace, jump.reason()).isEqualTo(grace);
            if (grace) {
                clock.set(170_000_000);
                assertThat(validator.accept(candidate(3, .8, 1.5, false)).accepted()).isTrue();
                clock.set(230_000_000);
                assertThat(validator.accept(candidate(4, 1.1, 1.3, true)).accepted()).isTrue();
                // 같은 공중의 두 번째 점프는 더 높이 올라갈 수 없다.
                clock.set(290_000_000);
                assertThat(validator.accept(candidate(5, 1.4, 2.9, true)).accepted()).isFalse();
            }
        }
        // 걸어 나간 뒤 150ms가 지나면 점프로 올라갈 수 없다.
        clock.set(0);
        var late = new ClientPositionValidator(new ClientPositionValidator.Pose(-.1, 1, 0), 1, 80, edge, clock::get, true);
        late.jumpGrace(true);
        clock.set(50_000_000);
        late.accept(candidate(1, .2, .98, false));
        clock.set(260_000_000);
        assertThat(late.accept(candidate(2, .8, 1.1, true)).accepted()).isFalse();
    }

    private static ClientPositionValidator.Candidate candidate(long seq, double x, double y, boolean jump) {
        return new ClientPositionValidator.Candidate(seq, 1, new ClientPositionValidator.Pose(x, y, 0), false, jump);
    }
}
