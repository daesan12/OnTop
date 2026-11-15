package com.ssafy.ontop.world.movement;

import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RenewalLandmarkCollisionTests {
    private long now = 1_000_000_000L;

    @Test
    void 메인_팔각정_긴_계단의_난간_옆으로_끝까지_내려간다() throws Exception {
        try (var physics = physics()) {
            physics.add("walker");
            physics.place("walker", 1.67, 7.52, 12.0);
            for (int frame = 0; frame < 85; frame++) {
                physics.input("walker", new MoveInput(frame + 1, 0, 1, false, false), now);
                physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            }

            var pose = physics.snapshot("walker");
            assertThat(pose.z()).isGreaterThan(18.4);
            assertThat(pose.y()).isBetween(4.7, 5.3);
        }
    }

    @Test
    void 보행_높이에서_돌탑_기단과_팔각정_벤치_외벽을_통과하지_못한다() throws Exception {
        try (var physics = physics()) {
            assertThat(physics.canStand(5.5, 24.66, -80)).isFalse();
            assertThat(physics.canStand(3.1, 7.52, 12.684)).isFalse();
            assertThat(physics.canStand(-74.7, 6.09, 69.3)).isFalse();
        }
    }

    private WorldPhysics physics() throws Exception {
        var path = Path.of("../frontend/generated/park-renewal");
        var map = PreparedParkMap.load(path.resolve("server-map.json"), path.resolve("manifest.json"),
                Set.of("channel-1"));
        return new WorldPhysics(map.createScene(), false, () -> now, true);
    }
}
