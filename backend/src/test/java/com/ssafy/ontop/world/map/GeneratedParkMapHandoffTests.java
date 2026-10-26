package com.ssafy.ontop.world.map;

import com.ssafy.ontop.world.movement.ParkScene;
import java.nio.file.Path;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.assertj.core.api.Assertions.assertThat;

@EnabledIfEnvironmentVariable(named = "TEST_GENERATED_MAP_DIR", matches = ".+")
class GeneratedParkMapHandoffTests {
    @Test
    void 전달받은_실제_생성물을_검증해도_실행_중인_맵은_전환하지_않는다() throws Exception {
        var activeBefore = ParkScene.load().metadata();
        Path directory = Path.of(System.getenv("TEST_GENERATED_MAP_DIR"));

        var result = new GeneratedParkMapLoader().load(directory.resolve("server-map.json"),
                directory.resolve("manifest.json"));

        assertThat(result.metadata().schemaVersion()).isEqualTo(2);
        assertThat(result.document().path("data").path("physics").path("meshes").isArray()).isTrue();
        assertThat(ParkScene.load().metadata()).isEqualTo(activeBefore);
        assertThat(activeBefore.schemaVersion()).isEqualTo(1);
        assertThat(activeBefore.mapVersion()).isNotEqualTo(result.metadata().mapVersion());
    }
}
