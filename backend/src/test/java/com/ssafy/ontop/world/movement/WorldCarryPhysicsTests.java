package com.ssafy.ontop.world.movement;

import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class WorldCarryPhysicsTests {
    private final AtomicLong now = new AtomicLong();

    private WorldPhysics pair(boolean clientPositions) throws Exception {
        Path directory = Path.of("../frontend/generated/park");
        var scene = PreparedParkMap.load(directory.resolve("server-map.json"), directory.resolve("manifest.json"),
                Set.of("one")).createScene();
        var physics = new WorldPhysics(scene, clientPositions, now::get, clientPositions);
        physics.add("a");
        physics.add("b");
        physics.place("a", 0, .84, 78);
        physics.place("b", 1, .84, 78);
        step(physics, 5);
        return physics;
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 최신맵에서_들기_중복방어_시선방향_비행과_착지후_권한을_복원한다(boolean clientPositions) throws Exception {
        try (var physics = pair(clientPositions)) {
            assertThat(physics.pickup("a", "b")).isTrue();
            String carryId = physics.carryState("a").carryId();
            assertThat(physics.pickup("b", "a")).isFalse();
            assertThat(physics.input("b", new MoveInput(1, 1, 0, true, true), now.get())).isFalse();
            step(physics, 5);
            assertThat(physics.snapshot("b").y() - physics.snapshot("a").y()).isCloseTo(1.7, within(.01));

            assertThat(physics.throwCarried("a", "old", 1, 0, 0)).isFalse();
            assertThat(physics.throwCarried("a", carryId, 1, 0, 0)).isTrue();
            assertThat(physics.throwCarried("a", carryId, 0, 1, 0)).isFalse();
            step(physics, 6);
            assertThat(physics.snapshot("b").x()).isGreaterThan(1);
            assertThat(physics.snapshot("b").motion().authority()).isNull();
            assertThat(physics.carryState("b").role()).isEqualTo("THROWN");
            step(physics, 120);

            assertThat(physics.carryState("a")).isNull();
            assertThat(physics.carryState("b")).isNull();
            assertThat(physics.snapshot("b").y()).isBetween(.7, 1.1);
            assertThat(physics.snapshot("b").motion().authority()).isEqualTo(clientPositions ? "CLIENT_VALIDATED" : null);
        }
    }

    @Test
    void 들고있는_사용자의_퇴장이나_활동시작으로_안전하게_해제한다() throws Exception {
        try (var physics = pair(true)) {
            assertThat(physics.pickup("a", "b")).isTrue();
            physics.pruneCarries(Set.of("a"));
            step(physics, 5);
            assertThat(physics.carryState("b")).isNull();
            assertThat(physics.snapshot("b").y()).isBetween(.7, 1.1);
            step(physics, 31);
            assertThat(physics.pickup("a", "b")).isTrue();
            physics.remove("a");
            step(physics, 5);
            assertThat(physics.carryState("b")).isNull();
            assertThat(physics.snapshot("b").motion().authority()).isEqualTo("CLIENT_VALIDATED");
        }
    }

    @Test
    void 캐릭터를_계속_들고_있어도_15초후에는_자동으로_내려놓는다() throws Exception {
        try (var physics = pair(true)) {
            assertThat(physics.pickup("a", "b")).isTrue();
            step(physics, 451);
            assertThat(physics.carryState("a")).isNull();
            assertThat(physics.carryState("b")).isNull();
        }
    }

    @Test
    void 최신맵의_외벽으로_던져도_벽을_통과하지_않는다() throws Exception {
        try (var physics = pair(false)) {
            physics.place("a", 87, .84, 78);
            physics.place("b", 86, .84, 78);
            step(physics, 5);
            assertThat(physics.pickup("a", "b")).isTrue();
            assertThat(physics.throwCarried("a", physics.carryState("a").carryId(), 1, 0, 0)).isTrue();
            step(physics, 100);
            assertThat(physics.snapshot("b").x()).isLessThan(89.7);
            assertThat(physics.snapshot("b").y()).isBetween(.7, 1.1);
        }
    }

    private void step(WorldPhysics physics, int ticks) {
        for (int i = 0; i < ticks; i++) {
            now.addAndGet(WorldPhysics.STEP_NANOS);
            physics.step(now.get(), Set.of());
        }
    }
}
