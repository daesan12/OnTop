package com.ssafy.ontop.world.movement;

import static org.assertj.core.api.Assertions.*;
import static com.ssafy.ontop.world.movement.ClientPositionValidator.*;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.world.dto.WorldMapMetadata;
import java.util.concurrent.atomic.AtomicLong;
import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.collision.shapes.BoxCollisionShape;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.jme3.math.Vector3f;
import org.junit.jupiter.api.Test;

class ContactSkinTests {
    private ParkScene scene() {
        var data = (ObjectNode) ParkScene.load().data.deepCopy();
        var terrain = data.path("meshes").get(0).deepCopy();
        data.putArray("meshes").add(terrain); data.putArray("hulls"); data.putArray("steppingStones");
        var boxes = data.putArray("boxes");
        var floor = boxes.addObject(); floor.put("id", "test-floor"); floor.put("yaw", 0);
        floor.putArray("center").add(0).add(-.25).add(0);
        floor.putArray("half").add(80).add(.25).add(80);
        var wall = boxes.addObject(); wall.put("id", "test-wall"); wall.put("yaw", 0);
        wall.putArray("center").add(0).add(2).add(0);
        wall.putArray("half").add(.1).add(2).add(40);
        return ParkScene.fromPreparedData(data, new WorldMapMetadata("park", 1, "c".repeat(64)));
    }
    @Test void 벽표면의_얕은오차로_달려도_세대변경이나_강제복구가_없다() {
        var clock = new AtomicLong();
        try (var world = new WorldPhysics(scene(), true, clock::get, true)) {
            world.add("a"); world.place("a", -.405, .84, 0);
            long epoch = world.snapshot("a").motion().epoch();
            for (int i = 1; i <= 100; i++) {
                clock.addAndGet(66_666_667);
                var state = world.report("a", new Candidate(i, epoch, new Pose(-.385, .84, i * .06), true, false), clock.get());
                assertThat(state.motion().correctionReason()).as("report %s", i).isNull();
                assertThat(state.motion().epoch()).isEqualTo(epoch);
                assertThat(state.z()).isCloseTo(i * .06, within(.00001));
            }
        }
    }
    @Test void 벽옆_점프의_얕은접촉도_위치와_수직운동을_초기화하지않는다() {
        var clock = new AtomicLong();
        try (var world = new WorldPhysics(scene(), true, clock::get, true)) {
            world.add("a"); world.place("a", -.405, .84, 0);
            long epoch = world.snapshot("a").motion().epoch();
            double[] heights = {1.3, 1.7, 1.9, 2.0, 1.9, 1.5, .84};
            for (int i = 0; i < heights.length; i++) {
                clock.addAndGet(100_000_000);
                var state = world.report("a", new Candidate(i + 1, epoch, new Pose(-.385, heights[i], i * .05), true, i == 0), clock.get());
                assertThat(state.motion().correctionReason()).as("jump sample %s", i).isNull();
                assertThat(state.motion().epoch()).isEqualTo(epoch);
                assertThat(state.y()).isCloseTo(heights[i], within(.00001));
            }
        }
    }
    @Test void 작은이동을_반복해도_벽안으로_누적침투하지못한다() {
        var clock = new AtomicLong();
        try (var world = new WorldPhysics(scene(), true, clock::get, true)) {
            world.add("a"); world.place("a", -.405, .84, 0);
            for (int i = 1; i <= 100; i++) {
                clock.addAndGet(66_666_667);
                var before = world.snapshot("a");
                var state = world.report("a", new Candidate(i, before.motion().epoch(), new Pose(before.x() + .005, .84, 0), false, false), clock.get());
                assertThat(state.x()).isLessThanOrEqualTo(-.369);
            }
        }
    }
    @Test void 속도예산내_얇은벽관통과_먼순간이동은_계속_거절한다() {
        var clock = new AtomicLong();
        try (var world = new WorldPhysics(scene(), true, clock::get, true)) {
            world.add("a"); world.place("a", -.405, .84, 0);
            clock.set(100_000_000);
            var first = world.snapshot("a");
            var crossed = world.report("a", new Candidate(1, first.motion().epoch(), new Pose(.405, .84, 0), true, false), clock.get());
            assertThat(crossed.motion().correctionReason()).isEqualTo("COLLISION");
            assertThat(crossed.x()).isCloseTo(-.405, within(.00001));
            clock.addAndGet(100_000_000);
            var teleported = world.report("a", new Candidate(2, crossed.motion().epoch(), new Pose(-40, .84, 0), true, false), clock.get());
            assertThat(teleported.motion().correctionReason()).isEqualTo("SPEED");
            assertThat(teleported.x()).isEqualTo(crossed.x());
        }
    }
    @Test void 목적지가_비어있어도_1cm벽과_바닥과_천장관통은_거절한다() {
        var scene = scene(); var space = new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        try {
            add(space, new Vector3f(0, 2, 0), new Vector3f(.005f, 2, 10));
            add(space, new Vector3f(0, -.25f, 0), new Vector3f(10, .25f, 10));
            add(space, new Vector3f(0, 3.01f, 0), new Vector3f(10, .01f, 10));
            var geometry = new PositionCollision(scene, space);
            assertThat(geometry.clearContact(new Pose(-.5, .84, 0), new Pose(.5, .84, 0))).isFalse();
            assertThat(geometry.clearContact(new Pose(-2, .84, 0), new Pose(-2, .73, 0))).isFalse();
            assertThat(geometry.clearContact(new Pose(-2, 2, 0), new Pose(-2, 2.3, 0))).isFalse();
            // Both endpoints are empty: the sweep, not endpoint overlap, must stop tunnelling.
            var belowFloor = new Pose(-2, -1.4, 0);
            var aboveCeiling = new Pose(-2, 4, 0);
            assertThat(geometry.clearContact(belowFloor, belowFloor)).isTrue();
            assertThat(geometry.clearContact(aboveCeiling, aboveCeiling)).isTrue();
            assertThat(geometry.clearContact(new Pose(-2, .84, 0), belowFloor)).isFalse();
            assertThat(geometry.clearContact(new Pose(-2, 2, 0), aboveCeiling)).isFalse();
            assertThat(geometry.clearContact(new Pose(0, .84, 0), new Pose(-1, .84, 0))).isFalse();
            assertThat(geometry.clearContact(new Pose(-.31, .84, 0), new Pose(-.29, .84, .1))).isTrue();
            assertThat(geometry.clearContact(new Pose(-.31, .84, 0), new Pose(-.26, .84, .1))).isFalse();
        } finally { space.destroy(); }
    }
    private void add(PhysicsSpace space, Vector3f center, Vector3f half) {
        var body = new PhysicsRigidBody(new BoxCollisionShape(half), 0);
        body.setPhysicsLocation(center); body.setCollisionGroup(2); body.setCollideWithGroups(1);
        space.addCollisionObject(body);
    }
}
