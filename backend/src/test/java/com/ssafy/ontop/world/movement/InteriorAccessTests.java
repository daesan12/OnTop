package com.ssafy.ontop.world.movement;

import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.assertj.core.api.Assertions.assertThat;

@EnabledIfEnvironmentVariable(named = "TEST_RENEWAL_MAP_DIR", matches = ".+")
class InteriorAccessTests {
    @Test
    void 실제_공원에서_출입문과_층별_이동을_판정한다() throws Exception {
        Path path = Path.of(System.getenv("TEST_RENEWAL_MAP_DIR"));
        var map = PreparedParkMap.load(path.resolve("server-map.json"), path.resolve("manifest.json"), Set.of("channel-1"));
        try (var physics = new WorldPhysics(map.createScene(), false, () -> now, true)) {
            physics.add("a");
            physics.add("b");
            physics.place("a", 3.65, 9.22, -43.1);
            assertThat(physics.useInteriorAccess("a", "vestibule")).isNotNull()
                    .extracting(WorldPhysics.Snapshot::x).isEqualTo((double) (float) 1.06);
            assertThat(physics.useInteriorAccess("a", "vestibule")).isNull();
            assertThat(physics.useInteriorAccess("a", "surface")).isNotNull();
            assertThat(physics.useInteriorAccess("a", "passage")).isNull();
            physics.place("a", 1.25, 9.15, -46.9);
            assertThat(physics.useInteriorAccess("a", "passage")).isNotNull();
            assertThat(physics.useInteriorAccess("a", "passage")).isNull();
            assertThat(physics.useInteriorAccess("a", "surface")).isNull();
            physics.place("a", -57.1, 12.67, -88);
            assertThat(physics.useInteriorAccess("a", "exit")).isNull();
            // 3층 좁은 통로에서 꼭대기 방 동쪽 문으로 들어서면 출구가 열린다.
            physics.place("a", -46.5, 15.01, -92.2);
            for (int index = 0; index < 90; index++) {
                physics.input("a", new MoveInput(index + 1, -1, 0, false, false), now);
                physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            }
            var landing = physics.snapshot("a");
            assertThat(landing.x()).isLessThan(-50.0);
            assertThat(landing.y()).isGreaterThan(14.8);
            assertThat(landing.interiorExitReady()).isTrue();
            physics.place("a", -57.1, 12.67, -88);
            physics.place("b", -57.1, 12.67, -88);
            assertThat(physics.snapshot("a").interiorExitReady()).isTrue();
            assertThat(physics.snapshot("b").interiorExitReady()).isFalse();
            assertThat(physics.useInteriorAccess("b", "exit")).isNull();
            assertThat(physics.useInteriorAccess("a", "exit")).isNotNull()
                    .extracting(WorldPhysics.Snapshot::interiorExitReady).isEqualTo(false);
            physics.place("a", -57.1, 12.67, -88);
            assertThat(physics.useInteriorAccess("a", "exit")).isNull();
            physics.place("a", 27.35, 7.6, -82);
            assertThat(physics.useInteriorAccess("a", "return")).isNull();
            assertThat(physics.useInteriorAccess("a", "entry")).isNotNull()
                    .extracting(WorldPhysics.Snapshot::x).isEqualTo((double) (float) 25.25);
            assertThat(physics.useInteriorAccess("a", "entry")).isNull();
            assertThat(physics.useInteriorAccess("a", "return")).isNotNull()
                    .extracting(WorldPhysics.Snapshot::x).isEqualTo((double) (float) 28.7);
        }
    }

    @Test
    void 열린_입구_앞에서_지면_아래로_빠지지_않고_문을_통해_진입한다() throws Exception {
        var path = Path.of(System.getenv("TEST_RENEWAL_MAP_DIR"));
        var map = PreparedParkMap.load(path.resolve("server-map.json"), path.resolve("manifest.json"), Set.of("channel-1"));
        try (var physics = new WorldPhysics(map.createScene(), false, () -> now, true)) {
            physics.add("walker");
            physics.place("walker", 28.8, 7.65, -82);
            for (int frame = 0; frame < 55; frame++) {
                physics.input("walker", new MoveInput(++seq, -1, 0, false, false), now);
                physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
                var pose = physics.snapshot("walker");
                assertThat(pose.x()).isGreaterThan(26.0);
                assertThat(pose.y()).isGreaterThan(7.45);
            }
            assertThat(physics.useInteriorAccess("walker", "entry")).isNotNull()
                    .extracting(WorldPhysics.Snapshot::x).isEqualTo((double) (float) 25.25);
            assertThat(physics.lastRecovery("walker")).isNull();
        }
    }

    private long now;

    @Test
    void 회랑을_한_바퀴_돌아도_위층에_발을_딛기_전엔_출구가_잠긴다() throws Exception {
        Path path = Path.of(System.getenv("TEST_RENEWAL_MAP_DIR"));
        var map = PreparedParkMap.load(path.resolve("server-map.json"), path.resolve("manifest.json"), Set.of("channel-1"));
        try (var physics = new WorldPhysics(map.createScene(), false, () -> now, true)) {
            physics.add("walker");
            // 경사로를 올라온 착지: 출구는 창살 너머에 있다.
            physics.place("walker", -50.8, 12.65, -86.5);
            for (double[] target : new double[][]{
                    {-50.8, -90.2}, {-48, -91.6}, {16.9, -91.6}, {16.9, -54},
                    {-45, -54}, {-45, -91.6}, {-48, -91.6}, {-50.8, -90.2}, {-50.8, -86.5}}) {
                walk(physics, target[0], target[1]);
                assertThat(physics.snapshot("walker").y()).isBetween(12.3, 13.0);
            }
            assertThat(tryWalk(physics, -56.4, -87)).isFalse();
            assertThat(physics.useInteriorAccess("walker", "exit")).isNull();
            // 동쪽 끝 계단으로 3층 → 다리 → 서쪽 통로 → 꼭대기 방 → 창살 안쪽으로 내려가는 계단 → 출구.
            for (double[] target : new double[][]{
                    {-50.8, -90.2}, {-48, -91.6}, {16.9, -91.6}, {16.9, -81}, {18.8, -80}, {18.8, -72.2},
                    {15, -71.7}, {-45.75, -71.7}, {-45.75, -92.2}, {-50.4, -92.2}, {-53.7, -92}}) {
                walk(physics, target[0], target[1]);
            }
            assertThat(physics.snapshot("walker").y()).isGreaterThan(14.8);
            assertThat(physics.snapshot("walker").interiorExitReady()).isTrue();
            for (double[] target : new double[][]{{-53.7, -91}, {-53.7, -86.6}, {-56.4, -87}, {-57.1, -88}}) {
                walk(physics, target[0], target[1]);
            }
            assertThat(physics.useInteriorAccess("walker", "exit")).isNotNull();
        }
    }

    private long seq;

    /** Walk towards (x, z) for a while; whether it got there. */
    private boolean tryWalk(WorldPhysics physics, double x, double z) {
        for (int i = 0; i < 400; i++) {
            var pose = physics.snapshot("walker");
            double dx = x - pose.x(), dz = z - pose.z();
            double distance = Math.hypot(dx, dz);
            if (distance < .3) return true;
            physics.input("walker", new MoveInput(++seq, dx / distance, dz / distance, false, false), now);
            physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
        }
        return false;
    }

    private void walk(WorldPhysics physics, double x, double z) {
        for (int i = 0; i < 800; i++) {
            var pose = physics.snapshot("walker");
            double dx = x - pose.x(), dz = z - pose.z();
            double distance = Math.hypot(dx, dz);
            if (distance < .16) return;
            physics.input("walker", new MoveInput(++seq, dx / distance, dz / distance, false, false), now);
            physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
        }
        throw new AssertionError("이동 목표: " + x + ", " + z + "; 현재 위치: " + physics.snapshot("walker"));
    }
}
