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
            assertThat(physics.useInteriorAccess("a", "vestibule")).isNotNull();
            assertThat(physics.useInteriorAccess("a", "surface")).isNotNull();
            assertThat(physics.useInteriorAccess("a", "vestibule")).isNotNull();
            physics.place("a", 1.25, 9.15, -46.9);
            assertThat(physics.useInteriorAccess("a", "passage")).isNotNull();
            assertThat(physics.useInteriorAccess("a", "passage")).isNull();
            assertThat(physics.useInteriorAccess("a", "surface")).isNull();
            physics.place("a", -57.1, 12.67, -88);
            assertThat(physics.useInteriorAccess("a", "exit")).isNull();
            physics.place("a", -51.4, 12.67, -85.25);
            for (int index = 0; index < 54; index++) {
                physics.input("a", new MoveInput(index + 1, 0, -1, false, false), now);
                physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            }
            var landing = physics.snapshot("a");
            assertThat(landing.z()).isLessThan(-91.4);
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
            assertThat(physics.useInteriorAccess("a", "entry")).isNotNull();
            assertThat(physics.useInteriorAccess("a", "return")).isNotNull()
                    .extracting(WorldPhysics.Snapshot::x).isEqualTo((double) (float) 28.7);
        }
    }

    private long now;

    @Test
    void 회랑을_한_바퀴_돌아도_위층에_발을_딛기_전엔_출구가_잠긴다() throws Exception {
        Path path = Path.of(System.getenv("TEST_RENEWAL_MAP_DIR"));
        var map = PreparedParkMap.load(path.resolve("server-map.json"), path.resolve("manifest.json"), Set.of("channel-1"));
        try (var physics = new WorldPhysics(map.createScene(), false, () -> now, true)) {
            physics.add("walker");
            physics.place("walker", -53.1, 12.65, -90.45);
            for (double[] target : new double[][]{
                    {-48, -90.45}, {-45, -91}, {18.15, -91}, {18.15, -54},
                    {-45, -54}, {-45, -91}, {-48, -90.45}, {-53.15, -90.45},
                    {-56.8, -90.4}, {-57.1, -88}}) {
                walk(physics, target[0], target[1]);
                assertThat(physics.snapshot("walker").y()).isBetween(12.3, 13.0);
            }
            assertThat(physics.useInteriorAccess("walker", "exit")).isNull();
            for (double[] target : new double[][]{
                    {-56.7, -90.7}, {-53.1, -90.7}, {-53.1, -85.4}, {-51.4, -85.35},
                    {-51.4, -92}, {-55.25, -92}, {-55.25, -91}}) {
                walk(physics, target[0], target[1]);
            }
            assertThat(physics.snapshot("walker").y()).isGreaterThan(14.8);
            for (double[] target : new double[][]{
                    {-55.25, -92}, {-51.4, -92}, {-51.4, -85.5}, {-53.1, -85.5},
                    {-53.1, -90.7}, {-56.7, -90.7}, {-57.1, -88}}) {
                walk(physics, target[0], target[1]);
            }
            assertThat(physics.useInteriorAccess("walker", "exit")).isNotNull();
        }
    }

    private long seq;

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
