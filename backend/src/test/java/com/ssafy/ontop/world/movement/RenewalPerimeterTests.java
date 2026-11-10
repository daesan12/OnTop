package com.ssafy.ontop.world.movement;

import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.jme3.bullet.collision.shapes.CapsuleCollisionShape;
import com.jme3.math.Transform;
import com.jme3.math.Vector3f;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RenewalPerimeterTests {
    @Test
    void 외곽_돌담_충돌은_전망대_이상의_높이와_벽_접합부에서도_이어진다() throws Exception {
        ParkScene scene = PreparedParkMap.loadRenewal(
                Path.of("../frontend/generated/park-renewal/server-map.local.json"),
                Path.of("../frontend/generated/park-renewal/server-manifest.local.json"),
                Set.of("channel-1")).createScene();
        var walls = scene.shapes.stream()
                .filter(s -> s.id().startsWith("renewal-invisible-perimeter-")).toList();
        PhysicsSpace space = new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);

        try {
            for (ParkScene.Shape wall : walls) {
                PhysicsRigidBody body = new PhysicsRigidBody(wall.shape(), 0);
                body.setUserObject(wall.id());
                body.setPhysicsLocation(wall.center());
                body.setPhysicsRotation(wall.rotation());
                body.setCollisionGroup(2);
                body.setCollideWithGroups(1);
                space.addCollisionObject(body);
            }
            assertThat(walls).hasSize(360);
            for (int i = 0; i < walls.size(); i++) {
                ParkScene.Shape wall = walls.get(i);
                ParkScene.Shape next = walls.get((i + 1) % walls.size());
                for (double t : new double[] {0, .5}) {
                    float x = (float) (wall.center().x * (1 - t) + next.center().x * t);
                    float z = (float) (wall.center().z * (1 - t) + next.center().z * t);
                    float radius = (float) Math.hypot(x, z);
                    for (float y : new float[] {5, 26, 45, 120, 512}) {
                        Vector3f from = new Vector3f(x - x / radius * 12, y, z - z / radius * 12);
                        Vector3f to = new Vector3f(x + x / radius * 12, y, z + z / radius * 12);
                        assertThat(space.rayTest(from, to))
                                .as("wall=%s, seam=%s, height=%s", i, t, y).isNotEmpty();
                    }
                }
            }
            var movement = scene.data.path("movement");
            var capsule = new CapsuleCollisionShape((float) movement.path("radius").asDouble(),
                    (float) movement.path("halfHeight").asDouble() * 2, 1);
            // Current tower roof, pagoda top, and balloon platform. Test the player's
            // entire capsule on outward and diagonal airborne paths, including the apex.
            for (float[] launch : new float[][] {{96, 44.3f, 24}, {0, 58, -80}, {-40, 28, -76}}) {
                double heading = Math.atan2(launch[2], launch[0]);
                for (double turn : new double[] {-Math.PI / 9, 0, Math.PI / 9}) {
                    for (float extraHeight : new float[] {0, 1.1f, 24}) {
                        var from = new Vector3f(launch[0], launch[1] + extraHeight + .8f, launch[2]);
                        var to = from.add((float) Math.cos(heading + turn) * 250, 0,
                                (float) Math.sin(heading + turn) * 250);
                        // Match frame-sized motion instead of a 250m teleport sweep.
                        for (float frameDistance : new float[] {.15f, .5f, 1.5f}) {
                            boolean blocked = false;
                            Vector3f step = to.subtract(from).normalizeLocal().multLocal(frameDistance);
                            Vector3f cursor = from.clone();
                            for (int frame = 0; frame < Math.ceil(250 / frameDistance) && !blocked; frame++) {
                                var end = cursor.add(step);
                                blocked = !space.sweepTest(capsule, new Transform(cursor), new Transform(end)).isEmpty();
                                cursor = end;
                            }
                            assertThat(blocked).as("launch=%s,%s turn=%s height=%s frameDistance=%s",
                                    launch[0], launch[2], turn, from.y, frameDistance).isTrue();
                        }
                    }
                }
            }
        } finally {
            space.destroy();
        }
    }
}
