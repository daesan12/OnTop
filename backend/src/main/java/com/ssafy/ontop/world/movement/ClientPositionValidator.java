package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.function.LongSupplier;

/** Server-approved movement. The tuned profile accepts bounded client physics, never arbitrary positions. */
public final class ClientPositionValidator {
    public record Pose(double x, double y, double z) {}
    public record Sample(Pose pose, boolean jump) {}
    public record Candidate(long seq, long epoch, Pose pose, boolean run, boolean jump, double yaw, boolean manual,
            List<Sample> path) {
        public Candidate {
            if (path != null) {
                path = List.copyOf(path);
            }
        }
        public Candidate(long seq, long epoch, Pose pose, boolean run, boolean jump, double yaw, boolean manual) {
            this(seq, epoch, pose, run, jump, yaw, manual, null);
        }
        public Candidate(long seq, long epoch, Pose pose, boolean run, boolean jump, double yaw) { this(seq, epoch, pose, run, jump, yaw, true); }
        public Candidate(long seq, long epoch, Pose pose, boolean run, boolean jump) { this(seq, epoch, pose, run, jump, 0); }
        public static Candidate parse(JsonNode node) {
            var allowed = Set.of("seq", "epoch", "x", "y", "z", "run", "jump", "yaw", "manual", "path");
            if (node == null || !node.isObject()
                    || node.size() != 8 + (node.has("manual") ? 1 : 0) + (node.has("path") ? 1 : 0)) {
                throw new IllegalArgumentException("fields");
            }
            node.fieldNames().forEachRemaining(key -> { if (!allowed.contains(key)) throw new IllegalArgumentException("fields"); });
            for (var key : Set.of("seq", "epoch")) if (!node.path(key).isIntegralNumber() || !node.path(key).canConvertToLong())
                throw new IllegalArgumentException("sequence");
            for (var key : Set.of("x", "y", "z", "yaw")) if (!node.path(key).isNumber() || !Double.isFinite(node.path(key).asDouble()))
                throw new IllegalArgumentException("coordinates");
            if (!node.path("run").isBoolean() || !node.path("jump").isBoolean()) throw new IllegalArgumentException("intent");
            if (node.has("manual") && !node.path("manual").isBoolean()) throw new IllegalArgumentException("manual");
            List<Sample> path = null;
            if (node.has("path")) {
                var points = node.path("path");
                if (!points.isArray() || points.isEmpty() || points.size() > MAX_PATH_SAMPLES) {
                    throw new IllegalArgumentException("path");
                }
                path = new ArrayList<>();
                for (var point : points) {
                    if (!point.isObject() || point.size() != 4 || !point.path("jump").isBoolean()) {
                        throw new IllegalArgumentException("path sample");
                    }
                    for (var key : Set.of("x", "y", "z")) {
                        if (!point.path(key).isNumber() || !Double.isFinite(point.path(key).asDouble())) {
                            throw new IllegalArgumentException("path coordinates");
                        }
                    }
                    path.add(new Sample(new Pose(point.path("x").asDouble(), point.path("y").asDouble(),
                            point.path("z").asDouble()), point.path("jump").asBoolean()));
                }
            }
            return new Candidate(node.path("seq").asLong(), node.path("epoch").asLong(),
                    new Pose(node.path("x").asDouble(), node.path("y").asDouble(), node.path("z").asDouble()),
                    node.path("run").asBoolean(), node.path("jump").asBoolean(), node.path("yaw").asDouble(),
                    !node.has("manual") || node.path("manual").asBoolean(), path);
        }
    }
    interface Geometry {
        boolean supported(Pose pose);
        boolean clear(Pose from, Pose to, boolean allowStep);
        default boolean clearCorner(Pose from, Pose to) { return false; }
        default boolean clearContact(Pose from, Pose to) { return false; }
        Double ceiling(Pose from, double rise);
        default double jumpSpeed(Pose from, boolean tuned) { return tuned ? 8 : 6.2; }
        default double jumpSpeed(Pose from, Pose to, boolean tuned) { return jumpSpeed(from, tuned); }
        /** 가장자리에서 굴러 내려가며 떠나는 바닥의 모서리만 스친 경로인지. 기본은 허용하지 않는다. */
        default boolean rollsOff(Pose from, Pose to) { return false; }
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
    private static final int MAX_PATH_SAMPLES = 64;
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
    private long pendingJumpUntil = Long.MIN_VALUE;
    private double airWindowY;
    /** 코요테 3틱(100ms)에 보고 간격 여유 50ms. 점프맵 활성 채널에서만 켠다. */
    private static final long COYOTE_NANOS = 150_000_000L;
    private boolean jumpGrace;
    private double groundLaunchSpeed = 8;

    void jumpGrace(boolean enabled) { jumpGrace = enabled; }
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
        budget = .9; flight = null; airWindowAt = approvedAt; airWindowY = pose.y; pendingJumpUntil = Long.MIN_VALUE;
    }
    // Trusted native-to-client handoff carries vertical motion, never a free movement burst.
    synchronized void resumeTrusted(double velocityY) {
        budget = 0;
        if (velocityY > 0 || !geometry.supported(approved))
            flight = new Flight(approved.y, approvedAt, Math.max(0, velocityY));
    }
    // Changing the correction epoch never grants a fresh movement budget or jump.
    synchronized void resynchronize(long nextEpoch) { epoch = nextEpoch; pendingJumpUntil = Long.MIN_VALUE; }
    synchronized void blocked(boolean value) { blocked = value; }
    synchronized Decision accept(Candidate candidate) {
        long now = clock.getAsLong();
        if (candidate == null || candidate.path == null) {
            return acceptSample(candidate, now, true, 0);
        }
        var path = candidate.path;
        if (!tuned || !finite(candidate.pose) || path.isEmpty() || path.size() > MAX_PATH_SAMPLES
                || path.stream().anyMatch(sample -> !finite(sample.pose))
                || !path.getLast().pose.equals(candidate.pose)) {
            return deny("INVALID_PATH");
        }
        // 낙하 한도는 중간점 수와 무관하다. 상승 한도에는 검증된 중간 착지만 반영한다.
        double seconds = Math.max(0, (now - approvedAt) / 1e9);
        double rise = candidate.pose.y - approved.y;
        double launchSpeed = geometry.jumpSpeed(approved, true);
        boolean takeoff = path.stream().anyMatch(Sample::jump);
        if (rise < -85 * seconds - .7) {
            return deny("VERTICAL");
        }
        double ceilingY = approved.y + launchSpeed * seconds + .7;
        if (takeoff && geometry.supported(approved)) {
            ceilingY = Math.max(ceilingY, approved.y + tunedRise(launchSpeed));
        }
        var before = new Checkpoint(approved, sequence, approvedAt, budgetAt, budget, flight,
                airWindowAt, airWindowY, pendingJumpUntil, groundLaunchSpeed);
        boolean committed = false;
        try {
            Decision result = null;
            for (int index = 0; index < path.size(); index++) {
                var sample = path.get(index);
                var from = approved;
                var previousFlight = flight;
                result = acceptSample(new Candidate(candidate.seq, candidate.epoch, sample.pose,
                        candidate.run, sample.jump, candidate.yaw, candidate.manual), now, index == 0, seconds);
                if (!result.accepted) {
                    return new Decision(false, result.reason, before.approved, before.sequence);
                }
                // 충돌/예산/점프 검사를 통과해 실제로 새 Flight를 만든 지지 출발점만 인정한다.
                // 공중 jump 표식이나 아직 검증하지 않은 높은 발판은 한도를 늘리지 못한다.
                if (flight != null && flight != previousFlight && flight.speed > 0 && flight.ceilingY == null
                        && ((flight.originY == from.y && geometry.supported(from))
                        || (flight.originY == approved.y && geometry.supported(approved)))) {
                    ceilingY = Math.max(ceilingY, flight.originY + tunedRise(flight.speed));
                }
            }
            if (candidate.pose.y > ceilingY) {
                return new Decision(false, "VERTICAL", before.approved, before.sequence);
            }
            committed = true;
            return result;
        } finally {
            if (!committed) {
                approved = before.approved;
                sequence = before.sequence;
                approvedAt = before.approvedAt;
                budgetAt = before.budgetAt;
                budget = before.budget;
                flight = before.flight;
                airWindowAt = before.airWindowAt;
                airWindowY = before.airWindowY;
                pendingJumpUntil = before.pendingJumpUntil;
                groundLaunchSpeed = before.groundLaunchSpeed;
            }
        }
    }

    private record Checkpoint(Pose approved, long sequence, long approvedAt, long budgetAt, double budget,
            Flight flight, long airWindowAt, double airWindowY, long pendingJumpUntil, double groundLaunchSpeed) {}

    /** 모든 중간점은 같은 서버 수신 시각을 사용한다. 클라이언트가 시간이나 이동 예산을 늘릴 수 없다. */
    private Decision acceptSample(Candidate candidate, long now, boolean checkSequence, double batchSeconds) {
        if (blocked) return deny("ACTIVITY");
        if (candidate == null || !finite(candidate.pose) || !Double.isFinite(candidate.yaw)) return deny("INVALID");
        if (candidate.epoch != epoch) return deny("EPOCH");
        if (checkSequence && (candidate.seq <= sequence || candidate.seq < 1 || candidate.seq > 0xffff_ffffL)) return deny("SEQUENCE");
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
            // Middle samples share the receipt time, not a zero-duration physics step.
            // The overall report keeps its own vertical envelope and a single horizontal budget.
            double seconds = (now - approvedAt) / 1e9;
            // Bound large vertical changes, but do not demand Bullet/Rapier ballistic parity.
            double dy = target.y - approved.y;
            if ((dy > launchSpeed * seconds + .7 && !(candidate.jump && supportedFrom && dy <= tunedRise(launchSpeed)))
                    || dy < -85 * Math.max(batchSeconds, seconds) - .7) return deny("VERTICAL");
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
            long nextJumpUntil = candidate.jump ? now + 150_000_000L : pendingJumpUntil;
            if (supportedFrom) groundLaunchSpeed = launchSpeed;
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
                if (!geometry.clear(approved, target, supportedTo && (supportedFrom || shore))
                        && !geometry.clearContact(approved, target)) return deny("COLLISION");
                budget -= horizontal; approved = target; sequence = candidate.seq; approvedAt = now;
                flight = null; airWindowAt = now; airWindowY = target.y;
                return new Decision(true, "ACCEPTED", approved, sequence);
            }
            // A short landing can happen between position reports. A new jump
            // from server-confirmed support must not reuse the preceding flight's
            // origin/height ceiling, or be cleared as that flight's landing.
            boolean jumpRequested = candidate.jump || now <= pendingJumpUntil && supportedFrom && !supportedTo && dy > .05;
            boolean landingJump = jumpRequested && (supportedFrom || supportedTo && dy <= 0)
                    && (next == null || next.speed == 0 || now - next.started > 150_000_000L);
            if (landingJump) {
                Pose origin = supportedFrom ? approved : target;
                next = new Flight(origin.y, now, geometry.jumpSpeed(origin, target, true));
                nextJumpUntil = Long.MIN_VALUE;
            }
            // Supported stairs can outgrow an earlier jump envelope after landing.
            // Merely passing close to the next platform while rising must not erase
            // a still-valid flight (including the course's coyote jump).
            if (!landingJump && next != null && supportedFrom && supportedTo && now - next.started > 150_000_000L
                    && target.y > (next.ceilingY == null ? next.originY + (next.speed > 0 ? tunedRise(next.speed) : .05) : next.ceilingY))
                next = null;
            // v2 코요테: 걸어 나가 떨어진 지 100ms(+보고 간격 여유) 안의 점프 한 번은 떠나온 바닥 기준으로 허용한다.
            // 점프로 떠난 비행(speed>0)이나 이미 코요테를 쓴 비행은 다시 올라갈 수 없다.
            if (jumpGrace && next != null && next.speed == 0 && candidate.jump && !supportedFrom
                    && now - next.started <= COYOTE_NANOS) {
                next = new Flight(next.originY, now, groundLaunchSpeed);
                nextJumpUntil = Long.MIN_VALUE;
            }
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
            // dev clearCorner: 공원 전체에서 한 자동 계단 높이 안의 둥근 걷는 모서리(모든 접촉이 걷는 면).
            // 점프맵 rollsOff: 점프맵 활성 채널에서 지지면을 떠나 내려가는 경로의 떠나는 모서리(얇은 발판의 가파른 모서리 포함).
            // 두 허용은 서로 다른 조건이며 어느 쪽도 다가가는 벽·바닥 관통·도착 겹침은 받지 않는다.
            if (!geometry.clear(approved, target, supportedFrom && supportedTo) && !geometry.clearCorner(approved, target)
                    && !(jumpGrace && supportedFrom && dy < 0 && geometry.rollsOff(approved, target))) {
                // Sub-millimetre contact jitter must not disable the client profile.
                // Acknowledge the report at the LAST SAFE point, never at target:
                // repeated wall reports cannot accumulate penetration.
                if (flight == null && !candidate.jump && supportedFrom && supportedTo
                        && horizontal * horizontal + dy * dy <= .001 * .001) {
                    sequence = candidate.seq; approvedAt = now;
                    return new Decision(true, "CONTACT_HELD", approved, sequence);
                }
                if (!geometry.clearContact(approved, target)) return deny("COLLISION");
            }
            flight = next;
            pendingJumpUntil = nextJumpUntil;
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
