package com.ssafy.ontop.world.movement;

import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

class RenewalSpawnTests {
    @Test
    void 마흔명_출발위치는_실제_바닥위에_서고_첫_이동_검증을_통과한다() throws Exception {
        ParkScene scene = PreparedParkMap.loadRenewal(
                Path.of("../frontend/generated/park-renewal/server-map.local.json"),
                Path.of("../frontend/generated/park-renewal/server-manifest.local.json"),
                Set.of("channel-1")).createScene();
        PhysicsSpace space = new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        try {
            for (ParkScene.Shape shape : scene.shapes) {
                var body = new PhysicsRigidBody(shape.shape(), 0);
                body.setPhysicsLocation(shape.center());
                body.setPhysicsRotation(shape.rotation());
                body.setCollisionGroup(2);
                body.setCollideWithGroups(1);
                space.addCollisionObject(body);
            }
            var geometry = new PositionCollision(scene, space);
            for (int slot = 0; slot < 40; slot++) {
                var spawn = scene.spawn(slot);
                var pose = new ClientPositionValidator.Pose(spawn.x, spawn.y, spawn.z);
                assertThat(geometry.clear(pose, pose, false)).as("slot=%s pose=%s", slot, pose).isTrue();
                assertThat(geometry.supported(pose)).as("slot=%s", slot).isTrue();
                assertThatCode(() -> new ClientPositionValidator(pose, 1, 109, geometry,
                        new AtomicLong()::get, true)).doesNotThrowAnyException();
            }
        } finally {
            space.destroy();
        }
        var now = new AtomicLong();
        try (var physics = new WorldPhysics(scene, true, now::get, true)) {
            physics.add("101");
            var before = physics.snapshot("101");
            now.set(100_000_000);
            var reported = physics.report("101", new ClientPositionValidator.Candidate(1,
                    before.motion().epoch(), new ClientPositionValidator.Pose(before.x(), before.y(), before.z() - .2),
                    true, false), now.get());
            assertThat(reported.z()).isLessThan(before.z());
        }
    }
}
