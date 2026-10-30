package com.ssafy.ontop.world.movement;

import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.collision.shapes.CapsuleCollisionShape;
import com.jme3.bullet.objects.PhysicsGhostObject;
import com.jme3.math.Transform;
import com.jme3.math.Vector3f;

/** Queries the channel's active geometry; every call must run on WorldPhysics' owner thread. */
final class PositionCollision implements ClientPositionValidator.Geometry {
    private final PhysicsSpace space;
    private final ParkMovementPolicy policy;
    private final java.util.function.Predicate<String> active;
    private final CapsuleCollisionShape capsule;
    private final PhysicsGhostObject probe;
    PositionCollision(ParkScene scene, PhysicsSpace space) {
        this(scene, space, id -> space.getRigidBodyList().stream().anyMatch(body -> id.equals(body.getUserObject())));
    }
    PositionCollision(ParkScene scene, PhysicsSpace space, java.util.function.Predicate<String> active) {
        this.space = space; this.policy = scene.policy; this.active = active;
        var movement = scene.data.path("movement");
        float radius = (float) movement.path("radius").asDouble(), half = (float) movement.path("halfHeight").asDouble();
        capsule = new CapsuleCollisionShape(radius, half * 2, 1);
        probe = new PhysicsGhostObject(capsule);
        probe.setCollisionGroup(1); probe.setCollideWithGroups(2);
    }
    public boolean supported(ClientPositionValidator.Pose pose) {
        return supportObject(pose) != null;
    }
    /** supported()와 같은 판정에서 가장 먼저 닿는 걷는 면. 없으면 null이다. */
    com.jme3.bullet.collision.PhysicsCollisionObject supportObject(ClientPositionValidator.Pose pose) {
        var from = point(pose);
        if (!policy.allowsSupport(from, active)) return null;
        // A centre ray loses support earlier than the capsule at platform edges.
        return space.sweepTest(capsule, new Transform(from), new Transform(from.add(0, -.17f, 0))).stream()
                .filter(hit -> hit.getCollisionObject().getCollisionGroup() == 2 && hit.getHitNormalLocal(null).y > .6)
                .min(java.util.Comparator.comparingDouble(com.jme3.bullet.collision.PhysicsSweepTestResult::getHitFraction))
                .map(com.jme3.bullet.collision.PhysicsSweepTestResult::getCollisionObject).orElse(null);
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
    public double jumpSpeed(ClientPositionValidator.Pose from, boolean tuned) { return policy.jumpSpeed(point(from), tuned); }
    /**
     * 서 있던 바닥 가장자리에서 걸어 내려갈 때, 직선 경로가 떠나는 바닥의 모서리(접촉 법선의 수평 성분이 이동 방향을 향함)만
     * 스치는지 확인한다. 하강 성분 때문에 막힌 것으로 계산된 접촉만 해당한다. 도착 위치 겹침, 다가가며 부딪히는 벽·모서리,
     * 평평한 바닥 관통(법선 수평 성분 없음), 한 보고 0.27m 넘는 하강은 허용하지 않는다.
     */
    public boolean rollsOff(ClientPositionValidator.Pose from, ClientPositionValidator.Pose to) {
        var start = point(from); var end = point(to);
        var delta = end.subtract(start);
        if (delta.y >= 0 || delta.y < -.27 || delta.x * delta.x + delta.z * delta.z < 1e-8) return false;
        if (!clear(to, to, false)) return false;
        return space.sweepTest(capsule, new Transform(start), new Transform(end)).stream().noneMatch(hit -> {
            if (hit.getCollisionObject().getCollisionGroup() != 2) return false;
            var normal = hit.getHitNormalLocal(null);
            if (hit.getHitFraction() >= .9999 || normal.dot(delta) >= -.0001) return false;
            // 서 있던 바닥: FE 캡슐은 접촉 여유(약 2cm)만큼 떠 있어, 직선 경로가 그만큼 내려가며 윗면에 닿는다.
            if (normal.y >= .6 && hit.getHitFraction() * -delta.y <= .04) return false;
            // 떠나는 모서리: 접촉 법선의 수평 성분이 이동 방향과 같다(다가가며 부딪힌 벽·모서리는 반대).
            return normal.y <= 0 || normal.x * delta.x + normal.z * delta.z <= 1e-4;
        });
    }
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
