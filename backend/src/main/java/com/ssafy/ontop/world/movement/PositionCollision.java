package com.ssafy.ontop.world.movement;

import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.collision.shapes.CapsuleCollisionShape;
import com.jme3.bullet.objects.PhysicsGhostObject;
import com.jme3.math.Transform;
import com.jme3.math.Vector3f;

/** Queries the channel's active geometry; every call must run on WorldPhysics' owner thread. */
final class PositionCollision implements ClientPositionValidator.Geometry {
    private final PhysicsSpace space;
    private final ParkScene scene;
    private final ParkMovementPolicy policy;
    private final java.util.function.Predicate<String> active;
    private final CapsuleCollisionShape capsule;
    private final PhysicsGhostObject probe;
    PositionCollision(ParkScene scene, PhysicsSpace space) {
        this(scene, space, id -> space.getRigidBodyList().stream().anyMatch(body -> id.equals(body.getUserObject())));
    }
    PositionCollision(ParkScene scene, PhysicsSpace space, java.util.function.Predicate<String> active) {
        this.scene = scene; this.space = space; this.policy = scene.policy; this.active = active;
        var movement = scene.data.path("movement");
        float radius = (float) movement.path("radius").asDouble(), half = (float) movement.path("halfHeight").asDouble();
        capsule = new CapsuleCollisionShape(radius, half * 2, 1);
        probe = new PhysicsGhostObject(capsule);
        probe.setCollisionGroup(1); probe.setCollideWithGroups(2);
    }
    public boolean supported(ClientPositionValidator.Pose pose) {
        var from = point(pose);
        if (!policy.allowsSupport(from, active)) return false;
        // A centre ray loses support earlier than the capsule at platform edges.
        return space.sweepTest(capsule, new Transform(from), new Transform(from.add(0, -.17f, 0))).stream()
                .anyMatch(hit -> hit.getCollisionObject().getCollisionGroup() == 2 && hit.getHitNormalLocal(null).y > .6);
    }
    public Double ceiling(ClientPositionValidator.Pose pose, double rise) {
        var from = point(pose);
        return space.sweepTest(capsule, new Transform(from), new Transform(from.add(0, (float) rise, 0))).stream()
                .filter(hit -> hit.getCollisionObject().getCollisionGroup() == 2 && hit.getHitNormalLocal(null).y < -.6)
                .mapToDouble(hit -> rise * hit.getHitFraction()).min().stream().boxed().findFirst().orElse(null);
    }
    public boolean clear(ClientPositionValidator.Pose from, ClientPositionValidator.Pose to, boolean allowStep) {
        var start = point(from); var end = point(to);
        probe.setPhysicsLocation(end);
        boolean[] overlapping = {false};
        space.contactTest(probe, event -> {
            var other = event.getObjectA() == probe ? event.getObjectB() : event.getObjectA();
            if (other.getCollisionGroup() == 2 && event.getDistance1() < -.05f) overlapping[0] = true;
        });
        if (overlapping[0]) return false;
        // Rapier may finish a valid landing a few millimetres inside Bullet's contact skin.
        // Only walkable contact at the END of a supported descent gets this tolerance.
        if (sweep(start, end)) return true;
        if (end.y < start.y && supported(to) && sweep(start, end, true)) return true;
        // Conservative single-step allowance; multi-step/ramp parity remains an experiment.
        return allowStep && sweep(start, start.add(0, .22f, 0))
                && sweep(start.add(0, .22f, 0), end.add(0, .22f, 0));
    }
    public boolean swimming(ClientPositionValidator.Pose pose) {
        var lake = scene.data.path("lake");
        double radius = Math.hypot((pose.x() - lake.path("x").asDouble()) / lake.path("radiusX").asDouble(),
                (pose.z() - lake.path("z").asDouble()) / lake.path("radiusZ").asDouble());
        return radius < 1 && lake.path("surfaceY").asDouble() - scene.groundHeight(pose.x(), pose.z())
                > scene.data.path("swimming").path("depthThreshold").asDouble()
                && pose.y() < lake.path("surfaceY").asDouble() + .4;
    }
    public double swimSpeed(boolean run) { return scene.data.path("swimming").path(run ? "fastSpeed" : "speed").asDouble(); }
    public double floatY() { return scene.data.path("lake").path("surfaceY").asDouble() + scene.data.path("swimming").path("floatOffset").asDouble(); }
    public Double swimClimb(ClientPositionValidator.Pose from, ClientPositionValidator.Pose to) {
        for (var stone : scene.data.path("steppingStones")) {
            double x = stone.path("x").asDouble(), z = stone.path("z").asDouble();
            if (Math.hypot(Math.max(0, Math.abs(from.x()-x)-stone.path("width").asDouble()/2),
                    Math.max(0, Math.abs(from.z()-z)-stone.path("depth").asDouble()/2)) <= .8
                    && (x-from.x())*(to.x()-from.x())+(z-from.z())*(to.z()-from.z()) > 0)
                return stone.path("top").asDouble() + scene.data.path("movement").path("halfHeight").asDouble()
                        + scene.data.path("movement").path("radius").asDouble() + .16;
        }
        return null;
    }
    ClientPositionValidator.Pose supportBelow(ClientPositionValidator.Pose pose) {
        var start = point(pose); var end = start.add(0, -256, 0);
        return space.sweepTest(capsule, new Transform(start), new Transform(end)).stream()
                .filter(hit -> hit.getCollisionObject().getCollisionGroup() == 2 && hit.getHitNormalLocal(null).y > .6)
                .sorted(java.util.Comparator.comparingDouble(com.jme3.bullet.collision.PhysicsSweepTestResult::getHitFraction))
                .map(hit -> new ClientPositionValidator.Pose(pose.x(), start.y - 256 * hit.getHitFraction() + .0002, pose.z()))
                .filter(candidate -> supported(candidate) && clear(candidate, candidate, false)).findFirst().orElse(null);
    }
    public double jumpSpeed(ClientPositionValidator.Pose from, boolean tuned) { return policy.jumpSpeed(point(from), tuned); }
    boolean correctionClear(Vector3f from, Vector3f to) {
        if (!clear(new ClientPositionValidator.Pose(to.x, to.y, to.z), new ClientPositionValidator.Pose(to.x, to.y, to.z), false)) return false;
        var delta = to.subtract(from);
        return space.sweepTest(capsule, new Transform(from), new Transform(to)).stream().noneMatch(hit ->
                hit.getCollisionObject().getCollisionGroup() == 2 && !policy.manages(String.valueOf(hit.getCollisionObject().getUserObject()))
                && hit.getHitFraction() < .9999 && hit.getHitNormalLocal(null).dot(delta) < -.0001);
    }
    private boolean sweep(Vector3f from, Vector3f to) { return sweep(from, to, false); }
    private boolean sweep(Vector3f from, Vector3f to, boolean landing) {
        var delta = to.subtract(from);
        if (delta.lengthSquared() < 1e-10) return true;
        return space.sweepTest(capsule, new Transform(from), new Transform(to)).stream().noneMatch(hit -> {
            if (hit.getCollisionObject().getCollisionGroup() != 2) return false;
            var normal = hit.getHitNormalLocal(null); // Minie returns physics-space coordinates despite this name.
            if (hit.getHitFraction() >= .9999 || normal.dot(delta) >= -.0001) return false;
            if (landing && normal.y >= .6 && -normal.dot(delta) * (1 - hit.getHitFraction()) <= .005) return false;
            // Ignore initial walkable contact during small ground/step movement,
            // but never ignore a floor crossed in the middle of a falling path.
            return normal.y < .6 || hit.getHitFraction() > .01 || delta.y < -.27;
        });
    }
    private static Vector3f point(ClientPositionValidator.Pose p) { return new Vector3f((float) p.x(), (float) p.y(), (float) p.z()); }
}
