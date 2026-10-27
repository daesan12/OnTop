package com.ssafy.ontop.world.map;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.movement.MoveInput;
import com.ssafy.ontop.world.movement.ParkScene;
import com.ssafy.ontop.world.movement.WorldPhysics;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import static org.assertj.core.api.Assertions.assertThat;

/** FE 실제 전달본의 이동 회귀. 위치는 서버 fixture이며 현재 서버 맵을 전환하지 않는다. */
@EnabledIfEnvironmentVariable(named = "TEST_GENERATED_MAP_DIR", matches = ".+")
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class PreparedParkMovementTests {
    private ParkScene scene;
    private JsonNode data;
    private long tick;

    @BeforeAll
    void prepare() throws Exception {
        Path input = Path.of(System.getenv("TEST_GENERATED_MAP_DIR"));
        var park = PreparedParkMap.load(input.resolve("server-map.json"), input.resolve("manifest.json"),
                Set.of("channel-1"));
        scene = park.createScene();
        data = park.collisionData();
    }

    @Test
    void 새공원의_외벽과_테이블영역_충돌체를_통과하지_못한다() {
        try (var physics = actor()) {
            double half = data.path("world").path("halfSize").doubleValue();
            physics.place("a", 0, 0.84, half - 1);
            drive(physics, 15, 0, 0, false, false);
            drive(physics, 60, 0, 1, true, true);
            assertThat(physics.snapshot("a").z()).as("외벽: %s", physics.snapshot("a"))
                    .isLessThan(half - 0.3);

            JsonNode table = java.util.stream.StreamSupport.stream(data.path("boxes").spliterator(), false)
                    .filter(box -> box.path("id").asText().equals("table-1-top")).findFirst().orElseThrow();
            double x = table.path("center").get(0).doubleValue();
            double z = table.path("center").get(2).doubleValue();
            physics.place("a", x, 0.84, z + 4);
            drive(physics, 15, 0, 0, false, false);
            drive(physics, 60, 0, -1, true, false);
            assertThat(physics.snapshot("a").z()).as("테이블 영역: %s", physics.snapshot("a"))
                    .isBetween(z, z + 3.9);
        }
    }

    @Test
    void 새호수에서_수영하며_이동하고_부력_높이를_유지한다() {
        JsonNode lake = data.path("lake");
        double startX = lake.path("x").doubleValue();
        try (var physics = actor()) {
            physics.place("a", startX, floatY(), lake.path("z").doubleValue() - 18);
            drive(physics, 30, 1, 0, false, false);

            assertThat(physics.snapshot("a").swimming()).as("수영: %s", physics.snapshot("a")).isTrue();
            assertThat(physics.snapshot("a").x()).isGreaterThan(startX + 2);
            assertThat(physics.snapshot("a").y()).isBetween(floatY() - 0.2, floatY() + 0.2);
        }
    }

    @Test
    void 새디딤돌의_hull과_보조_정보로_물에서_올라선다() {
        JsonNode stone = data.path("steppingStones").get(12);
        double x = stone.path("x").doubleValue();
        double z = stone.path("z").doubleValue();
        try (var physics = actor()) {
            physics.place("a", x, floatY(), z + stone.path("depth").doubleValue() / 2 + 0.5);
            drive(physics, 2, 0, 0, false, false);
            assertThat(physics.snapshot("a").swimming()).isTrue();

            drive(physics, 10, 0, -1, false, true);
            drive(physics, 60, 0, 0, false, false);

            double standing = stone.path("top").doubleValue()
                    + data.path("movement").path("halfHeight").doubleValue()
                    + data.path("movement").path("radius").doubleValue();
            assertThat(physics.snapshot("a").y()).as("디딤돌: %s", physics.snapshot("a"))
                    .isBetween(standing - 0.1, standing + 0.2);
            assertThat(physics.snapshot("a").swimming()).isFalse();
        }
    }

    @Test
    void 새전망대의_중심과_바닥_오프셋으로_나선경사로를_오른다() {
        JsonNode tower = data.path("tower");
        double centerX = tower.path("x").doubleValue();
        double centerZ = tower.path("z").doubleValue();
        double radius = (tower.path("inner").doubleValue() + tower.path("outer").doubleValue()) / 2;
        double base = tower.path("surfaceOffset").doubleValue()
                + data.path("movement").path("halfHeight").doubleValue()
                + data.path("movement").path("radius").doubleValue() + 0.04;
        try (var physics = actor()) {
            physics.place("a", centerX + radius, base, centerZ);
            drive(physics, 10, 0, 0, false, false);
            for (int i = 0; i < 60; i++) {
                var position = physics.snapshot("a");
                double angle = Math.atan2(position.z() - centerZ, position.x() - centerX);
                drive(physics, 1, -Math.sin(angle), Math.cos(angle), false, false);
            }

            assertThat(physics.snapshot("a").y()).as("전망대: %s", physics.snapshot("a"))
                    .isBetween(base + 0.6, base + 3.1);
            assertThat(ParkScene.load().metadata().schemaVersion()).isEqualTo(1);
        }
    }

    private WorldPhysics actor() {
        tick = 0;
        var physics = new WorldPhysics(scene);
        physics.add("a");
        return physics;
    }

    private double floatY() {
        return data.path("lake").path("surfaceY").doubleValue()
                + data.path("swimming").path("floatOffset").doubleValue();
    }

    private void drive(WorldPhysics physics, int steps, double dx, double dz, boolean run, boolean jump) {
        for (int i = 0; i < steps; i++) {
            long now = ++tick * WorldPhysics.STEP_NANOS;
            physics.input("a", new MoveInput(tick, dx, dz, run, jump && i == 0), now);
            physics.step(now, Set.of());
        }
    }
}
