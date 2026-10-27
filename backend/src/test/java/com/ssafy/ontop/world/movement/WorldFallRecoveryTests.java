package com.ssafy.ontop.world.movement;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.world.dto.WorldMapMetadata;
import java.util.Set;
import org.junit.jupiter.api.Test;

class WorldFallRecoveryTests {
    private long tick;

    @Test
    void 유효좌표의_지형관통은_이전_높은_발판으로_돌려보내지_않는다() {
        try (var physics = new WorldPhysics(platformScene())) {
            physics.add("a");
            physics.place("a", 0, 10.8, 0);
            drive(physics, 20, 0);
            var platform = physics.snapshot("a");
            assertThat(platform.y()).isBetween(10.6, 10.9);
            // 실제 물리 지형 관통 뒤 위치를 서버 fixture로 재현한다. 클라이언트 좌표 입력이 아니다.
            physics.place("a", 5, -.4, 0);
            drive(physics, 1, 0);
            var recovered = physics.snapshot("a");
            System.out.println("FALL_RECOVERY before=" + platform + " recovered=" + recovered);
            assertThat(recovered.x()).isBetween(4.9, 5.1);
            assertThat(recovered.y()).isBetween(.7, 1.0);
            var evidence=physics.lastRecovery("a");
            assertThat(evidence.reason()).isEqualTo("TERRAIN_PENETRATION");
            assertThat(evidence.previousSafeY()).isBetween(10.6,10.9);
            assertThat(evidence.terrainHeight()).isZero();
            System.out.println("FALL_DIAGNOSTIC "+evidence);
        }
    }

    @Test
    void 높은발판에서_떨어지면_현재위치_지면에_착지한다() {
        try (var physics = new WorldPhysics(platformScene())) {
            physics.add("a");
            physics.place("a", 0, 10.8, 0);
            drive(physics, 20, 0);
            drive(physics, 20, 1);
            drive(physics, 100, 0);
            assertThat(physics.snapshot("a").x()).isGreaterThan(3);
            assertThat(physics.snapshot("a").y()).isBetween(.7, .9);
            assertThat(physics.lastRecovery("a")).isNull();
        }
    }

    private void drive(WorldPhysics physics, int steps, double dx) {
        for (int i = 0; i < steps; i++) {
            long now = ++tick * WorldPhysics.STEP_NANOS;
            physics.input("a", new MoveInput(tick, dx, 0, false, false), now);
            physics.step(now, Set.of());
        }
    }

    private static ParkScene platformScene() {
        ObjectNode data = (ObjectNode) ParkScene.load().data.deepCopy();
        ((ObjectNode) data.path("lake")).put("x", 1000).put("z", 1000);
        ArrayNode vertices = (ArrayNode) data.path("meshes").get(0).path("vertices");
        for (int i = 1; i < vertices.size(); i += 3) { vertices.set(i, vertices.numberNode(0)); }
        ArrayNode meshes = data.putArray("meshes");
        ObjectNode terrain = meshes.addObject();
        terrain.put("id", "terrain");
        terrain.set("vertices", vertices);
        terrain.set("indices", ParkScene.load().data.path("meshes").get(0).path("indices").deepCopy());
        data.putArray("hulls");
        data.putArray("steppingStones");
        ObjectNode box = data.putArray("boxes").addObject();
        box.put("id", "high-platform");
        box.putArray("center").add(0).add(9.5).add(0);
        box.putArray("half").add(2).add(.5).add(2);
        box.put("yaw", 0);
        return ParkScene.fromPreparedData(data, new WorldMapMetadata("park", 1, "a".repeat(64)));
    }
}
