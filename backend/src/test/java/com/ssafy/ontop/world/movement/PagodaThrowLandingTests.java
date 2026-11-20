package com.ssafy.ontop.world.movement;

import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class PagodaThrowLandingTests {
    @ParameterizedTest
    @CsvSource({"0, 0", "0, 1", "1, 0", "1, 1", "2, 0", "2, 1", "3, 0", "3, 1", "6, 0", "6, 1"})
    void 석탑_층의_모서리로_던진_뒤_착지하고_공원으로_빠져나올_수_있다(int tier, int diagonal) throws Exception {
        Path directory = Path.of("../frontend/generated/park-renewal");
        var scene = PreparedParkMap.load(directory.resolve("server-map.json"), directory.resolve("manifest.json"),
                Set.of("channel-1")).createScene();
        long now = 0;
        try (var physics = new WorldPhysics(scene, false, () -> 0, true)) {
            physics.add("a");
            physics.add("b");
            double y = 22.0 + 1.8 + (tier < 3 ? 2.6 + tier * 2.45 : 9.95 + (tier - 3) * 1.3) * 1.3 + .85;
            double x = diagonal == 0 ? 0 : 4.8;
            physics.place("a", x, y, -74.8);
            physics.place("b", x + .8, y, -74.8);
            assertThat(physics.pickup("a", "b")).isTrue();
            double dx = diagonal == 0 ? 0 : -Math.sqrt(.5), dz = diagonal == 0 ? -1 : -Math.sqrt(.5);
            physics.throwCarried("a", physics.carryState("a").carryId(), dx, 0, dz);
            for (int i = 0; i < 150; i++) {
                physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            }
            var landed = physics.snapshot("b");
            assertThat(physics.carryState("b")).as("끝난 던지기 %s", landed).isNull();

            for (int i = 0; i < 35; i++) {
                physics.input("b", new MoveInput(i + 1, -dx, -dz, false, false), now);
                physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            }
            var moved = physics.snapshot("b");
            assertThat(Math.hypot(moved.x() - landed.x(), moved.z() - landed.z())).as("착지 후 이동").isGreaterThan(.5);
        }
    }
}
