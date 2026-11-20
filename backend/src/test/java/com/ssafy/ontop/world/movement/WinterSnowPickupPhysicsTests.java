package com.ssafy.ontop.world.movement;

import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class WinterSnowPickupPhysicsTests {
    @Test
    void 경사길_눈의_가장자리에서도_줍고_공중에서는_줍지_못한다() throws Exception {
        var directory = Path.of("../frontend/generated/park-renewal");
        var scene = PreparedParkMap.load(directory.resolve("server-map.json"), directory.resolve("manifest.json"),
                Set.of("channel-1")).createScene();
        var pile = java.util.stream.StreamSupport.stream(scene.data.path("winterSnowPiles").spliterator(), false)
                .filter(p -> Math.abs(p.path("x").asDouble() + 77.5) < .1
                        && Math.abs(p.path("z").asDouble() + 51) < .1).findFirst().orElseThrow();
        double x = 0, z = 0, difference = 0;
        for (int i = 0; i < 24; i++) {
            double angle = i * Math.PI / 12, radius = pile.path("radius").asDouble() - .7;
            double px = pile.path("x").asDouble() + Math.cos(angle) * radius;
            double pz = pile.path("z").asDouble() + Math.sin(angle) * radius;
            double delta = Math.abs(scene.groundHeight(px, pz) - pile.path("y").asDouble());
            if (delta > difference) { x = px; z = pz; difference = delta; }
        }
        assertThat(difference).as("눈 중심과 가장자리의 실제 경사 높이 차이").isGreaterThan(.65);
        double y = scene.groundHeight(x, z) + .8;
        try (var physics = new WorldPhysics(scene, false, () -> 0, true)) {
            physics.add("a");
            physics.place("a", x, y, z);
            assertThat(physics.snowPileInReach("a", pile.path("id").asText())).isTrue();
            physics.place("a", x, y + 3, z);
            assertThat(physics.snowPileInReach("a", pile.path("id").asText())).isFalse();
        }
    }
}
