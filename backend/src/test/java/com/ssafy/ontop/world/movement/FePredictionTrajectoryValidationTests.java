package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * FE 예측 물리(Rapier)가 실제로 만든 궤적(frontend/tests/fixtures/jumpmapPredictionTrajectories.json)을
 * DEV CLIENT_VALIDATED 보고 경로에 그대로 넣는다. FE는 발판 윗면 + 0.80m, BE Bullet은 + 0.74m에 서므로
 * 서버 궤적이 아니라 FE 궤적으로 거절 여부·착지 인식을 확인한다.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class FePredictionTrajectoryValidationTests {
    private ParkScene scene;
    private JumpCourse course;
    private JsonNode trajectories;
    private PhysicsSpace space;
    private PositionCollision geometry;

    @BeforeAll
    void prepare() throws Exception {
        scene = PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"), Set.of("channel-1")).createScene();
        course = JumpCourse.loadDefault();
        trajectories = new ObjectMapper().readTree(Path.of("../frontend/tests/fixtures/jumpmapPredictionTrajectories.json").toFile());
        space = new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        for (var shape : scene.shapes) {
            if (shape.id().matches(".+-chair-[23]")) continue;
            var body = new PhysicsRigidBody(shape.shape(), 0);
            body.setPhysicsLocation(shape.center());
            body.setPhysicsRotation(shape.rotation());
            body.setCollisionGroup(2);
            body.setCollideWithGroups(1);
            body.setUserObject(shape.id());
            space.addCollisionObject(body);
        }
        JumpCourseColliders.addTo(space, course);
        geometry = new PositionCollision(scene, space);
    }

    @AfterAll
    void close() { space.destroy(); }

    private record Result(boolean accepted, String detail, Set<Integer> pads) {}

    /** FE처럼 cadence 프레임마다 보고하고, 점프를 누른 뒤 서버 확인 전까지 보고 2개에 jump를 함께 싣는다. */
    private Result report(JsonNode frames, int cadence, int phase) {
        long[] now = {1_000_000_000L};
        try (var physics = new WorldPhysics(scene, true, () -> now[0], true, course)) {
            physics.add("a");
            var first = frames.get(0);
            physics.place("a", first.get(0).asDouble(), first.get(1).asDouble(), first.get(2).asDouble());
            long epoch = physics.snapshot("a").motion().epoch();
            int seq = 0, pending = 0;
            // 실제 연결처럼 시작 위치를 먼저 승인받아 검증기 기준 시각을 만든다(낙하 중 시작 궤적 포함).
            physics.report("a", new ClientPositionValidator.Candidate(++seq, epoch,
                    new ClientPositionValidator.Pose(first.get(0).asDouble(), first.get(1).asDouble(), first.get(2).asDouble()), true, false), now[0]);
            var pads = new HashSet<Integer>();
            for (int i = 1; i < frames.size(); i++) {
                var f = frames.get(i);
                if (f.get(3).asInt() == 1) pending = 3;
                if ((i + phase) % cadence != 0) continue;
                now[0] = 1_000_000_000L + i * 1_000_000_000L / 60;
                var state = physics.report("a", new ClientPositionValidator.Candidate(++seq, epoch,
                        new ClientPositionValidator.Pose(f.get(0).asDouble(), f.get(1).asDouble(), f.get(2).asDouble()), true, pending > 0), now[0]);
                if (pending > 0) pending--;
                if (!"CLIENT_VALIDATED".equals(state.motion().authority())) {
                    return new Result(false, "frame " + i + " " + f, pads);
                }
                var support = physics.support("a");
                if (support.course() != null) pads.add(support.course().block());
            }
            return new Result(true, "", pads);
        }
    }

    @Test
    void FE_정상_이동_궤적은_보고_위상과_상관없이_거절되지_않고_발판_착지를_인식한다() {
        var landed = new HashSet<String>();
        for (var trajectory : trajectories) {
            String name = trajectory.path("name").asText();
            for (int cadence : new int[] {2, 3}) {
                for (int phase = 0; phase < cadence; phase++) {
                    var result = report(trajectory.path("frames"), cadence, phase);
                    assertThat(result.accepted()).as("%s cadence=%d phase=%d %s", name, cadence, phase, result.detail()).isTrue();
                    result.pads().forEach(pad -> landed.add(name + ":" + pad));
                }
            }
        }
        // 서버 승인 좌표로 FE 착지 발판을 그대로 찾는다(+0.06m 높이 차이 안에서 지지면 검사가 닿음).
        assertThat(landed).contains("stone-climb:1", "cylinder-hops:26", "cylinder-hops:27", "fast-fall-kite:85",
                "kite-hops:80", "buffered-hops:2");
    }

    private String validate(ClientPositionValidator.Pose from, ClientPositionValidator.Pose to, boolean grace) {
        var clock = new AtomicLong();
        var validator = new ClientPositionValidator(from, 1, 88, geometry, clock::get, true);
        validator.jumpGrace(grace);
        clock.set(50_000_000);
        var decision = validator.accept(new ClientPositionValidator.Candidate(1, 1, to, true, false));
        return decision.accepted() ? "ok" : decision.reason();
    }

    @Test
    void 가장자리_허용은_떠나는_모서리만이고_관통_벽_큰하강은_그대로_막는다() {
        var kite = course.colliders().get(85);
        double stand = kite.top() + .80, edge = kite.x() + kite.halfX();
        var onEdge = new ClientPositionValidator.Pose(edge - .08, stand, kite.z());
        // 정상: 바깥으로 걸어 나가며 0.17m 내려감(FE walkoff 궤적과 같은 모양)
        assertThat(validate(onEdge, new ClientPositionValidator.Pose(edge + .28, stand - .172, kite.z()), true)).isEqualTo("ok");
        // 점프맵 비활성은 기존 직선 검사 그대로(같은 이동도 COLLISION)
        assertThat(validate(onEdge, new ClientPositionValidator.Pose(edge + .28, stand - .172, kite.z()), false)).isEqualTo("COLLISION");
        // 발판 안으로 파고들기·제자리 하강·한 보고 0.27m 넘는 하강은 거절
        var center = new ClientPositionValidator.Pose(kite.x(), stand, kite.z());
        assertThat(validate(center, new ClientPositionValidator.Pose(kite.x(), stand - .2, kite.z()), true)).isEqualTo("COLLISION");
        assertThat(validate(onEdge, new ClientPositionValidator.Pose(edge - .4, stand - .2, kite.z()), true)).isEqualTo("COLLISION");
        assertThat(validate(onEdge, new ClientPositionValidator.Pose(edge + .3, stand - .5, kite.z()), true)).isEqualTo("COLLISION");
        // 석탑 발판 1 모서리에서 기존 석탑 몸체(x>=-56, z<=-20) 쪽으로 내려가며 파고들기는 거절
        var pad = course.colliders().get(1);
        double padStand = pad.top() + .80;
        var corner = new ClientPositionValidator.Pose(pad.x() + pad.halfX() - .1, padStand, pad.z() - pad.halfZ() + .1);
        assertThat(validate(corner, new ClientPositionValidator.Pose(corner.x() + .4, padStand - .2, corner.z() - .4), true))
                .isEqualTo("COLLISION");
    }
}
