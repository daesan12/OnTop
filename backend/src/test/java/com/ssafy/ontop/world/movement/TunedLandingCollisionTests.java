package com.ssafy.ontop.world.movement;

import static org.assertj.core.api.Assertions.*;
import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.ssafy.ontop.world.map.PreparedParkMap;
import java.nio.file.Path;
import java.util.Set;
import org.junit.jupiter.api.Test;

class TunedLandingCollisionTests {
    @Test void 보행로_점프_착지의_바닥접촉은_통과한다() throws Exception {
        var scene = PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"), Set.of("channel-1")).createScene();
        var space = new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        try {
            for (var shape : scene.shapes) {
                if (shape.id().matches(".+-chair-[23]")) continue;
                var body = new PhysicsRigidBody(shape.shape(), 0);
                body.setPhysicsLocation(shape.center()); body.setPhysicsRotation(shape.rotation());
                body.setCollisionGroup(2); body.setCollideWithGroups(1); body.setUserObject(shape.id());
                space.addCollisionObject(body);
            }
            var geometry = new PositionCollision(scene, space);
            var from = new ClientPositionValidator.Pose(0, 1.1, 45.8665885925293);
            var to = new ClientPositionValidator.Pose(0, .9382488131523132, 45.8665885925293);
            assertThat(geometry.supported(to)).isTrue();
            assertThat(geometry.clear(from,to,false)).isTrue();
            assertThat(geometry.clear(from, new ClientPositionValidator.Pose(0, .93, to.z()), false)).isFalse();
            assertThat(geometry.clear(new ClientPositionValidator.Pose(0, 3, to.z()),
                    new ClientPositionValidator.Pose(0, .81, to.z()), false)).isFalse();
            var now = new java.util.concurrent.atomic.AtomicLong();
            var validator = new ClientPositionValidator(new ClientPositionValidator.Pose(0, .94, to.z()),
                    1, 89, geometry, now::get, true);
            now.set(60_000_000);
            assertThat(validator.accept(new ClientPositionValidator.Candidate(1, 1, from, false, true)).accepted()).isTrue();
            now.set(300_000_000);
            assertThat(validator.accept(new ClientPositionValidator.Candidate(2, 1, to, false, false)).accepted()).isTrue();
            try (var world = new WorldPhysics(scene, true, now::get, true)) {
                world.add("landing"); world.place("landing", 0, from.y(), from.z());
                long epoch = world.snapshot("landing").motion().epoch();
                now.addAndGet(60_000_000);
                var state = world.report("landing", new ClientPositionValidator.Candidate(1, epoch, to, false, false), now.get());
                assertThat(state.motion().authority()).isEqualTo("CLIENT_VALIDATED");
            }
        } finally { space.destroy(); }
    }
}
