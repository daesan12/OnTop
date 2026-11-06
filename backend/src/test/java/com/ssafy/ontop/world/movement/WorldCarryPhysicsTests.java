package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class WorldCarryPhysicsTests {
    private final AtomicLong now = new AtomicLong();

    @Test
    void 달리는_중이어도_정적벽_너머의_상대는_들수없다() throws Exception {
        try (var physics = pair(false, true)) {
            physics.place("a", 18.9, .84, 78);
            physics.place("b", 21.1, .84, 78);
            physics.input("b", new MoveInput(1, 1, 0, true, false), now.get());

            assertThat(physics.pickup("a", "b")).isFalse();
            assertThat(physics.carryState("a")).isNull();
        }
    }

    @ParameterizedTest
    @CsvSource({"false,a", "false,b", "true,a", "true,b"})
    void 달리는_점프_도중_어느쪽이_공중에_있어도_들고_던질수있다(
            boolean clientPositions, String jumper) throws Exception {
        try (var physics = pair(clientPositions)) {
            var start = physics.snapshot(jumper);
            if (clientPositions) {
                for (int seq = 1; seq <= 2; seq++) {
                    now.addAndGet(100_000_000L);
                    var approved = physics.report(jumper, new ClientPositionValidator.Candidate(seq,
                            start.motion().epoch(), new ClientPositionValidator.Pose(
                            start.x() + seq * .1, start.y() + (seq == 1 ? .65 : 1), start.z()), true, seq == 1),
                            now.get());
                    assertThat(approved.motion().correctionReason()).isNull();
                }
            } else {
                assertThat(physics.input(jumper, new MoveInput(1, 1, 0, true, true), now.get())).isTrue();
                step(physics, 5);
            }
            assertThat(physics.snapshot(jumper).motion().grounded()).isFalse();
            assertThat(physics.snapshot(jumper).y()).isGreaterThan(start.y() + .3);
            assertThat(physics.hasMovementActivity(jumper, now.get())).isTrue();

            assertThat(physics.pickup("a", "b")).isTrue();
            assertThat(physics.hasMovementActivity("b", now.get())).isFalse();
            step(physics, 2);
            assertThat(physics.snapshot("b").y()).isCloseTo(physics.snapshot("a").y() + 1.7, within(.01));
            var launch = physics.snapshot("b");
            assertThat(physics.throwCarried("a", physics.carryState("a").carryId(), -1, 0, 0)).isTrue();
            step(physics, 6);

            assertThat(physics.carryState("b").role()).isEqualTo("THROWN");
            assertThat(physics.snapshot("b").x()).isLessThan(launch.x() - 2.5);
        }
    }

    @Test
    void 점프가_물리틱에_적용되기_전에도_들수있고_운반자의_점프를_유지한다() throws Exception {
        try (var physics = pair(false)) {
            double startY = physics.snapshot("a").y();
            assertThat(physics.input("a", new MoveInput(1, 0, 0, false, true), now.get())).isTrue();

            assertThat(physics.pickup("a", "b")).isTrue();
            step(physics, 5);

            assertThat(physics.snapshot("a").y()).isGreaterThan(startY + .3);
            assertThat(physics.carryState("b").role()).isEqualTo("CARRIED");
            assertThat(physics.snapshot("b").y()).isCloseTo(physics.snapshot("a").y() + 1.7, within(.01));
        }
    }

    @ParameterizedTest
    @CsvSource({"false,-1,0", "true,-1,0", "false,0,1", "true,0,1", "false,0,-1", "true,0,-1",
            "false,0.6,-0.8", "true,0.6,-0.8"})
    void 투척은_캐리어_방향과_무관하게_요청한_수평_시선을_따른다(
            boolean clientPositions, double aimX, double aimZ) throws Exception {
        try (var physics = pair(clientPositions)) {
            assertThat(physics.pickup("a", "b")).isTrue();
            var start = physics.snapshot("b");

            assertThat(physics.throwCarried("a", physics.carryState("a").carryId(), aimX, 0, aimZ)).isTrue();
            step(physics, 6);

            var airborne = physics.snapshot("b");
            double dx = airborne.x() - start.x();
            double dz = airborne.z() - start.z();
            assertThat(physics.carryState("b").role()).isEqualTo("THROWN");
            assertThat(dx * aimX + dz * aimZ).isGreaterThan(2.5);
            assertThat(dx * aimZ - dz * aimX).isCloseTo(0, within(.01));
        }
    }

    @ParameterizedTest
    @CsvSource({"false,-0.5", "true,-0.5", "false,0.0", "true,0.0", "false,0.5", "true,0.5"})
    void 시선_방향으로_던지면_상승하는_포물선으로_충분히_날아간뒤_착지한다(
            boolean clientPositions, double aimY) throws Exception {
        try (var physics = pair(clientPositions)) {
            assertThat(physics.pickup("a", "b")).isTrue();
            var start = physics.snapshot("b");
            assertThat(physics.throwCarried("a", physics.carryState("a").carryId(),
                    Math.sqrt(1 - aimY * aimY), aimY, 0)).isTrue();
            double peak = start.y();
            int ticks = 0;
            while (physics.carryState("b") != null && ticks < 90) {
                step(physics, 1);
                peak = Math.max(peak, physics.snapshot("b").y());
                ticks++;
            }

            var landed = physics.snapshot("b");
            double distance = landed.x() - start.x();
            assertThat(distance).as("aimY=%s distance=%s peakRise=%s ticks=%s",
                    aimY, distance, peak - start.y(), ticks).isBetween(6d, 24d);
            assertThat(peak - start.y()).isGreaterThan(.3);
            assertThat(ticks).isBetween(15, 75);
            assertThat(physics.carryState("b")).isNull();
            assertThat(landed.y()).isBetween(.7, 1.1);
        }
    }

    private WorldPhysics pair(boolean clientPositions) throws Exception {
        return pair(clientPositions, false);
    }

    private WorldPhysics pair(boolean clientPositions, boolean obstacles) throws Exception {
        Path directory = Path.of("../frontend/generated/park");
        var scene = PreparedParkMap.load(directory.resolve("server-map.json"), directory.resolve("manifest.json"),
                Set.of("one")).createScene();
        if (obstacles) {
            ObjectNode data = scene.data.deepCopy();
            addBox(data, "carry-wall", 20, 1.7, 78, .5, 1.7, .5);
            addBox(data, "carry-ceiling", 24, 2.6, 78, 1, .2, 1);
            scene = ParkScene.fromPreparedData(data, scene.metadata());
        }
        var physics = new WorldPhysics(scene, clientPositions, now::get, clientPositions);
        physics.add("a");
        physics.add("b");
        physics.place("a", 0, .84, 78);
        physics.place("b", 1, .84, 78);
        step(physics, 5);
        return physics;
    }

    @Test
    void 머리위에_다른_플레이어가_겹쳐도_운반은_유지되고_정적천장에서는_해제한다() throws Exception {
        try (var physics = pair(false, true)) {
            physics.add("c");
            physics.place("c", 0, 2.54, 78);

            assertThat(physics.pickup("a", "b")).isTrue();
            step(physics, 1);
            assertThat(physics.carryState("b").role()).isEqualTo("CARRIED");
            physics.place("a", 24, .84, 78);
            step(physics, 1);

            assertThat(physics.carryState("b")).isNull();
            assertThat(physics.snapshot("b").x()).isCloseTo(24, within(.1));
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 달리는_운반자를_따라_좌표와_보간용_틱을_매번_갱신한다(boolean clientPositions) throws Exception {
        try (var physics = pair(clientPositions)) {
            assertThat(physics.pickup("a", "b")).isTrue();
            long previousTick = physics.snapshot("b").motion().tick();

            for (int i = 1; i <= 30; i++) {
                var carrier = physics.snapshot("a");
                if (clientPositions) {
                    now.addAndGet(WorldPhysics.STEP_NANOS);
                    var approved = physics.report("a", new ClientPositionValidator.Candidate(i,
                            carrier.motion().epoch(),
                            new ClientPositionValidator.Pose(carrier.x() + .15, carrier.y(), carrier.z()),
                            true, false), now.get());
                    assertThat(approved.x()).isCloseTo(carrier.x() + .15, within(.01));
                    physics.step(now.get(), Set.of());
                } else {
                    assertThat(physics.input("a", new MoveInput(i, 1, 0, true, false), now.get())).isTrue();
                    step(physics, 1);
                }

                carrier = physics.snapshot("a");
                var carried = physics.snapshot("b");
                assertThat(physics.carryState("b").role()).isEqualTo("CARRIED");
                assertThat(carried.x()).isCloseTo(carrier.x(), within(.01));
                assertThat(carried.y()).isCloseTo(carrier.y() + 1.7, within(.01));
                assertThat(carried.z()).isCloseTo(carrier.z(), within(.01));
                assertThat(carried.motion().tick()).isGreaterThan(previousTick);
                assertThat(carried.motion().authority()).isNull();
                previousTick = carried.motion().tick();
            }

            assertThat(physics.snapshot("a").x()).isGreaterThan(3);
        }
    }

    @Test
    void 멀리_운반한뒤_현재위치가_막히면_주변의_안전지점으로_내려놓는다() throws Exception {
        try (var physics = pair(false, true)) {
            assertThat(physics.pickup("a", "b")).isTrue();
            physics.place("a", 18, .84, 78);
            step(physics, 5);
            physics.place("a", 20, .84, 78);

            physics.releaseCarry("a");

            var released = physics.snapshot("b");
            assertThat(released.x()).isBetween(17.5, 22.5);
            assertThat(physics.canStand(released.x(), released.y(), released.z())).isTrue();
            step(physics, 5);
            assertThat(physics.snapshot("b").x()).isGreaterThan(17);
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 연속_상승과_정지와_하강에서_운반_수직속도는_직전_틱의_높이만_반영한다(boolean clientPositions) throws Exception {
        try (var physics = pair(clientPositions)) {
            assertThat(physics.pickup("a", "b")).isTrue();
            double previousHeight = physics.snapshot("a").y();
            long previousTick = physics.snapshot("b").motion().tick();
            double[] heights = {1.0, 1.1, 1.2, 1.3, 1.4, 1.4, 1.4, 1.4, 1.3, 1.2, 1.1, 1.0, .9, .84};

            // 지형/입력 검증과 분리한 높이 경로로 상승·정지·하강을 세 차례 반복한다.
            // 기대 속도는 피운반자의 내부 캐시가 아닌 운반자의 실제 스냅샷 차이에서 구한다.
            for (int cycle = 0; cycle < 3; cycle++) {
                for (double height : heights) {
                    physics.place("a", 0, height, 78);
                    step(physics, 1);

                    var carrier = physics.snapshot("a");
                    var carried = physics.snapshot("b");
                    double expectedVelocity = (carrier.y() - previousHeight) * 30;
                    assertThat(physics.carryState("b").role()).isEqualTo("CARRIED");
                    assertThat(carried.y()).isCloseTo(carrier.y() + 1.7, within(.00001));
                    assertThat(carried.motion().tick()).isEqualTo(previousTick + 1);
                    assertThat(carried.motion().velocityY())
                            .as("clientPositions=%s cycle=%s height=%s", clientPositions, cycle, height)
                            .isCloseTo(expectedVelocity, within(.0001));
                    previousHeight = carrier.y();
                    previousTick = carried.motion().tick();
                }
            }
        }
    }

    @Test
    void 캐시도_현재위치도_막히면_최초위치로_돌아가지않고_주변을_찾는다() throws Exception {
        try (var physics = pair(false, true)) {
            assertThat(physics.pickup("a", "b")).isTrue();
            physics.place("a", 20, .84, 78);

            physics.releaseCarry("a");

            var released = physics.snapshot("b");
            assertThat(released.x()).isBetween(16d, 24d);
            assertThat(physics.canStand(released.x(), released.y(), released.z())).isTrue();
        }
    }

    private void addBox(ObjectNode data, String id, double x, double y, double z,
            double halfX, double halfY, double halfZ) {
        var box = data.withArray("boxes").addObject();
        box.put("id", id);
        box.put("yaw", 0);
        box.putArray("center").add(x).add(y).add(z);
        box.putArray("half").add(halfX).add(halfY).add(halfZ);
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

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 캐릭터는_시간제한없이_유지되고_명시적_해제에만_내려놓는다(boolean clientPositions) throws Exception {
        try (var physics = pair(clientPositions)) {
            assertThat(physics.pickup("a", "b")).isTrue();
            String carryId = physics.carryState("a").carryId();
            // 과거 5초/15초 제한을 모두 지나 1분이 흘러도 관계와 위치가 유지된다.
            step(physics, 1800);
            assertThat(physics.carryState("a").carryId()).isEqualTo(carryId);
            assertThat(physics.carryState("b").role()).isEqualTo("CARRIED");
            assertThat(physics.snapshot("b").y() - physics.snapshot("a").y()).isCloseTo(1.7, within(.01));

            physics.releaseCarry("b");

            assertThat(physics.carryState("a")).isNull();
            assertThat(physics.carryState("b")).isNull();
            assertThat(physics.throwCarried("a", carryId, 1, 0, 0)).isFalse();
            // 직접 해제는 틱 사이에 실행된다. 착지 물리 틱이 지난 뒤 평상시 권한으로 복귀한다.
            step(physics, 5);
            assertThat(physics.snapshot("b").motion().authority()).isEqualTo(clientPositions ? "CLIENT_VALIDATED" : null);
        }
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 일분이상_운반한뒤에도_기존_관계로_던질수있다(boolean clientPositions) throws Exception {
        try (var physics = pair(clientPositions)) {
            assertThat(physics.pickup("a", "b")).isTrue();
            String carryId = physics.carryState("a").carryId();
            step(physics, 1800);

            assertThat(physics.throwCarried("a", carryId, -1, 0, 0)).isTrue();
            step(physics, 6);

            assertThat(physics.carryState("b").role()).isEqualTo("THROWN");
            assertThat(physics.snapshot("b").x()).isLessThan(-2.5);
            assertThat(physics.carryState("a")).isNull();
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
