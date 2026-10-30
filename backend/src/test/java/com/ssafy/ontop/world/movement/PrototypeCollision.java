package com.ssafy.ontop.world.movement;

import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.collision.shapes.CapsuleCollisionShape;
import com.jme3.bullet.objects.PhysicsGhostObject;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.jme3.math.Transform;
import com.jme3.math.Vector3f;

/** Same prepared Bullet geometry, no character movement/replay. Single-threaded test use. */
final class PrototypeCollision implements ClientPositionPrototype.Geometry, AutoCloseable {
    private final PhysicsSpace space = new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
    private final CapsuleCollisionShape capsule;
    private final PhysicsGhostObject probe;
    PrototypeCollision(ParkScene scene) {
        var movement = scene.data.path("movement");
        float radius = (float) movement.path("radius").asDouble(), half = (float) movement.path("halfHeight").asDouble();
        capsule = new CapsuleCollisionShape(radius, half * 2, 1);
        probe = new PhysicsGhostObject(capsule);
        probe.setCollisionGroup(1); probe.setCollideWithGroups(2);
        for (var shape : scene.shapes) {
            if (shape.id().matches(".+-chair-[23]")) continue;
            var body = new PhysicsRigidBody(shape.shape(), 0);
            body.setPhysicsLocation(shape.center()); body.setPhysicsRotation(shape.rotation());
            body.setCollisionGroup(2); body.setCollideWithGroups(1); space.addCollisionObject(body);
        }
    }
    public boolean supported(ClientPositionPrototype.Pose pose) {
        var from = point(pose);
        // A centre ray loses support earlier than the capsule at platform edges.
        return space.sweepTest(capsule, new Transform(from), new Transform(from.add(0, -.17f, 0))).stream()
                .anyMatch(hit -> hit.getHitNormalLocal(null).y > .6);
    }
    public boolean clear(ClientPositionPrototype.Pose from, ClientPositionPrototype.Pose to, boolean allowStep) {
        var start = point(from); var end = point(to);
        probe.setPhysicsLocation(end);
        boolean[] overlapping = {false};
        space.contactTest(probe, event -> { if (event.getDistance1() < -.05f) overlapping[0] = true; });
        if (overlapping[0]) return false;
        if (sweep(start, end)) return true;
        // Conservative single-step allowance; multi-step/ramp parity remains an experiment.
        return allowStep && sweep(start, start.add(0, .22f, 0))
                && sweep(start.add(0, .22f, 0), end.add(0, .22f, 0));
    }
    private boolean sweep(Vector3f from, Vector3f to) {
        var delta = to.subtract(from);
        if (delta.lengthSquared() < 1e-10) return true;
        return space.sweepTest(capsule, new Transform(from), new Transform(to)).stream().noneMatch(hit -> {
            var normal = hit.getHitNormalLocal(null); // Minie returns physics-space coordinates despite this name.
            if (hit.getHitFraction() >= .9999 || normal.dot(delta) >= -.0001) return false;
            // Ignore initial walkable contact during small ground/step movement,
            // but never ignore a floor crossed in the middle of a falling path.
            return normal.y < .6 || hit.getHitFraction() > .01 || delta.y < -.27;
        });
    }
    private static Vector3f point(ClientPositionPrototype.Pose p) { return new Vector3f((float) p.x(), (float) p.y(), (float) p.z()); }
    public void close() { space.destroy(); }
}
