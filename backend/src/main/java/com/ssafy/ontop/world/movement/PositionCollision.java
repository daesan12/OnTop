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
    // Rapier/Bullet surface disagreement is bounded by this fixed skin, not by
    // the distance since the last report. Repeated reports cannot grow it.
    private static final float CONTACT_SKIN = .03f;
    private final CapsuleCollisionShape contactCapsule;
    private final PhysicsGhostObject contactProbe;
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
        contactCapsule = new CapsuleCollisionShape(radius - CONTACT_SKIN, half * 2, 1);
        contactProbe = new PhysicsGhostObject(contactCapsule);
        contactProbe.setCollisionGroup(1); contactProbe.setCollideWithGroups(2);
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
    /** A reported chord can cut a rounded, walkable corner traversed over several render frames.
     * Accept only a fully swept rise-then-across or across-then-drop path within one auto-step.
     * The tuned validator still checks time, movement budget, jump origin/height and hovering.
     */
    public boolean clearCorner(ClientPositionValidator.Pose from, ClientPositionValidator.Pose to) {
        double rise = to.y() - from.y();
        if (Math.abs(rise) < .0001 || Math.abs(rise) > .22 + .0001
                || (rise > 0 ? !supported(to) : !supported(from)) || !clear(to, to, false)) return false;
        var start = point(from); var end = point(to); var delta = end.subtract(start);
        var hits = space.sweepTest(capsule, new Transform(start), new Transform(end));
        boolean corner = false;
        for (var hit : hits) {
            if (hit.getCollisionObject().getCollisionGroup() != 2 || hit.getHitFraction() >= .9999) continue;
            var normal = hit.getHitNormalLocal(null);
            if (normal.dot(delta) >= -.0001) continue;
            if (normal.y < .6) return false; // No wall/ceiling or lateral detours.
            corner = true;
        }
        if (!corner) return false;
        var pivot = rise > 0 ? new ClientPositionValidator.Pose(from.x(), to.y(), from.z())
                : new ClientPositionValidator.Pose(to.x(), from.y(), to.z());
        return clear(from, pivot, false) && clear(pivot, to, false);
    }
    /** A fixed 3cm outer shell may disagree across solvers. The remaining
     * capsule must still be clear at both ends and along the entire segment.
     * In particular, a clear destination across a thin wall is not enough.
     */
    public boolean clearContact(ClientPositionValidator.Pose from, ClientPositionValidator.Pose to) {
        if (!contactFree(point(from)) || !contactFree(point(to))) return false;
        var start = point(from); var end = point(to); var delta = end.subtract(start);
        if (delta.lengthSquared() < 1e-10) return true;
        return space.sweepTest(contactCapsule, new Transform(start), new Transform(end)).stream().noneMatch(hit ->
                hit.getCollisionObject().getCollisionGroup() == 2 && hit.getHitFraction() < .9999
                        && hit.getHitNormalLocal(null).dot(delta) < -.0001);
    }
    private boolean contactFree(Vector3f point) {
        contactProbe.setPhysicsLocation(point);
        boolean[] overlapping = {false};
        space.contactTest(contactProbe, event -> {
            var other = event.getObjectA() == contactProbe ? event.getObjectB() : event.getObjectA();
            if (other.getCollisionGroup() == 2 && event.getDistance1() < -.0001f) overlapping[0] = true;
        });
        return !overlapping[0];
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
    public double jumpSpeed(ClientPositionValidator.Pose from, ClientPositionValidator.Pose to, boolean tuned) {
        double speed = jumpSpeed(from, tuned);
        if (!tuned || !supported(from)) return speed;
        // The report can straddle the final stair and the pavilion takeoff.
        // Only a reachable, swept server support surface may select its existing boost.
        var support = supportBelow(to);
        double travel = Math.hypot(to.x() - from.x(), to.z() - from.z());
        if (support == null || support.y() < from.y() - .17 || support.y() > from.y() + travel + .22
                || !(clear(from, support, true) || clearCorner(from, support) || clearContact(from, support))) return speed;
        return Math.max(speed, jumpSpeed(support, true));
    }
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
