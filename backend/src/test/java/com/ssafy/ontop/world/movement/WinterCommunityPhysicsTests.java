package com.ssafy.ontop.world.movement;

import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class WinterCommunityPhysicsTests {
    @Test
    void 최신_공원에서_편지_상호작용의_트리_크기와_바닥_높이를_읽는다() throws Exception {
        var directory = Path.of("../frontend/generated/park-renewal");
        var scene = PreparedParkMap.load(directory.resolve("server-map.json"), directory.resolve("manifest.json"),
                Set.of("channel-1")).createScene();
        try (var physics = new WorldPhysics(scene, false, () -> 0, true)) {
            var tree = physics.winterTree();
            assertThat(tree.path("height").asDouble()).isEqualTo(7.8);
            assertThat(physics.winterGround(tree.path("x").asDouble(), tree.path("z").asDouble()))
                    .isCloseTo(tree.path("y").asDouble(), within(0.000001));
        }
    }
}
