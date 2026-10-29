package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Set;
import java.util.function.LongSupplier;

/** Local opt-in movement validator. Not enabled in dev/prod. */
public final class ClientPositionValidator {
    public record Pose(double x, double y, double z) {}
    public record Candidate(long seq, long epoch, Pose pose, boolean run, boolean jump, double yaw) {
        public Candidate(long seq, long epoch, Pose pose, boolean run, boolean jump) { this(seq, epoch, pose, run, jump, 0); }
        public static Candidate parse(JsonNode node) {
            var allowed = Set.of("seq", "epoch", "x", "y", "z", "run", "jump", "yaw");
            if (node == null || !node.isObject() || node.size() != allowed.size()) throw new IllegalArgumentException("fields");
            node.fieldNames().forEachRemaining(key -> { if (!allowed.contains(key)) throw new IllegalArgumentException("fields"); });
            for (var key : Set.of("seq", "epoch")) if (!node.path(key).isIntegralNumber() || !node.path(key).canConvertToLong())
                throw new IllegalArgumentException("sequence");
            for (var key : Set.of("x", "y", "z", "yaw")) if (!node.path(key).isNumber() || !Double.isFinite(node.path(key).asDouble()))
                throw new IllegalArgumentException("coordinates");
            if (!node.path("run").isBoolean() || !node.path("jump").isBoolean()) throw new IllegalArgumentException("intent");
            return new Candidate(node.path("seq").asLong(), node.path("epoch").asLong(),
                    new Pose(node.path("x").asDouble(), node.path("y").asDouble(), node.path("z").asDouble()),
                    node.path("run").asBoolean(), node.path("jump").asBoolean(), node.path("yaw").asDouble());
        }
    }
    interface Geometry {
        boolean supported(Pose pose);
        boolean clear(Pose from, Pose to, boolean allowStep);
        Double ceiling(Pose from, double rise);
    }
    record Decision(boolean accepted, String reason, Pose approved, long acceptedSeq) {}
    private record Flight(double originY, long started, double speed) {}
    private static final long FRESHNESS = 500_000_000L;
    private static final double BURST_SECONDS = .35; // Local experiment: bounded scheduler/TCP batching.
    private final LongSupplier clock;
    private final Geometry geometry;
    private final double boundary;
    private Pose approved;
    private long sequence, epoch, approvedAt, budgetAt;
    private double budget;
    private boolean blocked;
    private Flight flight;
    ClientPositionValidator(Pose initial, long epoch, double boundary, Geometry geometry, LongSupplier clock) {
        this.clock = clock; this.geometry = geometry; this.boundary = boundary;
        relocate(initial, epoch);
    }
    // Only a trusted server call can establish an origin or a new generation.
    synchronized void relocate(Pose pose, long epoch) {
        if (!finite(pose) || Math.abs(pose.x) > boundary || Math.abs(pose.z) > boundary || !geometry.clear(pose, pose, false))
            throw new IllegalArgumentException("unsafe origin");
        approved = pose; this.epoch = epoch; sequence = 0; approvedAt = budgetAt = clock.getAsLong();
        budget = .9; flight = null;
    }
    synchronized void blocked(boolean value) { blocked = value; }
    synchronized Decision accept(Candidate candidate) {
        long now = clock.getAsLong();
        if (blocked) return deny("ACTIVITY");
        if (candidate == null || !finite(candidate.pose) || !Double.isFinite(candidate.yaw)) return deny("INVALID");
        if (candidate.epoch != epoch) return deny("EPOCH");
        if (candidate.seq <= sequence || candidate.seq < 1 || candidate.seq > 0xffff_ffffL) return deny("SEQUENCE");
        if (now - budgetAt < 0 || now - approvedAt < 0) return deny("CLOCK");
        if (now - approvedAt > FRESHNESS) return deny("STALE");
        Pose target = candidate.pose;
        if (Math.abs(target.x) > boundary || Math.abs(target.z) > boundary || Math.abs(target.y) > 256) return deny("BOUNDS");
        double speed = candidate.run ? 9 : 6.25;
        budget = Math.min(speed * BURST_SECONDS, budget + (now - budgetAt) / 1e9 * speed);
        budgetAt = now;
        double horizontal = Math.hypot(target.x - approved.x, target.z - approved.z);
        if (horizontal > budget + .0001) return deny("SPEED");
        boolean supportedFrom = geometry.supported(approved), supportedTo = geometry.supported(target);
        Flight next = flight;
        if (next == null && candidate.jump && supportedFrom) {
            long takeoff = target.y - approved.y > .1 ? approvedAt : now;
            next = new Flight(approved.y, takeoff, 6.2);
        }
        if (next == null && !supportedTo) next = new Flight(approved.y, approvedAt, 0);
        if (next != null) {
            // A real ceiling can terminate an ascent early. Only static geometry,
            // not the client's grounded/velocity claim, authorizes this transition.
            double elapsed = Math.max(0, (now - approvedAt) / 1e9);
            double previousAge = Math.max(0, (approvedAt - next.started) / 1e9);
            double upwardSpeed = next.speed - 18 * previousAge;
            double rise = Math.max(0, upwardSpeed * elapsed - 9 * elapsed * elapsed);
            Double headroom = upwardSpeed > 0 ? geometry.ceiling(approved, Math.max(.05, rise + .12)) : null;
            if (headroom != null) {
                double hitAfter = Math.min(elapsed, Math.max(0,
                        (upwardSpeed - Math.sqrt(Math.max(0, upwardSpeed * upwardSpeed - 36 * headroom))) / 18));
                next = new Flight(approved.y + headroom, approvedAt + Math.round(hitAfter * 1e9), 0);
            }
            double t = Math.max(0, (now - next.started) / 1e9);
            double lower = Math.max(0, t - .1), upper = t + .1;
            double peak = Math.max(lower, Math.min(upper, next.speed / 18));
            double maximumY = next.originY + displacement(peak, next.speed) + .12;
            double minimumY = next.originY + Math.min(displacement(lower, next.speed), displacement(upper, next.speed)) - .22;
            // A supported landing stops gravity early. Requiring its height to
            // remain on the free-fall parabola falsely rejects the next platform.
            boolean landing = supportedTo && target.y <= approved.y + .001;
            if ((!landing && target.y > maximumY) || target.y < minimumY) return deny("VERTICAL");
            if (supportedTo && (t > .15 || next.speed == 0)) next = null;
        } else if (Math.abs(target.y - approved.y) > horizontal + .22) return deny("VERTICAL");
        if (!geometry.clear(approved, target, supportedFrom && supportedTo)) return deny("COLLISION");
        budget -= horizontal; approved = target; sequence = candidate.seq; approvedAt = now; flight = next;
        return new Decision(true, "ACCEPTED", approved, sequence);
    }
    private Decision deny(String reason) { return new Decision(false, reason, approved, sequence); }
    private static boolean finite(Pose p) { return p != null && Double.isFinite(p.x) && Double.isFinite(p.y) && Double.isFinite(p.z); }
    private static double displacement(double t, double initialSpeed) {
        double terminalAt = (initialSpeed + 20) / 18;
        double ballistic = Math.min(t, terminalAt);
        return initialSpeed * ballistic - 9 * ballistic * ballistic - Math.max(0, t - terminalAt) * 20;
    }
}
