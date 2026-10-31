package com.ssafy.ontop.world.movement;

import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.collision.shapes.BoxCollisionShape;
import com.jme3.bullet.collision.shapes.CylinderCollisionShape;
import com.jme3.math.Vector3f;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import org.assertj.core.data.Offset;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 실제 생성 맵과 FE 코스 전달본으로 서버 물리 충돌체를 검증한다. 게임 진행·보상은 범위 밖이다. */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JumpCourseCollisionTests {
    private ParkScene scene;
    private JumpCourse course;
    private long now;

    @BeforeAll
    void prepare() throws Exception {
        scene = PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"), Set.of("channel-1")).createScene();
        course = JumpCourse.loadDefault();
    }

    @Test
    void box와_cylinder의_형상과_윗면_아랫면_가장자리가_전달본과_같다() {
        var space = new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        try {
            var bodies = JumpCourseColliders.addTo(space, course);
            assertThat(bodies).hasSize(113);
            for (int block = 0; block < bodies.size(); block++) {
                var collider = course.colliders().get(block);
                var body = bodies.get(block);
                assertThat(body.getUserObject()).isSameAs(collider);
                assertThat(body.getMass()).isZero();
                assertThat(body.getCollisionGroup()).isEqualTo(2);
                assertThat(body.getCollideWithGroups()).isEqualTo(1);
                assertThat(body.getCollisionShape()).isInstanceOf(collider.shape() == JumpCourse.Collider.Shape.BOX
                        ? BoxCollisionShape.class : CylinderCollisionShape.class);
                var location = body.getPhysicsLocation(null);
                assertThat((double) location.y).as("중심 %s", collider.id())
                        .isCloseTo(collider.top() - collider.thickness() / 2, Offset.offset(1e-5));
                double x = collider.x(), z = collider.z();
                double top = collider.top(), bottom = top - collider.thickness();
                // 위아래로 쌓인 다른 발판과 섞이지 않게 이 몸체의 높이 구간만 쏜다.
                // cylinder 광선 판정은 Bullet GJK 근사로 최대 약 4mm 오차가 있다. 실제 착지 높이는 아래 착지 테스트가 확인한다.
                var tolerance = Offset.offset(collider.shape() == JumpCourse.Collider.Shape.BOX ? 1e-4 : 5e-3);
                assertThat(hit(space, body, x, z, top + .5, bottom - .5)).as("윗면 %s", collider.id())
                        .isCloseTo(top, tolerance);
                assertThat(hit(space, body, x, z, bottom - .5, top + .5)).as("아랫면 %s", collider.id())
                        .isCloseTo(bottom, tolerance);
                // 반크기 안쪽은 닿고 바깥은 닿지 않는다. cylinder는 대각선에서도 radius로 판정한다.
                assertThat(hit(space, body, x + collider.halfX() - .02, z, top + .5, bottom - .5)).as("x 안쪽 %s", collider.id()).isNotNull();
                assertThat(hit(space, body, x + collider.halfX() + .02, z, top + .5, bottom - .5)).as("x 바깥 %s", collider.id()).isNull();
                assertThat(hit(space, body, x, z - collider.halfZ() + .02, top + .5, bottom - .5)).as("z 안쪽 %s", collider.id()).isNotNull();
                assertThat(hit(space, body, x, z - collider.halfZ() - .02, top + .5, bottom - .5)).as("z 바깥 %s", collider.id()).isNull();
                double inside = (collider.halfX() - .03) / Math.sqrt(2), outside = (collider.halfX() + .03) / Math.sqrt(2);
                assertThat(hit(space, body, x + inside, z + inside, top + .5, bottom - .5)).as("대각 안쪽 %s", collider.id()).isNotNull();
                if (collider.shape() == JumpCourse.Collider.Shape.CYLINDER) {
                    assertThat(hit(space, body, x + outside, z + outside, top + .5, bottom - .5)).as("원 바깥 %s", collider.id()).isNull();
                } else {
                    assertThat(hit(space, body, x + collider.halfX() - .02, z + collider.halfZ() - .02, top + .5, bottom - .5))
                            .as("모서리 %s", collider.id()).isNotNull();
                }
            }
        } finally {
            space.destroy();
        }
    }

    @Test
    void 플래그_OFF는_코스_몸체가_없고_기존_장면과_같은_궤적이다() {
        var pad = course.colliders().get(5);
        try (var off = new WorldPhysics(scene, false, () -> now, true);
                var nullCourse = new WorldPhysics(scene, false, () -> now, true, null);
                var on = new WorldPhysics(scene, false, () -> now, true, course)) {
            for (var physics : java.util.List.of(off, nullCourse, on)) {
                physics.add("a");
                physics.place("a", pad.x(), pad.top() + 1.2, pad.z());
                settle(physics, 45);
            }
            // 코스가 없으면 발판 자리를 지나 아래 광장 바닥에 선다.
            assertThat(off.support("a").kind()).isEqualTo(WorldPhysics.Support.Kind.STRUCTURE);
            assertThat(off.support("a").colliderId()).isEqualTo("vr-court-floor");
            assertThat(off.snapshot("a").y()).isLessThan(pad.top() - pad.thickness());
            assertThat(nullCourse.snapshot("a")).isEqualTo(off.snapshot("a"));
            assertThat(on.support("a").course()).isSameAs(pad);

            // 코스 밖 기존 공원 이동은 코스 활성 여부와 무관하게 같은 궤적이다.
            for (var physics : java.util.List.of(off, on)) {
                physics.place("a", 0, .84, 82);
                settle(physics, 5);
            }
            for (int i = 1; i <= 60; i++) {
                var input = new MoveInput(i, i < 30 ? 1 : -.4, -1, i % 3 == 0, i == 20);
                assertThat(off.input("a", input, now)).isEqualTo(on.input("a", input, now));
                off.step(now, Set.of());
                on.step(now, Set.of());
                now += WorldPhysics.STEP_NANOS;
                assertThat(trajectory(on.snapshot("a"))).as("tick %d", i).isEqualTo(trajectory(off.snapshot("a")));
            }
        }
    }

    @Test
    void 기존맵_장면에는_다른_mapVersion의_코스를_붙일_수_없다() {
        assertThatThrownBy(() -> new WorldPhysics(ParkScene.load(), false, () -> now, true, course))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("버전");
    }

    @Test
    void 서버물리_착지_발판을_코스_지형_구조물_공중으로_구분한다() {
        try (var physics = new WorldPhysics(scene, false, () -> now, true, course)) {
            physics.add("a");
            physics.place("a", 0, .84, 82);
            settle(physics, 20);
            assertThat(physics.support("a")).isEqualTo(new WorldPhysics.Support(WorldPhysics.Support.Kind.TERRAIN, "terrain", null));

            physics.place("a", -70, .95, 0);
            settle(physics, 20);
            assertThat(physics.support("a")).isEqualTo(
                    new WorldPhysics.Support(WorldPhysics.Support.Kind.STRUCTURE, "vr-court-floor", null));

            for (var block : new int[] {0, 24, 80, 112}) {
                var pad = course.colliders().get(block);
                physics.place("a", pad.x(), pad.top() + 1.5, pad.z());
                assertThat(physics.support("a")).as("공중 %d", block).isEqualTo(WorldPhysics.Support.NONE);
                settle(physics, 45);
                var state = physics.snapshot("a");
                assertThat(state.motion().grounded()).as("grounded %d %s", block, state).isTrue();
                // box·cylinder 모두 윗면 기준 같은 높이에 선다(캡슐 중심 = top + 0.74).
                assertThat(state.y()).as("높이 %d", block).isCloseTo(pad.top() + .74, Offset.offset(.01));
                var support = physics.support("a");
                assertThat(support.kind()).isEqualTo(WorldPhysics.Support.Kind.COURSE);
                assertThat(support.course().block()).isEqualTo(block);
                assertThat(support.colliderId()).isEqualTo(pad.id());
                assertThat(support.course().gate()).isEqualTo(block == 24 ? 1 : null);
            }
        }
    }

    @Test
    void CLIENT_VALIDATED_발판_식별은_승인좌표만_사용하고_위조보고를_반영하지않는다() {
        var pad = course.colliders().get(30);
        double standing = standingY(pad);
        try (var physics = new WorldPhysics(scene, true, () -> now, true, course)) {
            physics.add("a");
            physics.place("a", pad.x(), standing, pad.z());
            now += 50_000_000;
            physics.step(now, Set.of());
            assertThat(physics.snapshot("a").motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(physics.snapshot("a").motion().grounded()).isTrue();
            assertThat(physics.support("a").course()).isSameAs(pad);

            long epoch = physics.snapshot("a").motion().epoch();
            now += 50_000_000;
            var moved = physics.report("a", candidate(1, epoch, pad.x() + .1, standing, pad.z()), now);
            assertThat(moved.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            assertThat(physics.support("a").course()).isSameAs(pad);

            // 다른 발판 위 좌표를 보고해도 승인되지 않으면 식별 결과는 서버 승인 좌표 기준이다.
            var forged = course.colliders().get(60);
            now += 50_000_000;
            var denied = physics.report("a", candidate(2, epoch, forged.x(), standingY(forged), forged.z()), now);
            // PARK_V1 거절은 위치 보고 방식을 유지한 채 승인 좌표로 되돌리고 보정 사유를 싣는다.
            assertThat(denied.motion().correctionReason()).isNotNull();
            assertThat(denied.x()).isEqualTo(moved.x());
            assertThat(physics.support("a").course()).isSameAs(pad);
        }
    }

    @Test
    void 위치검증은_서버물리와_같은_코스몸체로_얇은_방패연_관통보고를_거부한다() {
        var kite = course.colliders().get(80);
        assertThat(kite.thickness()).isEqualTo(.05);
        var passed = crossKite(kite, null);
        assertThat(passed.motion().correctionReason()).as("코스 없음").isNull();
        assertThat(passed.y()).isLessThan(kite.top());

        var denied = crossKite(kite, course);
        assertThat(denied.motion().correctionReason()).as("코스 활성: 관통 보고 거절").isEqualTo("COLLISION");
        assertThat(denied.y()).isGreaterThan(kite.top());
    }

    @Test
    void 서버물리는_53mps와_PARK_V1_상한_78_4mps_낙하에서도_0_05m_방패연을_통과하지_않는다() {
        var kite = course.colliders().get(80);
        // 중력 30m/s²: 20m는 약 34m/s(기본 ghost sweep의 관통 확인값), 46.8m는 약 53m/s, 102.4m 이상은 78.4m/s 상한이다.
        for (double height : new double[] {20, 46.8, 125}) {
            try (var physics = new WorldPhysics(scene, false, () -> now, true, course)) {
                physics.add("a");
                physics.place("a", kite.x(), kite.top() + .8 + height, kite.z());
                double fastest = 0;
                double lowest = Double.MAX_VALUE;
                for (int i = 0; i < 150; i++) {
                    physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
                    var state = physics.snapshot("a");
                    fastest = Math.min(fastest, state.motion().velocityY());
                    lowest = Math.min(lowest, state.y());
                }
                assertThat(-fastest).as("낙하 속도 %s", height).isGreaterThan(height > 100 ? 78 : height > 40 ? 50 : 33);
                assertThat(-fastest).isLessThanOrEqualTo(78.41);
                assertThat(lowest).as("최저 높이 %s", height).isGreaterThan(kite.top());
                assertThat(physics.snapshot("a").y()).isCloseTo(kite.top() + .74, Offset.offset(.01));
                assertThat(physics.support("a").course()).isSameAs(kite);
                assertThat(physics.lastRecovery("a")).isNull();
            }
        }
    }

    @Test
    void 석탑_첫구간_발판은_인접한_기존_탑_몸체와_함께_충돌한다() {
        var pad = course.colliders().get(1);
        try (var physics = new WorldPhysics(scene, false, () -> now, true, course)) {
            physics.add("a");
            // 탑(vr-pagoda-body, x>=-56, z<=-20)과 대각선으로 약 0.38m 떨어진 모서리 쪽에 착지한다.
            double cornerX = pad.x() + pad.halfX() - .15, cornerZ = pad.z() - pad.halfZ() + .15;
            assertThat(physics.canStand(cornerX, standingY(pad), cornerZ)).isTrue();
            physics.place("a", cornerX, pad.top() + 1.2, cornerZ);
            settle(physics, 45);
            assertThat(physics.support("a").course()).isSameAs(pad);

            for (int i = 1; i <= 45; i++) {
                physics.input("a", new MoveInput(i, 1, -1, false, false), now);
                physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
                var state = physics.snapshot("a");
                double outsideX = Math.max(0, -56 - state.x()), outsideZ = Math.max(0, state.z() - -20);
                if (state.y() - .78 < 14) {
                    assertThat(Math.hypot(outsideX, outsideZ)).as("탑 관통 tick %d %s", i, state).isGreaterThan(.25);
                }
            }
            assertThat(physics.lastRecovery("a")).isNull();
        }
    }

    @Test
    void 운영_서버권위_기본이동도_발판에_서고_점프후_같은_발판에_착지한다() {
        var pad = course.colliders().get(0);
        try (var physics = new WorldPhysics(scene, false, () -> now, false, course)) {
            physics.add("a");
            physics.place("a", pad.x(), pad.top() + 1.2, pad.z());
            settle(physics, 45);
            var standing = physics.snapshot("a");
            assertThat(standing.motion().authority()).isNull();
            assertThat(standing.motion().profile()).isNull();
            assertThat(physics.support("a").course()).isSameAs(pad);

            physics.input("a", new MoveInput(1, 0, 0, false, true), now);
            double peak = standing.y();
            for (int i = 0; i < 60; i++) {
                physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
                peak = Math.max(peak, physics.snapshot("a").y());
            }
            assertThat(peak).isGreaterThan(standing.y() + .5);
            assertThat(physics.snapshot("a").y()).isCloseTo(standing.y(), Offset.offset(.05));
            assertThat(physics.support("a").course()).isSameAs(pad);

            // 발판 밖으로 걸어 내려가면 다시 기존 광장 바닥이 지지면이다.
            for (int i = 2; i < 40; i++) {
                physics.input("a", new MoveInput(i, 0, 1, false, false), now);
                physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
            }
            settle(physics, 20);
            assertThat(physics.support("a").colliderId()).isEqualTo("vr-court-floor");
        }
    }

    private WorldPhysics.Snapshot crossKite(JumpCourse.Collider kite, JumpCourse active) {
        try (var physics = new WorldPhysics(scene, true, () -> now, true, active)) {
            physics.add("a");
            double above = kite.top() + .78 + .25;
            physics.place("a", kite.x(), above, kite.z());
            long epoch = physics.snapshot("a").motion().epoch();
            now += 100_000_000;
            assertThat(physics.report("a", candidate(1, epoch, kite.x(), above - .01, kite.z()), now)
                    .motion().authority()).isEqualTo("CLIENT_VALIDATED");
            now += 40_000_000;
            // 캡슐 전체가 발판 아래로 지나간 보고. 두 보고 사이 이동은 0.04초 1.9m(약 47m/s)다.
            double below = kite.top() - kite.thickness() - .78 - .05;
            return physics.report("a", candidate(2, epoch, kite.x(), below, kite.z()), now);
        }
    }

    private double standingY(JumpCourse.Collider pad) {
        try (var physics = new WorldPhysics(scene, false, () -> now, true, course)) {
            physics.add("probe");
            physics.place("probe", pad.x(), pad.top() + 1.2, pad.z());
            settle(physics, 45);
            assertThat(physics.support("probe").course()).isSameAs(pad);
            return physics.snapshot("probe").y();
        }
    }

    private void settle(WorldPhysics physics, int ticks) {
        for (int i = 0; i < ticks; i++) {
            physics.step(now += WorldPhysics.STEP_NANOS, Set.of());
        }
    }

    private static ClientPositionValidator.Candidate candidate(long seq, long epoch, double x, double y, double z) {
        return new ClientPositionValidator.Candidate(seq, epoch, new ClientPositionValidator.Pose(x, y, z), false, false);
    }

    /** 해당 몸체에 처음 닿는 높이. 닿지 않으면 null이다. */
    private static Double hit(PhysicsSpace space, Object body, double x, double z, double fromY, double toY) {
        var from = new Vector3f((float) x, (float) fromY, (float) z);
        var to = new Vector3f((float) x, (float) toY, (float) z);
        return space.rayTest(from, to).stream().filter(result -> result.getCollisionObject() == body)
                .min(java.util.Comparator.comparingDouble(com.jme3.bullet.collision.PhysicsRayTestResult::getHitFraction))
                .map(result -> fromY + (toY - fromY) * result.getHitFraction()).orElse(null);
    }

    private static java.util.List<Object> trajectory(WorldPhysics.Snapshot state) {
        return java.util.List.of(state.x(), state.y(), state.z(), state.yaw(), state.moving(), state.running(),
                state.swimming(), state.motion().grounded(), state.motion().velocityY());
    }
}
