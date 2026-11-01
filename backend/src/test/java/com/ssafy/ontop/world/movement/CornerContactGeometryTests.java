package com.ssafy.ontop.world.movement;

import static org.assertj.core.api.Assertions.*;
import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.collision.shapes.BoxCollisionShape;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.jme3.math.Vector3f;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.Test;

class CornerContactGeometryTests {
    private ParkScene scene() throws Exception {
        return PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"), Set.of("channel-1")).createScene();
    }
    private void add(PhysicsSpace space, String id, Vector3f center, Vector3f half) {
        var body = new PhysicsRigidBody(new BoxCollisionShape(half), 0);
        body.setPhysicsLocation(center); body.setCollisionGroup(2); body.setCollideWithGroups(1);
        body.setUserObject(id); space.addCollisionObject(body);
    }
    private PhysicsSpace actual(ParkScene scene) {
        var space = new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        for (var shape : scene.shapes) {
            if (shape.id().matches(".+-chair-[23]")) continue;
            var body = new PhysicsRigidBody(shape.shape(), 0);
            body.setPhysicsLocation(shape.center()); body.setPhysicsRotation(shape.rotation());
            body.setCollisionGroup(2); body.setCollideWithGroups(1); body.setUserObject(shape.id());
            space.addCollisionObject(body);
        }
        return space;
    }
    @Test void 실제_벤치_모서리의_상승과_하강은_각각_안전한_분할경로로_검증한다() throws Exception {
        var scene = scene(); var space = actual(scene);
        try {
            var g = new PositionCollision(scene, space);
            var upFrom = new ClientPositionValidator.Pose(4.61103630065918, 3.9181697368621826, 10.61120319366455);
            var upTo = new ClientPositionValidator.Pose(4.79419469833374, 4.045700550079346, 10.79435920715332);
            var downFrom = new ClientPositionValidator.Pose(4.818772315979004, 4.039999961853027, 10.818077087402344);
            var downTo = new ClientPositionValidator.Pose(5.125774383544922, 3.8627116680145264, 11.12505054473877);
            assertThat(g.clear(upFrom, upTo, false)).isFalse();
            assertThat(g.clearCorner(upFrom, upTo)).isTrue();
            assertThat(g.clear(downFrom, downTo, false)).isFalse();
            assertThat(g.clearCorner(downFrom, downTo)).isTrue();
        } finally { space.destroy(); }
    }
    @Test void 마지막계단과_팔각정_점프사이_보고는_실제_도달가능한_지지면으로_기존부스트를_확인한다() throws Exception {
        var scene=scene();var space=actual(scene);
        try {
            var g=new PositionCollision(scene,space);
            var from=new ClientPositionValidator.Pose(-.000448853,2.4796340465545654,15.234306335449219);
            var to=new ClientPositionValidator.Pose(-.000448842,2.940207004547119,14.726399421691895);
            assertThat(g.supported(from)).isTrue();
            assertThat(g.jumpSpeed(from,true)).isEqualTo(8);
            assertThat(g.jumpSpeed(from,to,true)).isEqualTo(8.6);
            add(space,"blocking-wall",new Vector3f(0,3,15),new Vector3f(1,2,.04f));
            assertThat(g.jumpSpeed(from,to,true)).isEqualTo(8);
        } finally {space.destroy();}
    }
    @Test void 작은높이차라도_벽과_깊은바닥침투를_허용하지않는다() throws Exception {
        var scene = scene(); var space = new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        try {
            add(space, "fixture-floor", new Vector3f(0, -.25f, 0), new Vector3f(20, .25f, 20));
            add(space, "fixture-wall", new Vector3f(0, 2, 0), new Vector3f(.15f, 2, 2));
            var g = new PositionCollision(scene, space);
            double h = scene.data.path("movement").path("halfHeight").asDouble()
                    + scene.data.path("movement").path("radius").asDouble() + .04;
            var a = new ClientPositionValidator.Pose(-.7, h + .02, 0);
            var b = new ClientPositionValidator.Pose(.7, h, 0);
            assertThat(g.supported(a)).isTrue(); assertThat(g.supported(b)).isTrue();
            assertThat(g.clear(b, b, false)).isTrue();
            assertThat(g.clear(a, b, false)).isFalse(); assertThat(g.clearCorner(a, b)).isFalse();
            var floor = new ClientPositionValidator.Pose(-.7, h - .14, 0);
            assertThat(g.clearCorner(a, floor)).isFalse();
            assertThat(g.clearCorner(new ClientPositionValidator.Pose(-.7, h + .8, 0), b)).isFalse();
            assertThat(g.clearCorner(new ClientPositionValidator.Pose(-.7, 8, 0),
                    new ClientPositionValidator.Pose(-.6, 8.1, 0))).isFalse();
        } finally { space.destroy(); }
    }
    @Test void 원래직선이_안전해보여도_분할경로의_천장을_무시하지않는다() throws Exception {
        var scene = scene(); var space = actual(scene);
        try {
            var g = new PositionCollision(scene, space);
            var a = new ClientPositionValidator.Pose(4.61103630065918, 3.9181697368621826, 10.61120319366455);
            var b = new ClientPositionValidator.Pose(4.79419469833374, 4.045700550079346, 10.79435920715332);
            assertThat(g.clearCorner(a, b)).isTrue();
            double head = scene.data.path("movement").path("halfHeight").asDouble()
                    + scene.data.path("movement").path("radius").asDouble();
            add(space, "fixture-ceiling", new Vector3f((float)a.x() - .1f, (float)(a.y() + head + .05), (float)a.z() - .1f),
                    new Vector3f(.01f, .01f, .01f));
            var pivot = new ClientPositionValidator.Pose(a.x(), b.y(), a.z());
            assertThat(g.clear(a, a, false)).isTrue(); assertThat(g.clear(b, b, false)).isTrue();
            assertThat(g.clear(a, pivot, false)).isFalse();
            assertThat(g.clearCorner(a, b)).isFalse();
        } finally { space.destroy(); }
    }
}
