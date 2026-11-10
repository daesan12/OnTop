package com.ssafy.ontop.world.movement;

import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.collision.shapes.BoxCollisionShape;
import com.jme3.bullet.collision.shapes.CollisionShape;
import com.jme3.bullet.collision.shapes.CylinderCollisionShape;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.jme3.math.Quaternion;
import com.jme3.math.Vector3f;
import com.ssafy.ontop.world.jumpmap.JumpCourse;
import java.util.ArrayList;
import java.util.List;

/**
 * 채널 물리 공간에 코스 발판을 정적 충돌체로 추가한다. 서버 이동과 CLIENT_VALIDATED 위치 검증은
 * 같은 공간을 조회하므로 같은 몸체를 본다. owner thread에서만 호출한다.
 */
final class JumpCourseColliders {
    private JumpCourseColliders() {}

    static List<PhysicsRigidBody> addTo(PhysicsSpace space, JumpCourse course) {
        var bodies = new ArrayList<PhysicsRigidBody>();
        for (JumpCourse.Collider collider : course.colliders()) {
            var body = new PhysicsRigidBody(shape(collider), 0);
            // block 식별자는 별도 타입으로 연결한다. 맵 충돌체 문자열 ID와 섞이지 않는다.
            body.setUserObject(collider);
            body.setPhysicsLocation(new Vector3f((float) collider.x(), (float) collider.centerY(), (float) collider.z()));
            body.setPhysicsRotation(new Quaternion().fromAngleAxis((float)course.yaw(collider.block()), Vector3f.UNIT_Y));
            // 공원 정적 형상과 같은 그룹·마스크: 캐릭터(1)와만 충돌한다.
            body.setCollisionGroup(2);
            body.setCollideWithGroups(1);
            space.addCollisionObject(body);
            bodies.add(body);
        }
        return List.copyOf(bodies);
    }

    static CollisionShape shape(JumpCourse.Collider collider) {
        var half = new Vector3f((float) collider.halfX(), (float) (collider.thickness() / 2), (float) collider.halfZ());
        CollisionShape shape = collider.shape() == JumpCourse.Collider.Shape.CYLINDER
                ? new CylinderCollisionShape(half, PhysicsSpace.AXIS_Y)
                : new BoxCollisionShape(half);
        // ParkScene과 같은 여백. box·cylinder의 여백은 반크기 안쪽에 포함돼 윗면 높이를 바꾸지 않는다.
        shape.setMargin(0.02f);
        return shape;
    }
}
