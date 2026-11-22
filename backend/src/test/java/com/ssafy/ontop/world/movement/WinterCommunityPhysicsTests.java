package com.ssafy.ontop.world.movement;

import static org.assertj.core.api.Assertions.assertThat;

import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.Test;

class WinterCommunityPhysicsTests {
    @Test void 최신_맵의_제작_눈밭에만_놓고_완성품의_구체_충돌을_설치한다() throws Exception {
        var directory = Path.of("../frontend/generated/park-renewal");
        var scene = PreparedParkMap.load(directory.resolve("server-map.json"), directory.resolve("manifest.json"),
                Set.of("channel-1")).createScene();
        try (var physics = new WorldPhysics(scene, false, () -> 0, true)) {
            assertThat(physics.winterTree().path("height").asDouble()).isEqualTo(12);
            assertThat(scene.data.path("winterSnowman").path("jointInsetRatio").asDouble()).isEqualTo(.45);
            var ground = physics.winterSurface(16, 43, .8);
            assertThat(ground.buildingZone()).isTrue(); assertThat(ground.clear()).isTrue();
            assertThat(physics.winterSurface(0, 88, .8).buildingZone()).isFalse();
            physics.installSnowman("one", 16, ground.groundY(), 43, .8, .6, .4);
            physics.installSnowman("one", 16, ground.groundY(), 43, .8, .6, .4);
            assertThat(physics.winterSurface(16, 43, .3).clear()).isFalse();
            assertThat(physics.winterSurface(18.5, 43, .3).clear()).isTrue();
            // 포갠 머리 꼭대기는 3.15m이며, 이전 3.6m 높이에는 유령 지지면이 없어야 한다.
            assertThat(physics.canStand(16, ground.groundY() + 3.15 + .76, 43)).isTrue();
            assertThat(physics.canStand(16, ground.groundY() + 3.6 + .76, 43)).isFalse();
            assertThat(physics.winterSurface(Double.NaN, 43, .8).clear()).isFalse();
        }
    }
}
