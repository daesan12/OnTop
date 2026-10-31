package com.ssafy.ontop.world.movement;

import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestInstance;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * DEV CLIENT_VALIDATED 검증기가 FE(PARK_V1: 중력 30, 점프 8m/s, 서 있는 높이 = 윗면 + 0.80m)식 정상 점프를
 * 실제 맵·코스 충돌로 거절하지 않는지 30Hz 보고로 확인한다. Bullet 서버 궤적은 서 있는 높이가 FE보다 약 0.1m 낮아
 * 기존 검증기에서도 착지 보고가 COLLISION이므로(코스·보조와 무관한 기존 차이) FE식 궤적을 직접 만든다.
 */
@TestInstance(TestInstance.Lifecycle.PER_CLASS)
class JumpGraceValidationTests {
    private static final double STAND = .80, GRAVITY = 30, JUMP = 8, DT = 1.0 / 30;
    private ParkScene scene;
    private JumpCourse course;
    private PhysicsSpace space;
    private PositionCollision geometry;

    @BeforeAll
    void prepare() throws Exception {
        scene = PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"), Set.of("channel-1")).createScene();
        course = JumpCourse.loadDefault();
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

    private record Report(double x, double y, double z, boolean jump) {}

    /** 제자리 점프를 count번 이어서 한다. 두 번째부터는 착지 보고 다음 보고가 바로 이륙(버퍼로 뛴 경우)이다. */
    private static List<Report> hops(double x, double ground, double z, int count) {
        var reports = new ArrayList<Report>();
        for (int hop = 0; hop < count; hop++) {
            double vy = JUMP, y = ground;
            boolean first = true;
            do {
                vy -= GRAVITY * DT;
                y = Math.max(ground, y + (vy + GRAVITY * DT / 2) * DT);
                reports.add(new Report(x, y, z, first));
                first = false;
            } while (y > ground);
        }
        return reports;
    }

    private String validate(double x, double y, double z, List<Report> reports, boolean grace) {
        var clock = new AtomicLong();
        var validator = new ClientPositionValidator(new ClientPositionValidator.Pose(x, y, z), 1, 88, geometry, clock::get, true);
        validator.jumpGrace(grace);
        for (int i = 0; i < reports.size(); i++) {
            var r = reports.get(i);
            clock.addAndGet(WorldPhysics.STEP_NANOS);
            var decision = validator.accept(new ClientPositionValidator.Candidate(i + 1, 1,
                    new ClientPositionValidator.Pose(r.x(), r.y(), r.z()), true, r.jump()));
            if (!decision.accepted()) return i + 1 + ":" + decision.reason() + " " + r;
        }
        return "ok";
    }

    @Test
    void 석탑_발판에서_제자리_점프와_착지즉시_연속점프_버퍼를_받는다() {
        var pad = course.colliders().get(2);
        double ground = pad.top() + STAND;
        assertThat(geometry.supported(new ClientPositionValidator.Pose(pad.x(), ground, pad.z()))).isTrue();
        for (boolean grace : new boolean[] {true, false}) {
            assertThat(validate(pad.x(), ground, pad.z(), hops(pad.x(), ground, pad.z(), 3), grace)).as("grace=%s", grace).isEqualTo("ok");
        }
    }

    @Test
    void 다음_석탑_발판으로_오르는_점프를_받는다() {
        var from = course.colliders().get(0);
        var to = course.colliders().get(1);
        double y0 = from.top() + STAND, y1 = to.top() + STAND;
        var reports = new ArrayList<Report>();
        double vy = JUMP, y = y0;
        int frames = 22;
        for (int i = 1; i <= frames; i++) {
            vy -= GRAVITY * DT;
            y = y + (vy + GRAVITY * DT / 2) * DT;
            double t = Math.min(1, i / 16.0);
            double x = from.x() + (to.x() - from.x()) * t, z = from.z() + (to.z() - from.z()) * t;
            if (i > 8 && y <= y1) {
                reports.add(new Report(x, y1, z, false));
                break;
            }
            reports.add(new Report(x, y, z, i == 1));
        }
        assertThat(reports.getLast().y()).isEqualTo(y1);
        assertThat(validate(from.x(), y0, from.z(), reports, true)).isEqualTo("ok");
    }

    @Test
    void 석탑_꼭대기에서_걸어나간_공중_3틱째_코요테점프는_보조가_켜졌을때만_받는다() {
        // vr-pagoda-body 꼭대기 14m, +x 가장자리 -50.0. 6m/s(0.2m/틱)로 걸어 나간다.
        double top = 14 + STAND, z = -23;
        var reports = new ArrayList<Report>();
        double x = -50.9, y = top, vy = 0;
        int airborne = 0;
        boolean jumped = false;
        for (int i = 0; i < 14; i++) { // 상승·정점 구간까지만(그 뒤 직선 경로는 실제 구조물과 만난다)
            x += .2;
            boolean supported = geometry.supported(new ClientPositionValidator.Pose(x, top, z)) && airborne == 0;
            boolean jump = false;
            if (!supported) {
                airborne++;
                if (airborne == 3 && !jumped) { vy = JUMP; jump = true; jumped = true; }
                vy -= GRAVITY * DT;
                y += (vy + GRAVITY * DT / 2) * DT;
            }
            reports.add(new Report(x, y, z, jump));
        }
        assertThat(jumped).isTrue();
        assertThat(validate(-50.9, top, z, reports, true)).isEqualTo("ok");
        assertThat(validate(-50.9, top, z, reports, false)).as("보조 없이는 공중 상승이 거절된다").isNotEqualTo("ok");
    }
}
