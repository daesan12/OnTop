package com.ssafy.ontop.world.movement;

import static org.assertj.core.api.Assertions.*;
import org.junit.jupiter.api.Test;
import java.util.Set;

class ClientPositionPhysicsTests {
    private long now;
    @Test void 구클라이언트의_최초방향입력은_서버이동으로_복귀해_배포중에도_움직인다() {
        try (var physics = new WorldPhysics(ParkScene.load(), true, () -> now)) {
            physics.add("a"); physics.place("a", -10, .84, 42);
            assertThat(physics.snapshot("a").motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(physics.input("a", new MoveInput(1, 1, 0, true, false), now)).isTrue();
            for (int i = 0; i < 6; i++) physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            assertThat(physics.snapshot("a").motion().authority()).isNull();
            assertThat(physics.snapshot("a").x()).isGreaterThan(-9.5);
        }
    }
    @Test void C사용자가_서버물리후_복귀할때_늦은방향입력이_C를_해제하지않는다() {
        try (var physics = new WorldPhysics(ParkScene.load(), true, () -> now)) {
            physics.add("a"); physics.place("a", -10, .84, 42);
            now = 100_000_000;
            physics.report("a", report(physics, 1, -9.5, .84), now);
            physics.serverMovement("a");
            for (int i = 0; i < 12; i++) physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            assertThat(physics.snapshot("a").motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(physics.input("a", new MoveInput(2, 1, 0, true, false), now)).isFalse();
            assertThat(physics.snapshot("a").motion().authority()).isEqualTo("CLIENT_VALIDATED");
        }
    }
    private ClientPositionValidator.Candidate report(WorldPhysics physics, long seq, double x, double y) {
        return new ClientPositionValidator.Candidate(seq, physics.snapshot("a").motion().epoch(),
                new ClientPositionValidator.Pose(x, y, 42), true, false);
    }
    @Test void 승인된위치에_서버이동을_다시_더하지않고_입력모드와_분리한다() {
        try (var physics = new WorldPhysics(ParkScene.load(), true, () -> now)) {
            physics.add("a"); physics.place("a", -10, .84, 42);
            long epoch = physics.snapshot("a").motion().epoch();
            now = 100_000_000;
            var approved = physics.report("a", report(physics, 1, -9.1, .84), now);
            assertThat(approved.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(physics.input("a", new MoveInput(2, 1, 0, true, false), now)).isFalse();
            for (int i = 0; i < 5; i++) physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            assertThat(physics.snapshot("a").x()).isEqualTo(approved.x());
            assertThat(physics.snapshot("a").motion().epoch()).isEqualTo(epoch);
            assertThat(physics.hasMovementActivity("a", now)).isTrue();
        }
    }
    @Test void 보고직후_과거시각의_catchup물리틱이_실행돼도_기한만료로_오판하지않는다() {
        try (var physics = new WorldPhysics(ParkScene.load(), true, () -> now)) {
            physics.add("a"); physics.place("a", -10, .84, 42); now = 100_000_000;
            var approved = physics.report("a", report(physics, 1, -9.5, .84), now);
            for (int i = 1; i <= 3; i++) physics.step(i * WorldPhysics.STEP_NANOS, Set.of());
            assertThat(physics.snapshot("a").motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(physics.snapshot("a").motion().epoch()).isEqualTo(approved.motion().epoch());
            assertThat(physics.snapshot("a").x()).isEqualTo(approved.x());
        }
    }
    @Test void 좌표조작거절은_승인좌표를_보존하고_서버모드로_한번만_복구한다() {
        try (var physics = new WorldPhysics(ParkScene.load(), true, () -> now)) {
            physics.add("a"); physics.place("a", -10, .84, 42);
            long epoch = physics.snapshot("a").motion().epoch(); now = 100_000_000;
            var attack = report(physics, 1, 30, .84);
            var denied = physics.report("a", attack, now);
            assertThat(denied.x()).isEqualTo(-10);
            assertThat(denied.motion().epoch()).isEqualTo(epoch + 1);
            assertThat(denied.motion().authority()).isNull();
            assertThat(physics.report("a", attack, now).motion().epoch()).isEqualTo(epoch + 1);
            for (int i = 0; i < 20; i++) physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            assertThat(physics.snapshot("a").motion().authority()).isNull();
        }
    }
    @Test void 기본서버는_위치보고를_사용하지않는다() {
        try (var physics = new WorldPhysics()) {
            physics.add("a");
            assertThatThrownBy(() -> physics.report("a", report(physics, 1, -10, .84), 0))
                    .isInstanceOf(IllegalStateException.class);
        }
    }
    @Test void 브라우저_물리준비실패는_명시적요청으로_기존_방향이동에_복귀한다() {
        try (var physics = new WorldPhysics(ParkScene.load(), true, () -> now)) {
            physics.add("a"); physics.place("a", -10, .84, 42);
            long epoch = physics.snapshot("a").motion().epoch();
            var fallback = physics.disablePosition("a", epoch);
            assertThat(fallback.motion().authority()).isNull();
            assertThat(physics.disablePosition("a", epoch).motion().epoch()).isEqualTo(fallback.motion().epoch());
            assertThat(physics.input("a", new MoveInput(1, 1, 0, false, false), now)).isTrue();
            physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            assertThat(physics.snapshot("a").x()).isGreaterThan(-10);
        }
    }
    @Test void 첫보고전_클라이언트로딩은_스폰을_유지하고_첫보고부터_기한을_적용한다() {
        try (var physics = new WorldPhysics(ParkScene.load(), true, () -> now)) {
            physics.add("a"); physics.place("a", -10, .84, 42);
            now = 5_000_000_000L; physics.step(now, Set.of());
            assertThat(physics.snapshot("a").motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(physics.report("a", report(physics, 1, -9.5, .84), now).lastInputSeq()).isEqualTo(1);
            now += 600_000_000L; physics.step(now, Set.of());
            assertThat(physics.snapshot("a").motion().authority()).isNull();
        }
    }
    @Test void 보고가_끊기면_공식공중좌표도_멈추지않고_서버중력으로_복귀한다() {
        try (var physics = new WorldPhysics(ParkScene.load(), true, () -> now)) {
            physics.add("a"); physics.place("a", -10, 3, 42);
            long epoch = physics.snapshot("a").motion().epoch();
            physics.report("a", report(physics, 1, -10, 3), now);
            for (int i = 0; i < 60; i++) physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            var result = physics.snapshot("a");
            assertThat(result.y()).isLessThan(1);
            assertThat(result.motion().authority()).isNull();
            assertThat(result.motion().epoch()).isEqualTo(epoch + 1);
        }
    }
    @Test void 신뢰된강제이동은_검증원점과_세대를_같이_갱신한다() {
        try (var physics = new WorldPhysics(ParkScene.load(), true, () -> now)) {
            physics.add("a"); physics.place("a", -10, .84, 42);
            var stale = report(physics, 1, -9.1, .84);
            physics.place("a", -20, .84, 42); now = 100_000_000;
            assertThat(physics.report("a", stale, now).x()).isEqualTo(-20);
            assertThat(physics.report("a", report(physics, 2, -19.1, .84), now).x()).isCloseTo(-19.1, within(.0001));
        }
    }
    @Test void 시설고정과_하차는_이전보고를_폐기하고_새세대의_좌표모드로_복귀한다() {
        try (var physics = new WorldPhysics(ParkScene.load(), true, () -> now)) {
            physics.add("a"); physics.place("a", -10, .84, 42);
            var old = report(physics, 1, -9.5, .84);
            physics.hold("a", -20, .84, 42, 0);
            assertThat(physics.snapshot("a").motion().authority()).isNull();
            assertThat(physics.report("a", old, now).x()).isEqualTo(-20);
            physics.step(now += WorldPhysics.STEP_NANOS, Set.of("a"));
            for (int i = 0; i < 10; i++) physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            assertThat(physics.snapshot("a").motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(physics.report("a", old, now).x()).isEqualTo(-20);
            now += 100_000_000;
            assertThat(physics.report("a", report(physics, 2, -19.5, physics.snapshot("a").y()), now).x())
                    .isCloseTo(-19.5, within(.001));
        }
    }
    @Test void 상승중_서버모드로_인계해도_수직이동이_끊기지않는다() {
        try (var physics = new WorldPhysics(ParkScene.load(), true, () -> now)) {
            physics.add("a"); physics.place("a", -10, .84, 42); now = 100_000_000;
            var candidate = new ClientPositionValidator.Candidate(1, physics.snapshot("a").motion().epoch(),
                    new ClientPositionValidator.Pose(-10, 1.3, 42), false, true);
            assertThat(physics.report("a", candidate, now).motion().authority()).isEqualTo("CLIENT_VALIDATED");
            physics.serverMovement("a");
            physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            assertThat(physics.snapshot("a").y()).isGreaterThan(1.3);
        }
    }
    @Test void 동적의자_안전이동후_새원점만_승인한다() {
        try (var physics = new WorldPhysics(ParkScene.load(), true, () -> now)) {
            physics.add("a"); physics.place("a", 2.61, 2.9, 6);
            long oldEpoch = physics.snapshot("a").motion().epoch();
            physics.chairCounts(java.util.Map.of("table-5", 4));
            var moved = physics.snapshot("a");
            assertThat(moved.motion().epoch()).isGreaterThan(oldEpoch);
            assertThat(physics.canStand(moved.x(), moved.y(), moved.z())).isTrue();
            now = 100_000_000;
            var stale = new ClientPositionValidator.Candidate(1, oldEpoch, new ClientPositionValidator.Pose(2.61, 2.9, 6), false, false);
            assertThat(physics.report("a", stale, now).x()).isEqualTo(moved.x());
            var fresh = new ClientPositionValidator.Candidate(1, moved.motion().epoch(), new ClientPositionValidator.Pose(moved.x(), moved.y(), moved.z()), false, false);
            assertThat(physics.report("a", fresh, now).lastInputSeq()).isEqualTo(1);
        }
    }
    @Test void 같은식별자가_다시입장해도_이전세대_보고를_재사용하지못한다() {
        long oldEpoch;
        try (var physics = new WorldPhysics(ParkScene.load(), true, () -> now)) {
            physics.add("a"); oldEpoch = physics.snapshot("a").motion().epoch();
        }
        try (var physics = new WorldPhysics(ParkScene.load(), true, () -> now)) {
            physics.add("a"); var initial = physics.snapshot("a"); now = 100_000_000;
            assertThat(initial.motion().epoch()).isGreaterThan(oldEpoch);
            var stale = new ClientPositionValidator.Candidate(99, oldEpoch,
                    new ClientPositionValidator.Pose(initial.x() + .5, initial.y(), initial.z()), true, false);
            assertThat(physics.report("a", stale, now).lastInputSeq()).isZero();
        }
    }
}
