package com.ssafy.ontop.world.movement;

import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RenewalAccessTests {
    private PhysicsSpace space;
    private ParkScene scene;
    private PositionCollision geometry;

    @BeforeEach
    void 준비한다() throws Exception {
        scene = PreparedParkMap.loadRenewal(
                Path.of("../frontend/generated/park-renewal/server-map.local.json"),
                Path.of("../frontend/generated/park-renewal/server-manifest.local.json"),
                Set.of("channel-1")).createScene();
        space = new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        for (ParkScene.Shape shape : scene.shapes) {
            var body = new PhysicsRigidBody(shape.shape(), 0);
            body.setUserObject(shape.id());
            body.setPhysicsLocation(shape.center());
            body.setPhysicsRotation(shape.rotation());
            body.setCollisionGroup(2);
            body.setCollideWithGroups(1);
            space.addCollisionObject(body);
        }
        geometry = new PositionCollision(scene, space);
    }

    @AfterEach
    void 정리한다() {
        if (space != null) {
            space.destroy();
        }
    }

    @Test
    void 호수_아치다리를_양방향으로_보정없이_건넌다() {
        List<ClientPositionValidator.Pose> path = new ArrayList<>();
        for (int i = 0; i <= 220; i++) {
            double t = i / 220.0;
            double slope = (-.4 + 3.4 * 4 * (1 - 2 * t)) / 21.8;
            double clearance = .3 * (Math.sqrt(1 + slope * slope) - 1);
            path.add(new ClientPositionValidator.Pose(29.7 + 21.8 * t,
                    4.285 + (1 - t) * .4 + 3.4 * 4 * t * (1 - t) + clearance + .8, -18));
        }
        승인한다("다리 오름/내림", path);
        Collections.reverse(path);
        승인한다("다리 역방향", path);
    }

    @Test
    void 전망대의_세_바퀴를_모두_오르고_내려온다() {
        List<ClientPositionValidator.Pose> path = new ArrayList<>();
        double base = scene.data.path("tower").path("surfaceOffset").asDouble();
        for (int i = 0; i <= 1440; i++) {
            double t = i / 1440.0, angle = t * Math.PI * 6;
            path.add(new ClientPositionValidator.Pose(96 - Math.cos(angle) * 6.5,
                    base + t * 40 + .8, 24 - Math.sin(angle) * 6.5));
        }
        승인한다("전망대 오름", path);
        Collections.reverse(path);
        승인한다("전망대 내림", path);
    }

    @Test
    void 팔각정과_석탑의_계단을_양방향으로_승인한다() {
        var main = scene.data.path("meshes");
        for (String id : List.of("renewal-main-stairs-0", "renewal-main-stairs-1",
                "renewal-pagoda-stairs-0", "renewal-monument-stairs", "renewal-sub-stairs-0")) {
            var mesh = java.util.stream.StreamSupport.stream(main.spliterator(), false)
                    .filter(m -> id.equals(m.path("id").asText())).findFirst().orElseThrow();
            var vertices = mesh.path("vertices");
            double x0 = (vertices.get(0).asDouble() + vertices.get(3).asDouble()) / 2;
            double y0 = (vertices.get(1).asDouble() + vertices.get(4).asDouble()) / 2;
            double z0 = (vertices.get(2).asDouble() + vertices.get(5).asDouble()) / 2;
            double x1 = (vertices.get(6).asDouble() + vertices.get(9).asDouble()) / 2;
            double y1 = (vertices.get(7).asDouble() + vertices.get(10).asDouble()) / 2;
            double z1 = (vertices.get(8).asDouble() + vertices.get(11).asDouble()) / 2;
            List<ClientPositionValidator.Pose> path = new ArrayList<>();
            int count = (int) Math.ceil(Math.hypot(x1 - x0, z1 - z0) / .1);
            for (int i = 0; i <= count; i++) {
                double t = i / (double) count;
                path.add(new ClientPositionValidator.Pose(x0 + (x1 - x0) * t,
                        y0 + (y1 - y0) * t + .8, z0 + (z1 - z0) * t));
            }
            승인한다(id + " 내림", path);
            Collections.reverse(path);
            승인한다(id + " 오름", path);
        }
    }

    @Test
    void 팔각정_기둥과_난간과_탁자는_관통할_수_없다() {
        for (ParkScene.Shape shape : scene.shapes) {
            if (!shape.id().startsWith("P0-pillar-") && !shape.id().startsWith("P0-rail-")
                    && !shape.id().endsWith("-top")) {
                continue;
            }
            var bounds = shape.shape().boundingBox(shape.center(), shape.rotation(), null);
            var point = bounds.getCenter();
            assertThat(geometry.clear(new ClientPositionValidator.Pose(point.x, point.y, point.z),
                    new ClientPositionValidator.Pose(point.x, point.y, point.z), false))
                    .as("충돌체 내부=%s", shape.id()).isFalse();
        }
    }

    private void 승인한다(String name, List<ClientPositionValidator.Pose> path) {
        var now = new AtomicLong();
        var movement = scene.data.path("movement");
        var probe = new com.jme3.bullet.objects.PhysicsGhostObject(
                new com.jme3.bullet.collision.shapes.CapsuleCollisionShape(
                        (float) movement.path("radius").asDouble(),
                        (float) movement.path("halfHeight").asDouble() * 2, 1));
        probe.setCollisionGroup(1);
        probe.setCollideWithGroups(2);
        var origin = path.getFirst();
        probe.setPhysicsLocation(new com.jme3.math.Vector3f((float) origin.x(), (float) origin.y(), (float) origin.z()));
        List<String> contacts = new ArrayList<>();
        space.contactTest(probe, event -> {
            if (event.getDistance1() < -.05f) {
                var other = event.getObjectA() == probe ? event.getObjectB() : event.getObjectA();
                contacts.add(other.getUserObject() + ": " + event.getDistance1());
            }
        });
        assertThat(contacts).as("%s 출발 충돌", name).isEmpty();
        var validator = new ClientPositionValidator(path.getFirst(), 1, 109, geometry, now::get, true);
        for (int i = 1; i < path.size(); i++) {
            var pose = path.get(i);
            now.addAndGet(100_000_000);
            assertThat(geometry.supported(pose)).as("%s 지지면 #%s: %s", name, i, pose).isTrue();
            var result = validator.accept(new ClientPositionValidator.Candidate(i, 1, pose, true, false));
            assertThat(result.accepted()).as("%s #%s: %s, 거부=%s", name, i, pose, result.reason()).isTrue();
        }
    }
}
