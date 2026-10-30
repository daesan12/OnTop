package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Set;
import java.util.function.LongSupplier;

/** Server-approved movement. The tuned profile accepts bounded client physics, never arbitrary positions. */
public final class ClientPositionValidator {
    public record Pose(double x, double y, double z) {}
    public record Candidate(long seq, long epoch, Pose pose, boolean run, boolean jump, double yaw, boolean manual) {
        public Candidate(long seq, long epoch, Pose pose, boolean run, boolean jump, double yaw) { this(seq, epoch, pose, run, jump, yaw, true); }
        public Candidate(long seq, long epoch, Pose pose, boolean run, boolean jump) { this(seq, epoch, pose, run, jump, 0); }
        public static Candidate parse(JsonNode node) {
            var allowed = Set.of("seq", "epoch", "x", "y", "z", "run", "jump", "yaw", "manual");
            if (node == null || !node.isObject() || node.size() != (node.has("manual") ? 9 : 8)) throw new IllegalArgumentException("fields");
            node.fieldNames().forEachRemaining(key -> { if (!allowed.contains(key)) throw new IllegalArgumentException("fields"); });
            for (var key : Set.of("seq", "epoch")) if (!node.path(key).isIntegralNumber() || !node.path(key).canConvertToLong())
                throw new IllegalArgumentException("sequence");
            for (var key : Set.of("x", "y", "z", "yaw")) if (!node.path(key).isNumber() || !Double.isFinite(node.path(key).asDouble()))
                throw new IllegalArgumentException("coordinates");
            if (!node.path("run").isBoolean() || !node.path("jump").isBoolean()) throw new IllegalArgumentException("intent");
            if (node.has("manual") && !node.path("manual").isBoolean()) throw new IllegalArgumentException("manual");
            return new Candidate(node.path("seq").asLong(), node.path("epoch").asLong(),
                    new Pose(node.path("x").asDouble(), node.path("y").asDouble(), node.path("z").asDouble()),
                    node.path("run").asBoolean(), node.path("jump").asBoolean(), node.path("yaw").asDouble(), !node.has("manual") || node.path("manual").asBoolean());
        }
    }
    interface Geometry {
        boolean supported(Pose pose);
        boolean clear(Pose from, Pose to, boolean allowStep);
        Double ceiling(Pose from, double rise);
        default double jumpSpeed(Pose from, boolean tuned) { return tuned ? 8 : 6.2; }
        default boolean swimming(Pose pose) { return false; }
        default double swimSpeed(boolean run) { return run ? 6.25 : 4; }
        default double floatY() { return 0; }
        default Double swimClimb(Pose from, Pose to) { return null; }
    }
    record Decision(boolean accepted, String reason, Pose approved, long acceptedSeq) {}
    private record Flight(double originY, long started, double speed, Double ceilingY) {
        Flight(double originY, long started, double speed) { this(originY, started, speed, null); }
    }
    private static final long FRESHNESS = 500_000_000L;
    private static final double BURST_SECONDS = .35; // Bounded scheduler/TCP batching.
    private final LongSupplier clock;
    private final Geometry geometry;
    private final double boundary;
    private Pose approved;
    private long sequence, epoch, approvedAt, budgetAt;
    private double budget;
    private boolean blocked;
    private Flight flight;
    private final boolean tuned;
    private long airWindowAt;
    private double airWindowY;
    ClientPositionValidator(Pose initial, long epoch, double boundary, Geometry geometry, LongSupplier clock) {
        this(initial, epoch, boundary, geometry, clock, false);
    }
    ClientPositionValidator(Pose initial, long epoch, double boundary, Geometry geometry, LongSupplier clock, boolean tuned) {
        this.clock = clock; this.geometry = geometry; this.boundary = boundary; this.tuned = tuned;
        relocate(initial, epoch);
    }
    // Only a trusted server call can establish an origin or a new generation.
    synchronized void relocate(Pose pose, long epoch) {
        if (!finite(pose) || Math.abs(pose.x) > boundary + (tuned ? .0001 : 0) || Math.abs(pose.z) > boundary + (tuned ? .0001 : 0))
            throw new IllegalArgumentException("unsafe origin");
        if (tuned) pose = bounded(pose);
        if (!geometry.clear(pose, pose, false)) throw new IllegalArgumentException("unsafe origin");
        approved = pose; this.epoch = epoch; sequence = 0; approvedAt = budgetAt = clock.getAsLong();
        budget = .9; flight = null; airWindowAt = approvedAt; airWindowY = pose.y;
    }
    // Changing the correction epoch never grants a fresh movement budget or jump.
    synchronized void resynchronize(long nextEpoch) { epoch = nextEpoch; }
    synchronized void blocked(boolean value) { blocked = value; }
    synchronized Decision accept(Candidate candidate) {
        long now = clock.getAsLong();
        if (blocked) return deny("ACTIVITY");
        if (candidate == null || !finite(candidate.pose) || !Double.isFinite(candidate.yaw)) return deny("INVALID");
        if (candidate.epoch != epoch) return deny("EPOCH");
        if (candidate.seq <= sequence || candidate.seq < 1 || candidate.seq > 0xffff_ffffL) return deny("SEQUENCE");
        if (now - budgetAt < 0 || now - approvedAt < 0) return deny("CLOCK");
        if (now - approvedAt > (tuned ? 2_000_000_000L : FRESHNESS)) return deny("STALE");
        Pose target = candidate.pose;
        if (Math.abs(target.x) > boundary + (tuned ? .0001 : 0) || Math.abs(target.z) > boundary + (tuned ? .0001 : 0) || Math.abs(target.y) > 256) return deny("BOUNDS");
        // Rapier stores float coordinates; clamp sub-0.1mm rounding back INSIDE the boundary.
        if (tuned) target = bounded(target);
        boolean fromWater = tuned && geometry.swimming(approved), toWater = tuned && geometry.swimming(target);
        double groundSpeed = candidate.run ? (tuned ? 8 : 9) : (tuned ? 6 : 6.25);
        double speed = (fromWater && toWater ? geometry.swimSpeed(candidate.run) : groundSpeed) * (tuned ? 1.15 : 1);
        budget = Math.min(speed * BURST_SECONDS, budget + (now - budgetAt) / 1e9 * speed);
        budgetAt = now;
        double horizontal = Math.hypot(target.x - approved.x, target.z - approved.z);
        if (horizontal > budget + .0001) return deny("SPEED");
        boolean supportedFrom = geometry.supported(approved), supportedTo = geometry.supported(target);
        double launchSpeed = geometry.jumpSpeed(approved, tuned);
        if (tuned) {
            double seconds = (now - approvedAt) / 1e9;
            // Bound large vertical changes, but do not demand Bullet/Rapier ballistic parity.
            double dy = target.y - approved.y;
            if ((dy > launchSpeed * seconds + .7 && !(candidate.jump && supportedFrom && dy <= tunedRise(launchSpeed)))
                    || dy < -85 * seconds - .7) return deny("VERTICAL");
            // The client integrator advances at most 100ms after a rendering stall.
            // Do not count an unobserved packet gap as continuous hovering.
            long nextAirAt = airWindowAt + Math.max(0, now - approvedAt - 100_000_000L);
            double nextAirY = airWindowY;
            if (supportedTo || supportedFrom) { nextAirAt = now; nextAirY = target.y; }
            else if (now - nextAirAt > 1_500_000_000L) {
                if (target.y > airWindowY - .3) return deny("HOVER");
                nextAirAt = now; nextAirY = target.y;
            }
            Flight next = flight;
            if (fromWater && candidate.jump) {
                Double climb = geometry.swimClimb(approved, target);
                if (climb != null && (next == null || next.ceilingY == null)) next = new Flight(approved.y, now, 5.5, climb);
            }
            if ((fromWater || toWater) && (next == null || next.ceilingY == null)) {
                // Shore support can rise through a valid ground slope/automatic step.
                boolean shore = fromWater && !toWater && supportedTo && dy <= horizontal + .22;
                // Buoyancy is valid inside real water, bounded by the server's float level.
                if (!shore && (dy > 2 * seconds + .08 || dy > 0 && target.y > Math.max(approved.y, geometry.floatY() + .15) + .00001))
                    return deny("SWIM_HEIGHT");
                if (!geometry.clear(approved, target, supportedTo && (supportedFrom || shore))) return deny("COLLISION");
                budget -= horizontal; approved = target; sequence = candidate.seq; approvedAt = now;
                flight = null; airWindowAt = now; airWindowY = target.y;
                return new Decision(true, "ACCEPTED", approved, sequence);
            }
            if (next == null && candidate.jump && supportedFrom) next = new Flight(approved.y, now, launchSpeed);
            if (next == null) {
                // Grounded steps/slopes retain the existing geometric allowance.
                // Leaving support without a jump can fall, but cannot invent lift.
                if (supportedTo && supportedFrom) {
                    if (dy > horizontal + .22) return deny("VERTICAL");
                } else {
                    if (dy > .05) return deny("JUMP_REQUIRED");
                    next = new Flight(approved.y, now, 0);
                }
            }
            if (next != null) {
                // Selected jump peaks at about 1.21m. Permit solver/timing margin,
                // without demanding frame-exact Bullet/Rapier ballistic parity.
                double riseLimit = next.speed > 0 ? tunedRise(next.speed) : .05;
                if (target.y > (next.ceilingY == null ? next.originY + riseLimit : next.ceilingY)) return deny("JUMP_HEIGHT");
                if (supportedTo && target.y <= approved.y + .01
                        && (next.speed == 0 || now - next.started > 150_000_000L)) next = null;
            }
            if (!geometry.clear(approved, target, supportedFrom && supportedTo)) {
                // Sub-millimetre contact jitter must not disable the client profile.
                // Acknowledge the report at the LAST SAFE point, never at target:
                // repeated wall reports cannot accumulate penetration.
                if (flight == null && !candidate.jump && supportedFrom && supportedTo
                        && horizontal * horizontal + dy * dy <= .001 * .001) {
                    sequence = candidate.seq; approvedAt = now;
                    return new Decision(true, "CONTACT_HELD", approved, sequence);
                }
                return deny("COLLISION");
            }
            flight = next;
            budget -= horizontal; approved = target; sequence = candidate.seq; approvedAt = now;
            airWindowAt = nextAirAt; airWindowY = nextAirY;
            return new Decision(true, "ACCEPTED", approved, sequence);
        }
        Flight next = flight;
        if (next == null && candidate.jump && supportedFrom) {
            long takeoff = target.y - approved.y > .1 ? approvedAt : now;
            next = new Flight(approved.y, takeoff, launchSpeed);
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
    private Pose bounded(Pose pose) {
        return new Pose(Math.max(-boundary, Math.min(boundary, pose.x)), pose.y, Math.max(-boundary, Math.min(boundary, pose.z)));
    }
    private static double tunedRise(double speed) {
        double height = 0;
        for (double velocity = speed; velocity > 0; velocity = (velocity - 1.5) * .98) height += velocity * .05;
        return height + .24;
    }
    private Decision deny(String reason) { return new Decision(false, reason, approved, sequence); }
    private static boolean finite(Pose p) { return p != null && Double.isFinite(p.x) && Double.isFinite(p.y) && Double.isFinite(p.z); }
    private static double displacement(double t, double initialSpeed) {
        double terminalAt = (initialSpeed + 20) / 18;
        double ballistic = Math.min(t, terminalAt);
        return initialSpeed * ballistic - 9 * ballistic * ballistic - Math.max(0, t - terminalAt) * 20;
    }
}
