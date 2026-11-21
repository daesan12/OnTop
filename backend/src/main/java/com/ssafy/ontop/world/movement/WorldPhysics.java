package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.JsonNode;
import com.jme3.bullet.PhysicsSpace;
import com.jme3.bullet.collision.shapes.CapsuleCollisionShape;
import com.jme3.bullet.objects.PhysicsCharacter;
import com.jme3.bullet.objects.PhysicsRigidBody;
import com.jme3.math.Vector3f;

import java.util.HashMap;
import java.util.Map;

/** All calls belong to the registry lock. Channels have separate collision worlds. */
public final class WorldPhysics implements AutoCloseable {
    private static final java.util.concurrent.atomic.AtomicLong POSITION_EPOCHS =
            new java.util.concurrent.atomic.AtomicLong(System.currentTimeMillis() * 1000);
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(WorldPhysics.class);
    private long physicsTick;
    public static final long STEP_NANOS = 1_000_000_000L / 30;
    private static final float DT = 1f / 30;
    private static final float TERRAIN_RECOVERY_RADIUS = 2;
    private static final float TERRAIN_RECOVERY_MAX_HEIGHT_DIFF = .35f;
    private static final int[] TERRAIN_RECOVERY_DIRECTIONS = {0, 1, -1, 2, -2, 3, -3, 4};
    private static final float EXCLUSION_POSITION_TOLERANCE_SQUARED = 1e-8f;
    private static final float CARRY_HEIGHT = 1.7f;
    private static final int MAX_THROW_TICKS = 90;
    private static final int CARRY_COOLDOWN_TICKS = 30;
    // Bullet's 4cm skin can read a few float ulps deeper on a valid floor.
    private static final float STAND_PENETRATION_TOLERANCE = .0401f;
    private static final double THROW_SPEED = 14;
    private static final double THROW_LIFT = 8;
    private static final double THROW_AIM_LIFT = 6;
    /** 측정한 ghost sweep 관통 시작 속도(약 27m/s)의 절반 이하. */
    private static final double FAST_FALL_SWEEP = 12;
    private ParkScene scene;
    private final java.util.function.Supplier<ParkScene> sceneSource;
    private PhysicsSpace space;
    private com.jme3.bullet.objects.PhysicsGhostObject standProbe;
    private final Map<String, Actor> actors = new HashMap<>();
    private final Map<String, Chair> chairs = new HashMap<>();
    private final Map<String, PhysicsRigidBody> secretDoors = new HashMap<>();
    private boolean secretDoorsOpen;
    private static final java.util.regex.Pattern CHAIR = java.util.regex.Pattern.compile("(.+)-chair-([0-7])");
    private static final class Chair {
        final String anchor;
        final int number;
        final PhysicsRigidBody body;
        boolean active;
        Chair(String anchor, int number, PhysicsRigidBody body) {
            this.anchor = anchor; this.number = number; this.body = body;
        }
    }
    private JsonNode movement;
    private final boolean clientPositions;
    private final boolean tunedMovement;
    // 활성화가 승인한 코스만 받는다. null이면 기존 공원 충돌만 사용한다.
    private final com.ssafy.ontop.world.jumpmap.JumpCourse course;
    private final java.util.function.LongSupplier clock;
    private PositionCollision positionCollision;
    private RenewalCourseMotion renewalMotion;
    private PhysicsRigidBody duckBoat;
    private double duckBoatTime = Double.NaN;

    private boolean duckBoatHidden;

    /** 오리배 탑승 운항 중에는 장식 순환 배를 숨기고 충돌도 뺀다. */
    public void setDuckBoatHidden(boolean hidden) {
        call(() -> {
            if (duckBoat == null || duckBoatHidden == hidden) {
                return null;
            }
            duckBoatHidden = hidden;
            if (hidden) {
                if (Double.isFinite(duckBoatTime)) {
                    space.removeCollisionObject(duckBoat);
                }
                duckBoatTime = Double.NaN;
            } else {
                syncDuckBoat(courseTime());
            }
            return null;
        });
    }

    private void syncDuckBoat(double now) {
        if (duckBoat == null || duckBoatHidden || duckBoatTime == now) {
            return;
        }
        JsonNode route = scene.data.path("duckBoat");
        double period = route.path("period").asDouble();
        double angle = (now % period) / period * Math.PI * 2;
        double rx = route.path("rx").asDouble(), rz = route.path("rz").asDouble();
        double x = route.path("x").asDouble() + Math.cos(angle) * rx;
        double z = route.path("z").asDouble() + Math.sin(angle) * rz;
        double yaw = Math.atan2(-Math.sin(angle) * rx, Math.cos(angle) * rz) + Math.PI;
        if (Double.isFinite(duckBoatTime)) {
            space.removeCollisionObject(duckBoat);
        }
        duckBoat.setPhysicsLocation(new Vector3f((float) x, (float) route.path("y").asDouble(), (float) z));
        duckBoat.setPhysicsRotation(new com.jme3.math.Quaternion().fromAngleAxis((float) yaw, Vector3f.UNIT_Y));
        space.addCollisionObject(duckBoat);
        duckBoatTime = now;
    }
    private final double utcSeconds = System.currentTimeMillis()/1000d;
    private long motionOrigin;
    private double stepCourseTime = Double.NaN;

    private double courseTime() {
        return Double.isNaN(stepCourseTime) ? utcSeconds + (clock.getAsLong() - motionOrigin) / 1e9 : stepCourseTime;
    }
    private void prepareCourse(String id) {
        Actor actor = actors.get(id);
        if (renewalMotion != null && actor != null) {
            prepareCourseAt(actor, actor.body.getPhysicsLocation(null));
        }
    }

    private void prepareCourseAt(Actor actor, Vector3f position) {
        if (renewalMotion != null) {
            renewalMotion.prepare(actor.id, courseTime(), position);
        }
    }

    private boolean ridingCoursePad(Actor actor) {
        return renewalMotion != null && renewalMotion.riding(actor.id);
    }

    public void jumpmapRun(String id, String runId) {
        call(()->{if(renewalMotion!=null)renewalMotion.run(id,runId);return null;});
    }

    private Thread owner;
    private final java.util.concurrent.ExecutorService executor =
            java.util.concurrent.Executors.newSingleThreadExecutor(
                    task -> {
                        owner =
                                Thread.ofPlatform()
                                        .daemon(true)
                                        .name("world-physics")
                                        .unstarted(task);
                        return owner;
                    });

    private <T> T call(java.util.function.Supplier<T> task) {
        if (Thread.currentThread() == owner) {
            return task.get();
        }
        try {
            return java.util.concurrent.CompletableFuture.supplyAsync(task, executor).join();
        } catch (java.util.concurrent.CompletionException exception) {
            if (exception.getCause() instanceof Error error) {
                throw error;
            }
            if (exception.getCause() instanceof RuntimeException error) {
                throw error;
            }
            throw exception;
        }
    }

    public WorldPhysics() {
        this(ParkScene::load);
    }

    public WorldPhysics(ParkScene scene) {
        this(() -> java.util.Objects.requireNonNull(scene));
    }

    private WorldPhysics(java.util.function.Supplier<ParkScene> sceneSource) {
        this(sceneSource, false, System::nanoTime);
    }

    public WorldPhysics(ParkScene scene, boolean clientPositions, java.util.function.LongSupplier clock) {
        this(() -> java.util.Objects.requireNonNull(scene), clientPositions, clock);
    }

    public WorldPhysics(ParkScene scene, boolean clientPositions, java.util.function.LongSupplier clock, boolean tunedMovement) {
        this(scene, clientPositions, clock, tunedMovement, null);
    }

    public WorldPhysics(ParkScene scene, boolean clientPositions, java.util.function.LongSupplier clock, boolean tunedMovement,
            com.ssafy.ontop.world.jumpmap.JumpCourse course) {
        this(() -> java.util.Objects.requireNonNull(scene), clientPositions, clock, tunedMovement, course);
    }
    private WorldPhysics(java.util.function.Supplier<ParkScene> sceneSource, boolean clientPositions,
            java.util.function.LongSupplier clock) {
        this(sceneSource, clientPositions, clock, false, null);
    }
    private WorldPhysics(java.util.function.Supplier<ParkScene> sceneSource, boolean clientPositions,
            java.util.function.LongSupplier clock, boolean tunedMovement, com.ssafy.ontop.world.jumpmap.JumpCourse course) {
        this.sceneSource = sceneSource;
        this.clientPositions = clientPositions;
        this.tunedMovement = tunedMovement;
        this.course = course;
        this.clock = clock;
        try {
            call(
                    () -> {
                        initialize();
                        return null;
                    });
        } catch (RuntimeException | Error failure) {
            executor.shutdownNow();
            throw failure;
        }
    }

    private void initialize() {
        motionOrigin = clock.getAsLong();
        scene = sceneSource.get();
        movement = scene.data.path("movement");
        space = new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        space.setAccuracy(DT);
        space.setMaxSubSteps(0);
        standProbe = new com.jme3.bullet.objects.PhysicsGhostObject(
                new CapsuleCollisionShape(number("radius"), number("halfHeight") * 2, 1));
        standProbe.setCollisionGroup(1); standProbe.setCollideWithGroups(2);
        for (ParkScene.Shape shape : scene.shapes) {
            var body = new PhysicsRigidBody(shape.shape(), 0);
            body.setUserObject(shape.id());
            body.setPhysicsLocation(shape.center());
            body.setPhysicsRotation(shape.rotation());
            body.setCollisionGroup(2);
            body.setCollideWithGroups(1);
            if (shape.id().startsWith("secret-door-")) secretDoors.put(shape.id(), body);
            var match = CHAIR.matcher(shape.id());
            if (match.matches()) {
                var chair = new Chair(match.group(1), Integer.parseInt(match.group(2)) + 1, body);
                if (chairs.putIfAbsent(shape.id(), chair) != null) {
                    throw new IllegalStateException("중복 의자 충돌 ID");
                }
                chair.active = chair.number <= 2;
                if (chair.active) { space.addCollisionObject(body); }
            } else { space.addCollisionObject(body); }
        }
        if (course != null) {
            if (!course.mapVersion().equals(scene.version())) {
                throw new IllegalArgumentException("점프맵 코스와 공원 충돌 맵의 버전이 다릅니다.");
            }
            var bodies=JumpCourseColliders.addTo(space, course);
            if(course.renewal()) renewalMotion=new RenewalCourseMotion(course,bodies,space);
        }
        JsonNode duck = scene.data.path("duckBoat");
        if (duck.isObject()) {
            var shape = new com.jme3.bullet.collision.shapes.BoxCollisionShape(ParkScene.vector(duck.path("half")));
            shape.setMargin(.02f);
            duckBoat = new PhysicsRigidBody(shape, 0);
            duckBoat.setUserObject("duck-boat-circulating");
            duckBoat.setCollisionGroup(2);
            duckBoat.setCollideWithGroups(1);
            syncDuckBoat(courseTime());
        }
        positionCollision = new PositionCollision(scene, space, this::activeShape);
    }

    /** The two entrances share one channel state. Closing cannot trap someone inside or in a doorway. */
    public boolean setSecretDoors(String userId, boolean open) {
        return call(() -> {
            Actor actor = actors.get(userId);
            if (actor == null || actor.seated || actor.swimming || secretDoors.isEmpty()) return false;
            Vector3f position = actor.body.getPhysicsLocation(null);
            if (!nearSecretDoor(position, 3.5)) return false;
            if (open == secretDoorsOpen) return true;
            if (!open && actors.values().stream().anyMatch(other -> {
                Vector3f at = other.body.getPhysicsLocation(null);
                return inSecretCorridor(at) || nearSecretDoor(at, 1.65);
            })) return false;
            secretDoorsOpen = open;
            for (var door : secretDoors.values()) {
                if (open) space.removeCollisionObject(door);
                else space.addCollisionObject(door);
            }
            return true;
        });
    }

    /** The map defines the approach side and destination. The client only chooses a door. */
    public Snapshot useInteriorAccess(String userId, String access) {
        return call(() -> {
            Actor actor = actors.get(userId);
            if (actor == null || actor.seated || actor.swimming || actor.carriedBy != null || actor.carryingId != null
                    || actor.throwTicks > 0) return null;
            var layout = scene.data.path("interiorAccess");
            if (!layout.path("entrancesOpen").asBoolean(true) && ("vestibule".equals(access) || "entry".equals(access))) {
                return null;
            }
            var route = layout.path("routes").path(access);
            if (!route.isObject()) return null;
            Vector3f position = actor.body.getPhysicsLocation(null);
            var from = route.path("from");
            if (Math.abs(position.y - from.get(1).asDouble()) > .55
                    || Math.hypot(position.x - from.get(0).asDouble(), position.z - from.get(2).asDouble())
                        > route.path("radius").asDouble()) return null;
            if ("exit".equals(access) && !actor.interiorExitReady) return null;
            var to = route.path("to");
            double x = to.get(0).asDouble(), y = to.get(1).asDouble(), z = to.get(2).asDouble();
            if (!canStand(x, y, z)) return null;
            placeNow(userId, x, y, z);
            actor.yaw = route.path("yaw").asDouble();
            if ("entry".equals(access) || "passage".equals(access) || "exit".equals(access)
                    || "return".equals(access)) {
                actor.interiorExitReady = false;
            }
            return snapshotNow(userId);
        });
    }

    private float parkBoundary() {
        var world = scene.data.path("world");
        return (float) (world.path("halfSize").asDouble() - world.path("boundaryHalfDepth").asDouble())
                - number("radius") - number("offset");
    }

    private static boolean insideVolume(Vector3f position, com.fasterxml.jackson.databind.JsonNode bounds) {
        return bounds.isObject()
                && position.x > bounds.path("x0").asDouble() && position.x < bounds.path("x1").asDouble()
                && position.z > bounds.path("z0").asDouble() && position.z < bounds.path("z1").asDouble()
                && position.y > bounds.path("floor").asDouble() + .4 && position.y < bounds.path("ceiling").asDouble();
    }

    private void updateInteriorArrival(Actor actor) {
        if (!actor.interiorExitReady && !actor.airborne
                && insideVolume(actor.body.getPhysicsLocation(null), scene.data.path("interiorAccess").path("upperArrival"))) {
            actor.interiorExitReady = true;
        }
    }

    private boolean nearSecretDoor(Vector3f position, double distance) {
        for (var door : secretDoors.values()) {
            Vector3f center = door.getPhysicsLocation(null);
            if (Math.abs(position.y - center.y + .8) <= 1.2
                    && Math.hypot(position.x - center.x, position.z - center.z) < distance) return true;
        }
        return false;
    }

    private boolean inSecretCorridor(Vector3f position) {
        var bounds = scene.data.path("secretCorridor");
        return bounds.isObject() && position.y > bounds.path("floor").asDouble() + .4
                && position.y < bounds.path("ceiling").asDouble()
                && position.x > bounds.path("x0").asDouble() - .35 && position.x < bounds.path("x1").asDouble() + .35
                && position.z > bounds.path("z0").asDouble() && position.z < bounds.path("z1").asDouble();
    }

    /** 승인된 채널별 앵커 설정만 받는다. 정적 맵의 의자 몸체를 재사용한다. */
    public Map<String, Snapshot> chairCounts(Map<String, Integer> counts) {
        var copy = Map.copyOf(counts);
        if (copy.values().stream().anyMatch(count -> count < 2 || count > 8)) {
            throw new IllegalArgumentException("의자 수는 2~8개입니다.");
        }
        return call(() -> {
            Map<String, Snapshot> relocated = new java.util.HashMap<>();
            var added = new java.util.HashSet<PhysicsRigidBody>();
            for (Chair chair : chairs.values()) {
                boolean active = chair.number <= copy.getOrDefault(chair.anchor, 2);
                if (active == chair.active) { continue; }
                chair.active = active;
                if (active) { space.addCollisionObject(chair.body); added.add(chair.body); }
                else { space.removeCollisionObject(chair.body); }
            }
            if (!added.isEmpty()) {
                for (var entry : actors.entrySet()) {
                    Actor actor = entry.getValue();
                    if (actor.seated) { continue; }
                    Vector3f position = actor.body.getPhysicsLocation(null);
                    var probe = standProbe;
                    probe.setPhysicsLocation(position);
                    boolean[] overlaps = {false};
                    space.contactTest(probe, event -> {
                        if (event.getDistance1() < -.02f
                                && (added.contains(event.getObjectA()) || added.contains(event.getObjectB()))) {
                            overlaps[0] = true;
                        }
                    });
                    if (overlaps[0]) {
                        Vector3f target = nearbyStand(position);
                        if (target == null) {
                            target = validatedFallback(actor, (float) scene.data.path("world").path("halfSize").asDouble() - 1);
                        }
                        recover(actor, position, target, "CHAIR_ACTIVATED", System.nanoTime());
                        relocated.put(entry.getKey(), snapshotNow(entry.getKey()));
                    }
                }
            }
            return Map.copyOf(relocated);
        });
    }

    private Vector3f nearbyStand(Vector3f origin) {
        for (float distance = .25f; distance <= 4; distance += .25f) {
            for (int direction = 0; direction < 16; direction++) {
                double angle = direction * Math.PI / 8;
                var candidate = origin.add((float) Math.cos(angle) * distance, 0, (float) Math.sin(angle) * distance);
                if (canStand(candidate.x, candidate.y, candidate.z)) { return candidate; }
            }
        }
        return null;
    }

    public void add(String id) {
        call(
                () -> {
                    addNow(id);
                    return null;
                });
    }

    private void addNow(String id) {
        int slot = 0;
        while (occupied(slot)) {
            slot++;
        }
        var capsule = new CapsuleCollisionShape(number("radius"), number("halfHeight") * 2, 1);
        // Bullet capsules use their radius as an internal margin; it cannot be set as Rapier's skin.
        var body = new PhysicsCharacter(capsule, number("stepHeight"));
        body.setGravity(-number("gravity"));
        body.setFallSpeed(-number("maxFallSpeed"));
        body.setJumpSpeed(number("jumpSpeed"));
        body.setCollisionGroup(1);
        body.setCollideWithGroups(2); // Reference excludes other kinematic avatars.
        body.setPhysicsLocation(scene.spawn(slot));
        space.addCollisionObject(body);
        actors.put(id, new Actor(id, body, slot, scene.spawn(slot)));
        actors.get(id).yaw = scene.spawnYaw();
        Actor actor = actors.get(id);
        if (clientPositions && (tunedMovement || !specialMovement(actor.body.getPhysicsLocation(null)))) {
            actor.clientControlled = true;
            space.removeCollisionObject(body);
            resetMotion(actor);
        }
    }

    private boolean occupied(int slot) {
        return actors.values().stream().anyMatch(a -> a.slot == slot);
    }

    public void remove(String id) {
        call(
                () -> {
                    removeNow(id);
                    return null;
                });
    }

    private void removeNow(String id) {
        if(renewalMotion!=null)renewalMotion.remove(id);
        releaseCarryNow(id);
        Actor actor = actors.remove(id);
        if (actor != null && !actor.seated && !actor.clientControlled) {
            space.removeCollisionObject(actor.body);
        }
    }

    public void setVehicleSpeed(String id, int speed) {
        call(() -> {
            Actor actor = actors.get(id);
            stopNow(id);
            if (speed > 0) {
                serverControl(actor);
            }
            actor.vehicleSpeed = speed;
            return null;
        });
    }

    public boolean input(String id, MoveInput input, long now) {
        return call(() -> inputNow(id, input, now));
    }

    /** 물리 tick 전 입력과 입력 만료 뒤의 공중 상태도 활동 중으로 판정한다. */
    public boolean hasMovementActivity(String id, long now) {
        return call(() -> {
            Actor actor = actors.get(id);
            return actor != null && (actor.airborne || actor.jumpQueued || actor.jumpRequestTick >= 0 || (actor.moving && (!actor.clientControlled
                    || now >= actor.receivedAt && now - actor.receivedAt <= (tunedMovement ? 2_000_000_000L : 500_000_000L))) || (inputActive(actor, now)
                    && (actor.input.dx() != 0 || actor.input.dz() != 0 || actor.input.jump())));
        });
    }

    private static boolean inputActive(Actor actor, long now) {
        return actor.input != null && now >= actor.receivedAt && now - actor.receivedAt <= 250_000_000L;
    }

    private boolean inputNow(String id, MoveInput input, long now) {
        Actor actor = actors.get(id);
        if (actor.carriedBy != null || actor.throwTicks > 0) { return false; }
        if (actor.clientControlled) {
            if (tunedMovement) return false; // A direction-only packet cannot downgrade the selected movement engine.
            // An already-open old client only knows WORLD_MOVE. Keep it usable during rollout.
            // Once position reporting starts, delayed directional inputs must never switch authority.
            if (actor.positionReportedEver) return false;
            actor.positionDisabled = true;
            serverControl(actor);
        }
        if (input.seq() <= actor.seq) {
            return false;
        }
        if (actor.vehicleSpeed > 0) {
            input = new MoveInput(input.seq(), input.dx(), input.dz(), false, false);
        }
        actor.seq = input.seq();
        actor.input = input;
        actor.receivedAt = now;
        if (jumpGrace() && !actor.swimming) {
            // v2: 접지 여부와 상관없이 요청 틱만 기록한다. 판단은 매 틱 버퍼·코요테 창으로 한다.
            // 명세의 "지금 틱"은 이 입력을 처리할 다음 물리 틱이다(착지 4틱 전 입력은 착지 틱에 뛴다).
            if (input.jump()) actor.jumpRequestTick = physicsTick + 1;
            return true;
        }
        boolean canJump = actor.swimming || actor.body.onGround()
                && scene.policy.allowsSupport(actor.body.getPhysicsLocation(null), this::activeShape);
        actor.jumpQueued |= input.jump() && canJump;
        if (input.jump()) {
            log.debug("공원 점프 입력 seq={} tick={} decision={} grounded={} swimming={} map={}",
                    input.seq(), physicsTick, canJump ? "QUEUED" : "NOT_GROUNDED", actor.body.onGround(), actor.swimming, scene.version());
        }
        return true;
    }

    public void stop(String id) {
        call(
                () -> {
                    stopNow(id);
                    return null;
                });
    }

    private void stopNow(String id) {
        Actor actor = actors.get(id);
        if (actor != null) {
            actor.input = null;
            actor.jumpQueued = false;
            actor.jumpRequestTick = -1;
            actor.climbTargetY = 0;
            actor.followSteering = null;
            actor.moving = false;
            actor.running = false;
            actor.body.setWalkDirection(Vector3f.ZERO);
        }
    }

    public void step(long now, java.util.Set<String> seated) {
        step(now, seated, java.util.Map.of());
    }

    public void step(long now, java.util.Set<String> seated, java.util.Map<String, String> following) {
        call(
                () -> {
                    stepCourseTime = utcSeconds + (now - motionOrigin) / 1e9;
                    try {
                        stepNow(now, seated, following);
                    } finally {
                        stepCourseTime = Double.NaN;
                    }
                    return null;
                });
    }

    private void stepNow(long now, java.util.Set<String> seated, java.util.Map<String, String> following) {
        physicsTick++;
        syncDuckBoat(courseTime());
        for (var entry : actors.entrySet()) {
            Actor a = entry.getValue();
            if (clientPositions || ridingCoursePad(a)) {
                prepareCourse(entry.getKey());
            }
            a.body.getPhysicsLocation(a.beforeStepPosition);
            if (a.carriedBy != null) { continue; }
            if (seated.contains(entry.getKey())) {
                stop(entry.getKey());
                if (!a.seated) {
                    boolean wasClientControlled = a.clientControlled;
                    if (!a.clientControlled) space.removeCollisionObject(a.body);
                    a.clientControlled = false;
                    a.positionValidator = null;
                    a.body.setLinearVelocity(Vector3f.ZERO);
                    a.seated = true;
                    a.relocations++;
                    if (wasClientControlled) resetMotion(a);
                }
                continue;
            }
            if (a.seated) {
                a.seated = false;
                space.addCollisionObject(a.body);
            }
            // Automatic follow must advance even when the browser is throttled/minimized.
            if (tunedMovement && clientPositions && following.containsKey(entry.getKey()) && a.clientControlled) serverControl(a);
            if (ridingCoursePad(a)) {
                a.courseRide = true;
                if (a.clientControlled) {
                    long previousEpoch = a.motionEpoch;
                    serverControl(a);
                    a.courseRidePreviousEpoch = previousEpoch;
                    a.courseRideHandoffTick = physicsTick;
                }
            }
            if (tunedMovement && clientPositions && !a.clientControlled && !a.positionDisabled
                    && a.throwTicks == 0 && a.vehicleSpeed == 0 && !a.courseRide
                    && !following.containsKey(entry.getKey())) {
                resumeClientControl(a);
            }
            if (!tunedMovement && a.clientControlled && (following.containsKey(entry.getKey()) || specialMovement(a.body.getPhysicsLocation(null)))) {
                serverControl(a);
            }
            if (a.clientControlled) {
                // Catch-up steps can predate a report received just before this
                // batch. The physical tick timestamp is not an expiry clock.
                long freshnessNow = clock.getAsLong();
                boolean fresh = !a.reportStarted || freshnessNow >= a.receivedAt && freshnessNow - a.receivedAt <= (tunedMovement ? 2_000_000_000L : 500_000_000L);
                if (!fresh) {
                    log.info("로컬 좌표 검증 복귀 reason=REPORT_EXPIRED seq={}", a.seq);
                    if (tunedMovement) expireReports(a);
                    else { a.positionDisabled = true; serverControl(a); }
                }
            }
            if (a.clientControlled) {
                a.followSteering = null;
                // Correct only a server-approved position, never a client's claimed large move.
                anticipateExclusion(a, freshnessTime());
                a.motion = new Motion(a.motionEpoch, physicsTick, a.seq, 0, a.motion.velocityY(),
                        a.motion.velocityY() <= 0 && positionCollision.supported(pose(a)), true, "CLIENT_VALIDATED");
                continue;
            }
            MoveInput input = a.input;
            boolean active = inputActive(a, now);
            if (!active && !following.containsKey(entry.getKey()) && (a.moving || a.running)) {
                log.debug("공원 이동 정지 seq={} tick={} reason=INPUT_EXPIRED ageMs={} map={}",
                        a.seq, physicsTick, (now - a.receivedAt) / 1_000_000, scene.version());
            }
            if (following.containsKey(entry.getKey())) {
                String targetId = following.get(entry.getKey());
                input = followInput(a, seated.contains(targetId) ? null : actors.get(targetId));
                active = true;
            }
            Vector3f position = a.body.getPhysicsLocation(null);
            boolean onMovingPad = false;
            if (ridingCoursePad(a) && !a.leftByJump) {
                double footOffset = number("halfHeight") + number("radius") + number("offset");
                Double top = renewalMotion.riddenTop(a.id, position, courseTime(), footOffset, number("radius"));
                if (top != null) {
                    onMovingPad = true;
                    float riderY = (float) (top + footOffset);
                    if (position.y != riderY) {
                        position = position.add(0, riderY - position.y, 0);
                        a.body.warp(position);
                    }
                }
            }
            a.swimming = swimming(position);
            float speed =
                    a.swimming
                            ? (float)
                                    scene.data
                                            .path("swimming")
                                            .path(active && input.run() ? "fastSpeed" : "speed")
                                            .asDouble()
                            : a.vehicleSpeed > 0 ? a.vehicleSpeed : number(active && input.run() ? "runSpeed" : "walkSpeed");
            double dx = active ? input.dx() : 0, dz = active ? input.dz() : 0;
            if (a.throwTicks > 0) {
                dx = a.throwX / speed;
                dz = a.throwZ / speed;
                active = false;
            }
            if (course != null || a.throwTicks > 0) {
                // 기본 ghost sweep은 겹친 몸체만 검사해 얇은 발판을 약 27m/s 이상 낙하에서 지나칠 수 있다.
                // 코스 활성 채널에서 빠르게 떨어지는 틱만 world sweep으로 경로 전체를 검사한다.
                // 걷기·계단·벽·일반 점프는 기존 ghost sweep 그대로다.
                // Thrown capsules must sweep the whole path, including thin building walls.
                a.body.setSweepTest(a.throwTicks == 0 && a.motion.velocityY() >= -FAST_FALL_SWEEP);
            }
            float stepX = (float) dx * speed * DT;
            float stepZ = (float) dz * speed * DT;
            if (a.throwTicks > 0) {
                float limit = parkBoundary();
                stepX = Math.clamp(position.x + stepX, -limit, limit) - position.x;
                stepZ = Math.clamp(position.z + stepZ, -limit, limit) - position.z;
            }
            var walkStep = new Vector3f(stepX, 0, stepZ);
            if (a.vehicleSpeed > 0 && !a.swimming && a.throwTicks == 0 && walkStep.lengthSquared() > 0) {
                walkStep = scene.policy.limitFurnitureTravel(position, walkStep, this::activeShape);
            }
            a.body.setWalkDirection(walkStep);
            if (active && a.jumpQueued && a.swimming && (dx != 0 || dz != 0)) {
                for (JsonNode stone : scene.data.path("steppingStones")) {
                    double sx = stone.path("x").asDouble(), sz = stone.path("z").asDouble();
                    double ex =
                            Math.max(
                                    0,
                                    Math.abs(position.x - sx) - stone.path("width").asDouble() / 2);
                    double ez =
                            Math.max(
                                    0,
                                    Math.abs(position.z - sz) - stone.path("depth").asDouble() / 2);
                    if (Math.hypot(ex, ez) <= .8
                            && (sx - position.x) * dx + (sz - position.z) * dz > .02) {
                        a.climbTargetY =
                                stone.path("top").asDouble()
                                        + number("halfHeight")
                                        + number("radius")
                                        + .16;
                        break;
                    }
                }
            }
            if (position.y >= a.climbTargetY) {
                a.climbTargetY = 0;
            }
            if (a.climbTargetY > 0) {
                a.body.setGravity(0);
                a.body.jump(new Vector3f(0, 5.5f, 0));
                a.body.setLinearVelocity(
                        new Vector3f((float) dx * speed * DT, 5.5f, (float) dz * speed * DT));
            } else if (a.swimming) {
                float target =
                        (float)
                                (scene.data.path("lake").path("surfaceY").asDouble()
                                        + scene.data
                                                .path("swimming")
                                                .path("floatOffset")
                                                .asDouble());
                a.body.setGravity(0);
                float buoyancy = Math.max(-2, Math.min(2, (target - position.y) * 5));
                if (buoyancy > 0) {
                    // Bullet's direct velocity setter does not update its upward jump axis.
                    a.body.jump(new Vector3f(0, buoyancy, 0));
                }
                a.body.setLinearVelocity(
                        new Vector3f((float) dx * speed * DT, buoyancy, (float) dz * speed * DT));
            } else {
                a.body.setGravity(-number("gravity"));
                if (jumpGrace()) {
                    applyJumpGrace(a, position, onMovingPad);
                } else if (active && a.jumpQueued && a.body.onGround() && scene.policy.allowsSupport(position, this::activeShape)) {
                    a.body.setJumpSpeed((float) surfaceJumpSpeed(position));
                    a.body.jump();
                }
            }
            if (!scene.policy.allowsSupport(position, this::activeShape) && a.body.onGround() && a.motion.velocityY() <= 0) {
                a.body.jump(new Vector3f(0, -.1f, 0));
            }
            if (now >= a.receivedAt) { a.jumpQueued = false; }
            if (dx != 0 || dz != 0) {
                a.yaw = Math.atan2(dx, dz);
            }
            a.moving = active && walkStep.lengthSquared() > 0;
            a.running = active && input.run();
        }
        if(renewalMotion==null) space.update(DT, 0);
        else {
            // 코스 미진입자는 모두 한 스텝을 공유한다. 진입자도 실제 발판 상태가 같으면 함께 계산한다.
            // 개인별 연잎 소멸 상태가 다른 경우에만 공간을 분리해서 진행한다.
            var nativeActors=actors.entrySet().stream().filter(e->!e.getValue().seated && !e.getValue().clientControlled && e.getValue().carriedBy==null).toList();
            var groups = new java.util.LinkedHashMap<RenewalCourseMotion.State, java.util.List<Actor>>();
            for (var entry : nativeActors) {
                var state = renewalMotion.state(entry.getKey(), courseTime(), entry.getValue().body.getPhysicsLocation(null));
                groups.computeIfAbsent(state, ignored -> new java.util.ArrayList<>()).add(entry.getValue());
            }
            if (groups.size() == 1) {
                renewalMotion.prepare(groups.keySet().iterator().next());
                space.update(DT, 0);
            } else if (!groups.isEmpty()) {
                for (var entry : nativeActors) {
                    space.removeCollisionObject(entry.getValue().body);
                }
                try {
                    for (var group : groups.entrySet()) {
                        renewalMotion.prepare(group.getKey());
                        for (Actor actor : group.getValue()) {
                            space.addCollisionObject(actor.body);
                        }
                        try {
                            space.update(DT, 0);
                        } finally {
                            for (Actor actor : group.getValue()) {
                                space.removeCollisionObject(actor.body);
                            }
                        }
                    }
                } finally {
                    for (var entry : nativeActors) {
                        space.addCollisionObject(entry.getValue().body);
                    }
                }
            }
        }
        for (var entry : actors.entrySet()) {
            Actor carried = entry.getValue();
            if (carried.carriedBy == null) { continue; }
            Actor carrier = actors.get(carried.carriedBy);
            Vector3f next = carrier == null ? null : carrier.body.getPhysicsLocation(null).add(0, CARRY_HEIGHT, 0);
            if (next != null) {
                prepareCourseAt(carried, next);
            }
            if (next == null || !canOccupy(next)) {
                releaseCarryNow(entry.getKey());
            } else {
                carried.body.warp(next);
                carried.yaw = carrier.yaw;
                // 피운반자는 물리 계산에서 제외되지만 좌표 스트림의 틱은 진행해야 한다.
                // 같은 틱을 재사용하면 원격 보간기가 갱신된 운반 좌표를 중복으로 버린다.
                carried.motion = new Motion(carried.motionEpoch, physicsTick, carried.seq, 0,
                        (next.y - carried.beforeStepPosition.y) / DT, false, false);
                Vector3f ground = carrier.body.getPhysicsLocation(null);
                if (carrier.motion.grounded() && ground.distanceSquared(carried.carrySafe) >= .04f) {
                    prepareCourseAt(carried, ground);
                    if (canStand(ground.x, ground.y, ground.z)) {
                        carried.carrySafe.set(ground);
                    }
                }
            }
        }
        for (var entry : actors.entrySet()) {
            Actor a = entry.getValue();
            if (a.seated || a.clientControlled) { continue; }
            Vector3f position = a.body.getPhysicsLocation(null);
            // The grouped physics step leaves the last group's colliders installed.
            // Recover this rider's own moving pad before testing its support.
            if (ridingCoursePad(a)) {
                prepareCourseAt(a, position);
            }
            correctExclusion(a, position, scene.policy.slide(position, this::activeShape), a.beforeStepPosition);
            position = a.body.getPhysicsLocation(null);
            boolean onMovingPad = ridingCoursePad(a) && !a.leftByJump
                    && renewalMotion.riddenTop(a.id, position, courseTime(),
                            number("halfHeight") + number("radius") + number("offset"), number("radius")) != null;
            boolean supported = (onMovingPad || a.body.onGround()) && scene.policy.allowsSupport(position, this::activeShape);
            a.motion = new Motion(a.motionEpoch, physicsTick, now >= a.receivedAt ? a.seq : a.motion.appliedInputSeq(),
                    Math.min(250, Math.max(0, (now - a.receivedAt) / 1_000_000.0)),
                    supported ? 0 : (position.y - a.beforeStepPosition.y) / DT, supported, inputActive(a, now),
                    null, null, null, null, null, supported && onMovingPad ? renewalMotion.movingPad(a.id) : null);
            float limit = parkBoundary();
            if (!Vector3f.isValidVector(position)) {
                recover(a, position, validatedFallback(a, limit), "INVALID_POSITION", now);
            } else if (penetratesTerrain(position)) {
                prepareCourse(entry.getKey());
                float x = Math.max(-limit, Math.min(limit, position.x));
                float z = Math.max(-limit, Math.min(limit, position.z));
                Vector3f support = localGroundSupport(x, z);
                if (support == null) {
                    support = groundNearExclusion(a, x, z, limit);
                }
                recover(a, position, support == null ? validatedFallback(a, limit) : support,
                        support == null ? "NO_LOCAL_SUPPORT" : "TERRAIN_PENETRATION", now);
            } else {
                float x = Math.max(-limit, Math.min(limit, position.x));
                float z = Math.max(-limit, Math.min(limit, position.z));
                if (x != position.x || z != position.z) {
                    a.body.warp(new Vector3f(x, position.y, z));
                }
                if (supported) {
                    a.lastSafe.set(x, position.y, z);
                    if (jumpGrace() && !a.swimming) {
                        a.lastGroundedTick = physicsTick;
                        a.leftByJump = false;
                        a.coyoteUsed = false;
                        a.groundJumpSpeed = surfaceJumpSpeed(a.body.getPhysicsLocation(null));
                    }
                }
            }
            a.airborne = !a.seated && !supported;
            if (supported && !ridingCoursePad(a)) {
                a.courseRide = false;
            }
            if (!a.seated) updateInteriorArrival(a);
            boolean thrownOverlap = a.throwTicks > 0 && !canOccupy(position);
            boolean thrownEdge = a.throwTicks > 0 && supported && !a.swimming
                    && !canStand(position.x, position.y, position.z);
            if (a.throwTicks > 0 && (--a.throwTicks == 0 || supported || a.swimming || thrownOverlap)) {
                // onGround도 층 모서리의 캡슐 겹침을 허용하므로 안전한 지지면을 확인한다.
                if (thrownOverlap || thrownEdge) {
                    Vector3f raised = position.add(0, .12f, 0);
                    // A wall hit in midair returns to the last non-penetrating
                    // point of this flight before searching for a nearby floor.
                    Vector3f landing = thrownOverlap && !supported && canOccupy(a.beforeStepPosition) ? a.beforeStepPosition.clone()
                            : canStand(raised.x, raised.y, raised.z) ? raised : nearbyStand(raised);
                    if (landing == null) {
                        landing = carryExit(raised, a);
                    }
                    a.body.warp(landing);
                    a.body.setLinearVelocity(Vector3f.ZERO);
                    position.set(landing);
                }
                a.throwTicks = 0;
                a.throwX = a.throwZ = 0;
                a.body.setSweepTest(true);
                stopNow(entry.getKey());
                resetMotion(a);
            }
            if (clientPositions && !a.positionDisabled
                    && a.throwTicks == 0 && a.vehicleSpeed == 0
                    && !following.containsKey(entry.getKey()) && !specialMovement(a.body.getPhysicsLocation(null))
                    && supported && !ridingCoursePad(a)) {
                stopNow(entry.getKey());
                a.clientControlled = true;
                space.removeCollisionObject(a.body);
                a.positionValidator = null;
                resetMotion(a);
            }
        }
    }

    /** 서버 30Hz 코요테 3틱·점프 버퍼 4틱(BE 명세 12장). 점프맵 활성(코스 적용) 채널의 공원 전체에만 쓴다. */
    static final int COYOTE_TICKS = 3;
    static final int JUMP_BUFFER_TICKS = 4;

    private boolean jumpGrace() { return course != null; }

    /** 전망대 길은 전망대 점프 속도, 그 밖은 팔각정 등 지역 정책 속도다. */
    private double surfaceJumpSpeed(Vector3f position) {
        return isTower(position)
                ? (tunedMovement ? 8f : scene.data.path("tower").path("jumpSpeed").asDouble())
                : scene.policy.jumpSpeed(position, tunedMovement);
    }

    private void applyJumpGrace(Actor a, Vector3f position, boolean onMovingPad) {
        if (a.jumpRequestTick >= 0 && physicsTick - a.jumpRequestTick > JUMP_BUFFER_TICKS) a.jumpRequestTick = -1;
        if (a.jumpRequestTick < 0) return;
        boolean grounded = (onMovingPad || a.body.onGround())
                && scene.policy.allowsSupport(position, this::activeShape);
        boolean coyote = !grounded && !a.leftByJump && !a.coyoteUsed && physicsTick - a.lastGroundedTick <= COYOTE_TICKS;
        if (!grounded && !coyote) return;
        // 코요테는 떠나온 바닥의 점프 속도를 쓴다.
        float jumpSpeed = (float) (grounded ? surfaceJumpSpeed(position) : a.groundJumpSpeed);
        a.body.setJumpSpeed(jumpSpeed);
        if (onMovingPad || !grounded) {
            // Bullet's no-argument jump requires native ground contact, which a
            // moving collider update or an authorized coyote jump may not have.
            a.body.jump(new Vector3f(0, jumpSpeed, 0));
        } else {
            a.body.jump();
        }
        if (!grounded) a.coyoteUsed = true;
        a.leftByJump = true;
        a.jumpRequestTick = -1;
    }

    /** 재조정 뒤 FE가 남은 창을 복원하는 선택 필드. 서버 이동 중일 때만 싣는다. */
    private JumpGrace graceOf(Actor a) {
        if (!jumpGrace() || a.clientControlled || a.seated || a.swimming) return null;
        int coyote = a.leftByJump || a.coyoteUsed ? 0
                : (int) Math.max(0, Math.min(COYOTE_TICKS, COYOTE_TICKS - (physicsTick - a.lastGroundedTick)));
        int buffer = a.jumpRequestTick < 0 ? 0
                : (int) Math.max(0, Math.min(JUMP_BUFFER_TICKS, JUMP_BUFFER_TICKS - (physicsTick - a.jumpRequestTick)));
        return new JumpGrace(coyote, buffer);
    }

    public record JumpGrace(int coyoteTicks, int jumpBufferTicks) {}

    private long freshnessTime() { return clock.getAsLong(); }
    private void anticipateExclusion(Actor actor, long now) {
        if (actor.seated || actor.motion.grounded() || actor.motion.velocityY() > 0) return;
        Vector3f current = actor.body.getPhysicsLocation(null);
        double horizon = Math.min(.1, Math.max(DT * 2, (now - actor.receivedAt) / 1e9));
        float drop = (float) (Math.min(0, actor.motion.velocityY()) * horizon + number("gravity") * horizon * horizon / 2);
        Vector3f probe = current.add(0, drop, 0);
        Vector3f projected = scene.policy.slide(probe, this::activeShape);
        projected.y = current.y;
        correctExclusion(actor, current, projected, null);
    }

    private boolean activeShape(String id) {
        if (secretDoorsOpen && secretDoors.containsKey(id)) return false;
        Chair chair = chairs.get(id);
        return chair == null || chair.active;
    }

    private void correctExclusion(Actor actor, Vector3f from, Vector3f target, Vector3f beforeStep) {
        if (actor.seated || from.distanceSquared(target) < 1e-10f) return;
        // 지형을 관통한 서버 좌표는 같은 낮은 높이에서 밀어내지 않고 물리 틱에서 지면부터 복구한다.
        if (!actor.clientControlled && penetratesTerrain(from)) {
            return;
        }
        prepareCourse(actor.id);
        float boundary = parkBoundary();
        float vertical = (float) Math.min(0, actor.motion.velocityY());
        if (!canCorrectExclusion(from, target, boundary)) {
            // 밀려날 방향이 다른 장애물에 막히면, 이번 틱에 접근하기 전의 안전한 위치로 돌아간다.
            if (beforeStep != null && canCorrectExclusion(from, beforeStep, boundary)
                    && canStand(beforeStep.x, beforeStep.y, beforeStep.z)) {
                target = beforeStep;
                actor.lastSafe.set(beforeStep);
                actor.moving = false;
                actor.running = false;
                vertical = 0;
            } else {
                target = validatedFallback(actor, boundary);
            }
        }
        actor.body.warp(target);
        actor.body.setLinearVelocity(new Vector3f(0, vertical, 0));
        actor.airborne = true;
        resetMotion(actor);
        actor.motion = new Motion(actor.motionEpoch, physicsTick, actor.seq, 0, vertical, false, true,
                actor.clientControlled ? "CLIENT_VALIDATED" : null);
        log.debug("공원 차단영역 복구 tick={} map={} reason=NO_CLIMB", physicsTick, scene.version());
    }

    private boolean canCorrectExclusion(Vector3f from, Vector3f target, float boundary) {
        return Vector3f.isValidVector(target) && Math.abs(target.x) <= boundary && Math.abs(target.z) <= boundary
                && scene.policy.slide(target, this::activeShape).distanceSquared(target)
                        <= EXCLUSION_POSITION_TOLERANCE_SQUARED
                && positionCollision.correctionClear(from, target);
    }

    private boolean penetratesTerrain(Vector3f position) {
        return Vector3f.isValidVector(position)
                && position.y < scene.groundHeight(position.x, position.z)
                        + number("halfHeight") + number("radius") - .35
                && !inSecretCorridor(position) && !nearSecretDoor(position, 1.4)
                && !insideVolume(position, scene.data.path("interiorAccess").path("annex"))
                && !inInteriorApproach(position);
    }

    // 절개된 입구의 낮은 발판은 절벽의 원래 높이 조회값보다 아래에 있다.
    private boolean inInteriorApproach(Vector3f position) {
        var layout = scene.data.path("interiorAccess");
        if (!layout.path("entrancesOpen").asBoolean(true)) {
            return false;
        }
        for (var bounds : layout.path("approaches")) {
            if (insideVolume(position, bounds)) {
                return true;
            }
        }
        return false;
    }

    private boolean specialMovement(Vector3f p) { return swimming(p) || isTower(p); }

    private static ClientPositionValidator.Pose pose(Actor actor) {
        var p = actor.body.getPhysicsLocation(null);
        return new ClientPositionValidator.Pose(p.x, p.y, p.z);
    }

    private void serverControl(Actor actor) {
        if (!actor.clientControlled) return;
        actor.clientControlled = false;
        actor.positionValidator = null;
        space.addCollisionObject(actor.body);
        float vertical = (float) actor.motion.velocityY();
        // Bullet keeps its upward jump axis separately from linear velocity.
        if (vertical > 0) actor.body.jump(new Vector3f(0, vertical, 0));
        actor.body.setLinearVelocity(new Vector3f(0, vertical, 0));
        resetMotion(actor);
    }
    /**
     * 재접속 유예 뒤 같은 캐릭터에 새 연결을 묶는다. 위치·속도는 그대로 두고 입력 순번을 0부터, 이동 epoch를 새로 시작한다.
     * 유예용 위치 보고 중지(positionDisabled)도 풀어, PARK_V1은 다음 틱에 기존 resumeClientControl로 위치 보고에 돌아간다.
     */
    public Snapshot rebind(String id) {
        return call(() -> {
            Actor actor = actors.get(id);
            stopNow(id);
            actor.seq = 0;
            actor.positionDisabled = false;
            actor.positionReportedEver = false;
            if (actor.clientControlled) serverControl(actor);
            else resetMotion(actor);
            return snapshotNow(id);
        });
    }

    /**
     * 점프맵 재접속 유예: 연결이 없는 동안 서버 물리로 낙하·호수 판정을 잇는다. PARK_V1의 자동 위치 보고 복귀
     * (resumeClientControl)는 rebind 전까지 막는다.
     */
    public Snapshot suspendClient(String id) {
        return call(() -> {
            Actor actor = actors.get(id);
            stopNow(id);
            actor.positionDisabled = true;
            serverControl(actor);
            return snapshotNow(id);
        });
    }

    private ClientPositionValidator newPositionValidator(Actor actor) {
        double boundary = scene.data.path("world").path("halfSize").asDouble()
                - scene.data.path("world").path("boundaryHalfDepth").asDouble() - number("radius") - number("offset");
        var validator = new ClientPositionValidator(pose(actor), actor.motionEpoch, boundary, positionCollision, clock, tunedMovement);
        validator.jumpGrace(jumpGrace());
        return validator;
    }
    private void resumeClientControl(Actor actor) {
        double velocityY = actor.motion.velocityY();
        boolean grounded = positionCollision.supported(pose(actor));
        // With jump grace enabled inputNow stores a tick, not jumpQueued. Consume
        // that same fresh request at the authority handoff before resetMotion clears it.
        boolean bufferedJump = jumpGrace() && actor.jumpRequestTick >= 0
                && physicsTick >= actor.jumpRequestTick
                && physicsTick - actor.jumpRequestTick <= JUMP_BUFFER_TICKS;
        if ((actor.jumpQueued || bufferedJump) && grounded) {
            velocityY = scene.policy.jumpSpeed(actor.body.getPhysicsLocation(null), true);
            grounded = false;
        }
        actor.jumpQueued = false; actor.moving = actor.running = false;
        actor.clientControlled = true; space.removeCollisionObject(actor.body);
        actor.body.setWalkDirection(Vector3f.ZERO);
        resetMotion(actor);
        actor.positionValidator = newPositionValidator(actor);
        actor.positionValidator.resumeTrusted(velocityY);
        actor.reportStarted = true;
        actor.airborne = !grounded;
        actor.motion = new Motion(actor.motionEpoch, physicsTick, actor.seq, 0, velocityY, grounded, false, "CLIENT_VALIDATED");
    }
    /** Server-owned automatic movement; manual PARK_V1 keeps client validation. */
    public Snapshot followMovement(String id) {
        return call(() -> { serverControl(actors.get(id)); return snapshotNow(id); });
    }
    public Snapshot serverMovement(String id) {
        return call(() -> { if (!tunedMovement) serverControl(actors.get(id)); return snapshotNow(id); });
    }
    public Snapshot disablePosition(String id, long epoch) {
        return call(() -> {
            Actor actor = actors.get(id);
            if (actor.clientControlled && actor.motionEpoch == epoch) {
                if (tunedMovement) { correctReport(actor, "SIMULATION_UNAVAILABLE"); return snapshotNow(id); }
                actor.positionDisabled = true;
                serverControl(actor);
            }
            return snapshotNow(id);
        });
    }

    /** Client-position profile. Validation, body and official snapshot change on one owner thread. */
    public Snapshot report(String id, ClientPositionValidator.Candidate candidate, long now) {
        return call(() -> {
            prepareCourse(id);
            if (!clientPositions) throw new IllegalStateException("위치 보고 모드가 비활성화돼 있습니다.");
            Actor a = actors.get(id);
            if (a.seated) return snapshotNow(id);
            if (!a.clientControlled) {
                // Keep the server's pose and accept the in-flight jump once after the handoff.
                if (ridingCoursePad(a) && !a.leftByJump && candidate.jump() && candidate.epoch() == a.courseRidePreviousEpoch
                        && candidate.seq() > a.seq && physicsTick - a.courseRideHandoffTick < JUMP_BUFFER_TICKS) {
                    a.courseRidePreviousEpoch = -1;
                    a.seq = candidate.seq();
                    a.jumpRequestTick = physicsTick + 1;
                }
                return snapshotNow(id);
            }
            if (candidate.epoch() != a.motionEpoch || candidate.seq() <= a.seq) return snapshotNow(id);
            anticipateExclusion(a, now);
            if (candidate.epoch() != a.motionEpoch) return snapshotNow(id);
            if (a.positionValidator == null) {
                a.positionValidator = newPositionValidator(a);
            }
            var before = pose(a);
            var result = a.positionValidator.accept(candidate);
            if (!result.accepted()) {
                log.info("로컬 좌표 검증 복귀 reason={} seq={}", result.reason(), a.seq);
                if (tunedMovement) {
                    if (result.reason().equals("STALE")) expireReports(a);
                    else if (result.reason().equals("HOVER")) {
                        // Resetting repeatedly at the same unsupported pose cannot
                        // accumulate enough fall to leave the hover window. Recover once.
                        expireReports(a);
                        a.positionValidator = newPositionValidator(a);
                        a.positionValidator.resumeTrusted(0);
                        a.correctionReason = "HOVER";
                    }
                    else correctReport(a, result.reason());
                    return snapshotNow(id);
                }
                // A rejection falls back for the connection's remaining life. Old reports
                // cannot keep advancing epochs or replenish a fresh validator's budget.
                a.positionDisabled = true;
                serverControl(a);
                return snapshotNow(id);
            }
            a.correctionReason = null;
            var p = result.approved();
            if (candidate.jump() && positionCollision.supported(before)) {
                a.reportedJumpSpeed = scene.policy.jumpSpeed(new Vector3f((float) before.x(), (float) before.y(), (float) before.z()), tunedMovement);
            }
            if (candidate.path() != null) {
                var takeoff = before;
                for (var sample : candidate.path()) {
                    if (sample.jump() && positionCollision.supported(takeoff)) {
                        a.reportedJumpSpeed = positionCollision.jumpSpeed(takeoff, sample.pose(), tunedMovement);
                    }
                    takeoff = sample.pose();
                }
            }
            double seconds = Math.max(.001, (now - a.receivedAt) / 1e9);
            double vy = Math.max(tunedMovement ? -78.4 : -20, Math.min(Math.max(number("jumpSpeed"), a.reportedJumpSpeed), (p.y() - before.y()) / seconds));
            a.body.warp(new Vector3f((float) p.x(), (float) p.y(), (float) p.z()));
            a.seq = candidate.seq(); a.receivedAt = now; a.yaw = candidate.yaw();
            a.reportStarted = true;
            a.positionReportedEver = true;
            a.moving = Math.hypot(p.x() - before.x(), p.z() - before.z()) > .0001;
            a.running = a.moving && candidate.run(); a.swimming = swimming(a.body.getPhysicsLocation(null));
            a.airborne = !positionCollision.supported(p);
            updateInteriorArrival(a);
            if (!a.airborne) a.lastSafe.set((float)p.x(), (float)p.y(), (float)p.z());
            a.motion = new Motion(a.motionEpoch, physicsTick, a.seq, 0, vy, !a.airborne, true, "CLIENT_VALIDATED");
            if (!tunedMovement && specialMovement(a.body.getPhysicsLocation(null))) serverControl(a);
            return snapshotNow(id);
        });
    }

    private void correctReport(Actor actor, String reason) {
        actor.motionEpoch = POSITION_EPOCHS.incrementAndGet();
        if (actor.positionValidator != null) actor.positionValidator.resynchronize(actor.motionEpoch);
        actor.moving = actor.running = false;
        actor.correctionReason = reason;
        actor.motion = new Motion(actor.motionEpoch, physicsTick, actor.seq, 250,
                Math.min(0, actor.motion.velocityY()), positionCollision.supported(pose(actor)), false, "CLIENT_VALIDATED");
    }
    private void expireReports(Actor actor) {
        var current = pose(actor);
        if (!positionCollision.supported(current) && !positionCollision.swimming(current)) {
            var below = positionCollision.supportBelow(current);
            Vector3f safe = below == null ? validatedFallback(actor, (float)scene.data.path("world").path("halfSize").asDouble()-1)
                    : new Vector3f((float)below.x(), (float)below.y(), (float)below.z());
            actor.relocations++; // 서버가 옮긴 위치다(점프맵은 진행 중 판을 RESET). 지지면 위 대기는 해당하지 않는다.
            actor.body.warp(safe);
        }
        actor.body.setLinearVelocity(Vector3f.ZERO);
        actor.moving = actor.running = false;
        resetMotion(actor);
        actor.correctionReason = "REPORT_EXPIRED";
        actor.swimming = swimming(actor.body.getPhysicsLocation(null));
        actor.motion = new Motion(actor.motionEpoch, physicsTick, actor.seq, 250, 0,
                positionCollision.supported(pose(actor)), false, "CLIENT_VALIDATED");
    }

    // 지형 높이는 탐색 범위만 정한다. 실제 충돌 지지면과 캡슐 여유를 확인한 위치로 복구한다.
    private Vector3f localGroundSupport(float x, float z) {
        float ground = (float) scene.groundHeight(x, z);
        Vector3f from = new Vector3f(x, ground + 2, z), to = new Vector3f(x, ground - 2, z);
        return space.rayTest(from, to).stream()
                .filter(hit -> hit.getCollisionObject().getCollisionGroup() == 2)
                .sorted(java.util.Comparator.comparingDouble(com.jme3.bullet.collision.PhysicsRayTestResult::getHitFraction))
                .map(hit -> new Vector3f(x, from.y - 4 * hit.getHitFraction()
                        + number("halfHeight") + number("radius") + .04f, z))
                .filter(p -> canStand(p.x, p.y, p.z)).findFirst().orElse(null);
    }

    private Vector3f groundNearExclusion(Actor actor, float x, float z, float boundary) {
        float centerY = (float) scene.groundHeight(x, z) + number("halfHeight") + number("radius") + .04f;
        var origin = new Vector3f(x, centerY, z);
        if (scene.policy.slide(origin, this::activeShape).distanceSquared(origin)
                <= EXCLUSION_POSITION_TOLERANCE_SQUARED) {
            return null;
        }
        // 같은 지면에서 마지막으로 안전했던 쪽으로 먼저 돌아가야 테이블 반대편으로 넘어가지 않는다.
        Vector3f safe = actor.lastSafe;
        if (Math.hypot(safe.x - x, safe.z - z) <= TERRAIN_RECOVERY_RADIUS) {
            Vector3f candidate = groundExitCandidate(origin, safe.x, safe.z, boundary);
            if (candidate != null) {
                return candidate;
            }
        }
        // 직전 틱의 수평 이동이 없으면 마지막 안전 위치를 진입 방향의 기준으로 삼는다.
        Vector3f previous = actor.beforeStepPosition;
        double previousDistance = Math.hypot(previous.x - x, previous.z - z);
        if (!Vector3f.isValidVector(previous) || previousDistance < .001
                || previousDistance > TERRAIN_RECOVERY_RADIUS) {
            previous = safe;
        }
        double returnAngle = Math.atan2(previous.z - z, previous.x - x);
        for (int direction : TERRAIN_RECOVERY_DIRECTIONS) {
            double angle = returnAngle + direction * Math.PI / 4;
            float dx = (float) Math.cos(angle), dz = (float) Math.sin(angle);
            for (float distance = .25f; distance <= TERRAIN_RECOVERY_RADIUS; distance += .25f) {
                Vector3f candidate = groundExitCandidate(origin, x + distance * dx, z + distance * dz, boundary);
                if (candidate != null) {
                    return candidate;
                }
            }
        }
        return null;
    }

    private Vector3f groundExitCandidate(Vector3f origin, float x, float z, float boundary) {
        if (Math.abs(x) > boundary || Math.abs(z) > boundary) {
            return null;
        }
        Vector3f candidate = localGroundSupport(x, z);
        if (candidate == null || Math.abs(candidate.y - origin.y) > TERRAIN_RECOVERY_MAX_HEIGHT_DIFF) {
            return null;
        }
        // 지형을 관통한 Y에서 검사하면 벽 아래로 지나칠 수 있으므로 지면 위의 캡슐 경로를 검사한다.
        return canCorrectExclusion(origin, candidate, boundary) ? candidate : null;
    }

    private Vector3f validatedFallback(Actor actor, float limit) {
        prepareCourse(actor.id);
        Vector3f safe = actor.lastSafe;
        if (Vector3f.isValidVector(safe) && Math.abs(safe.x) <= limit && Math.abs(safe.z) <= limit
                && canStand(safe.x, safe.y, safe.z)) { return safe.clone(); }
        for (int i = 0; i < 16; i++) {
            Vector3f spawn = scene.spawn(actor.slot + i);
            if (canStand(spawn.x, spawn.y, spawn.z)) { return spawn; }
        }
        throw new IllegalStateException("충돌이 없는 공원 복구 위치를 찾을 수 없습니다.");
    }

    private void recover(Actor actor, Vector3f from, Vector3f target, String reason, long now) {
        actor.relocations++;
        actor.recovery = new Recovery(reason, physicsTick, actor.seq, now, from.x, from.y, from.z,
                target.x, target.y, target.z, actor.lastSafe.x, actor.lastSafe.y, actor.lastSafe.z,
                Vector3f.isValidVector(from) ? scene.groundHeight(from.x, from.z) : Double.NaN, actor.body.onGround(), actor.swimming,
                actor.body.getLinearVelocity(null).y);
        log.warn("공원 위치 복구 reason={} tick={} seq={} map={}", reason, physicsTick, actor.seq, scene.version());
        log.debug("공원 위치 복구 상세 {}", actor.recovery);
        actor.body.warp(target);
        actor.body.setLinearVelocity(Vector3f.ZERO);
        actor.lastSafe.set(target);
        actor.input = null;
        actor.jumpQueued = false;
        actor.climbTargetY = 0;
        actor.moving = actor.running = false;
        actor.swimming = swimming(target);
        resetMotion(actor);
    }

    /**
     * 서버가 가진 현재 위치의 발밑 충돌체. CLIENT_VALIDATED에서는 검증을 통과한 승인 좌표다.
     * 클라이언트가 보낸 착지 여부나 발판 번호는 사용하지 않는다. 착석·시설 이용 중에는 NONE이다.
     */
    public Support support(String id) {
        return call(() -> {
            prepareCourse(id);
            Actor actor = actors.get(id);
            if (actor == null || actor.seated) return Support.NONE;
            var object = positionCollision.supportObject(pose(actor));
            if (object == null) return Support.NONE;
            if (object.getUserObject() instanceof com.ssafy.ontop.world.jumpmap.JumpCourse.Collider pad) {
                return new Support(Support.Kind.COURSE, pad.id(), pad);
            }
            String collider = String.valueOf(object.getUserObject());
            // 두 맵 모두 meshes[0]이 지형이다(groundHeight와 같은 기준).
            boolean terrain = collider.equals(scene.data.path("meshes").get(0).path("id").asText());
            return new Support(terrain ? Support.Kind.TERRAIN : Support.Kind.STRUCTURE, collider, null);
        });
    }

    /**
     * 점프맵 판정 입력 한 건. 서버 몸체(승인 좌표) 기준이며 feet는 캡슐 중심 - 발 높이,
     * aboveGround는 발 높이와 그 자리 지형 높이의 차이다.
     */
    public Observation observe(String id) {
        return call(() -> {
            Actor actor = actors.get(id);
            Vector3f p = actor.body.getPhysicsLocation(null);
            double feet = p.y - number("halfHeight") - number("radius") - number("offset");
            var support=support(id);
            if(renewalMotion!=null)renewalMotion.contact(id,support.course(),courseTime());
            return new Observation(support, actor.swimming, actor.seated, feet,
                    feet - scene.groundHeight(p.x, p.z), actor.relocations, p.x, p.z);
        });
    }

    public record Observation(Support support, boolean swimming, boolean seated, double feet, double aboveGround,
            long relocations, double x, double z) {}

    public record Support(Kind kind, String colliderId, com.ssafy.ontop.world.jumpmap.JumpCourse.Collider course) {
        public static final Support NONE = new Support(Kind.NONE, null, null);

        public enum Kind { NONE, COURSE, TERRAIN, STRUCTURE }
    }

    /** 서버 진단 전용. 사용자별 마지막 복구 한 건만 메모리에 유지하며 WS에는 노출하지 않는다. */
    public Recovery lastRecovery(String id) { return call(() -> actors.get(id).recovery); }

    public record Recovery(String reason, long tick, long seq, long simulationNanos,
            double fromX, double fromY, double fromZ, double toX, double toY, double toZ,
            double previousSafeX, double previousSafeY, double previousSafeZ, double terrainHeight,
            boolean grounded, boolean swimming, double verticalVelocity) {}

    /** 서버 몸체의 현재 좌표로 매 tick 생성하며 클라이언트 입력 순번은 변경하지 않는다. */
    private MoveInput followInput(Actor follower, Actor target) {
        if (target != null && !target.seated) {
            Vector3f own = follower.body.getPhysicsLocation(null);
            Vector3f other = target.body.getPhysicsLocation(null);
            double dx = other.x - own.x;
            double dz = other.z - own.z;
            double distance = Math.hypot(dx, dz);
            // Bullet 좌표는 float다. 2.2m의 표현 오차(수 µm)로 경계에서 한 걸음 더 나가지 않는다.
            if (distance > 2.2 + 0.00001 && distance <= 24 && Math.abs(other.y - own.y) <= 3.5) {
                boolean run = distance > 5;
                double speed = swimming(own) ? scene.data.path("swimming").path(run ? "fastSpeed" : "speed").asDouble()
                        : number(run ? "runSpeed" : "walkSpeed");
                double fraction = Math.min(1, (distance - 2.2) / (speed * DT));
                return new MoveInput(1, dx / distance * fraction, dz / distance * fraction, run, false);
            }
        }
        return new MoveInput(1, 0, 0, false, false);
    }

    private boolean swimming(Vector3f p) {
        JsonNode lake = scene.data.path("lake");
        double r =
                Math.hypot(
                        (p.x - lake.path("x").asDouble()) / lake.path("radiusX").asDouble(),
                        (p.z - lake.path("z").asDouble()) / lake.path("radiusZ").asDouble());
        double depth = lake.path("surfaceY").asDouble() - scene.groundHeight(p.x, p.z);
        return r < 1
                && depth > scene.data.path("swimming").path("depthThreshold").asDouble()
                && p.y < lake.path("surfaceY").asDouble() + 0.4;
    }

    private boolean isTower(Vector3f p) {
        JsonNode t = scene.data.path("tower");
        double radius = Math.hypot(p.x - t.path("x").asDouble(), p.z - t.path("z").asDouble());
        double foot = p.y - number("halfHeight") - number("radius") - number("offset");
        if (radius > t.path("outer").asDouble() + .08) {
            return false;
        }
        double offset = t.path("surfaceOffset").asDouble(.12);
        if (Math.abs(foot - t.path("topY").asDouble(t.path("height").asDouble() + offset)) < .25) {
            return true;
        }
        if (radius < t.path("inner").asDouble() - .08) {
            return false;
        }
        double angle =
                (Math.atan2(p.z - t.path("z").asDouble(), p.x - t.path("x").asDouble())
                                + Math.PI * 2)
                        % (Math.PI * 2);
        double rise = t.path("height").asDouble() / t.path("turns").asDouble();
        double base = offset + angle / (Math.PI * 2) * rise;
        long turn = Math.round((foot - base) / rise);
        return turn >= 0
                && turn < t.path("turns").asInt()
                && Math.abs(foot - base - turn * rise) < .25;
    }

    public Snapshot snapshot(String id) {
        return call(() -> snapshotNow(id));
    }

    private Snapshot snapshotNow(String id) {
        Actor a = actors.get(id);
        Vector3f p = a.body.getPhysicsLocation(null);
        Motion motion = a.motion;
        var grace = graceOf(a);
        if (tunedMovement || grace != null) motion = new Motion(motion.epoch(), motion.tick(), motion.appliedInputSeq(),
                motion.inputAgeMs(), motion.velocityY(), motion.grounded(), motion.inputActive(), motion.authority(),
                tunedMovement ? "PARK_V1" : null, a.followSteering, a.correctionReason, grace, motion.movingPad());
        return new Snapshot(a.seq, p.x, p.y, p.z, a.yaw, a.moving, a.running, a.swimming, motion,
                a.interiorExitReady);
    }

    /** Trusted server relocation, never exposed as a client coordinate command. */
    public void place(String id, double x, double y, double z) {
        call(
                () -> {
                    placeNow(id, x, y, z);
                    return null;
                });
    }

    /**
     * 이미 시설에 묶인 사람의 좌석만 옮긴다(움직이는 오리배). 순간 이동이 아니므로 이동 epoch를 바꾸지 않는다.
     * 묶여 있지 않으면 false.
     */
    public boolean moveSeated(String id, double x, double y, double z, double yaw) {
        return call(() -> {
            Actor actor = actors.get(id);
            if (actor == null || !actor.seated) {
                return false;
            }
            actor.body.warp(new Vector3f((float) x, (float) y, (float) z));
            actor.body.setLinearVelocity(Vector3f.ZERO);
            actor.yaw = yaw;
            return true;
        });
    }

    /** 시설 이용 자세는 충돌 계산에서 분리하고, 이전 이동 입력을 폐기한다. */
    public void hold(String id, double x, double y, double z, double yaw) {
        call(() -> {
            releaseCarryNow(id);
            Actor actor = actors.get(id);
            stopNow(id);
            if (!actor.seated) {
                if (!actor.clientControlled) space.removeCollisionObject(actor.body);
                actor.clientControlled = false;
                actor.positionValidator = null;
                actor.seated = true;
            }
            actor.relocations++;
            actor.body.warp(new Vector3f((float) x, (float) y, (float) z));
            actor.body.setLinearVelocity(Vector3f.ZERO);
            actor.yaw = yaw;
            actor.swimming = false;
            resetMotion(actor);
            actor.airborne = false;
            return null;
        });
    }

    /** 관계는 서버 물리와 같은 수명으로 관리해 채널 이동·접속 종료 때 함께 정리한다. */
    public record Carry(String carryId, String partnerId, String role) { }

    public Carry carryState(String id) {
        return call(() -> carryStateNow(id));
    }

    public Map<String, Carry> carryStates() {
        return call(() -> {
            Map<String, Carry> result = new HashMap<>();
            for (String id : actors.keySet()) {
                Carry carry = carryStateNow(id);
                if (carry != null) { result.put(id, carry); }
            }
            return Map.copyOf(result);
        });
    }

    private Carry carryStateNow(String id) {
        Actor actor = actors.get(id);
        if (actor == null) { return null; }
        if (actor.carriedBy != null) { return new Carry(actor.carryId, actor.carriedBy, "CARRIED"); }
        if (actor.throwTicks > 0) { return new Carry(actor.carryId, actor.throwerId, "THROWN"); }
        Actor target = actors.get(actor.carryingId);
        return target == null ? null : new Carry(target.carryId, actor.carryingId, "CARRIER");
    }

    public boolean pickup(String carrierId, String targetId) {
        return call(() -> {
            Actor carrier = actors.get(carrierId), target = actors.get(targetId);
            if (carrier == null || target == null || carrierId.equals(targetId)
                    || carryState(carrierId) != null || carryState(targetId) != null
                    || physicsTick < carrier.carryReadyTick || physicsTick < target.carryReadyTick) { return false; }
            Vector3f origin = carrier.body.getPhysicsLocation(null);
            Vector3f destination = target.body.getPhysicsLocation(null);
            // 시야는 운반자, 들어 올릴 공간은 피운반자에게 보이는 발판으로 검사한다.
            prepareCourseAt(carrier, origin);
            if (space.rayTest(origin, destination).stream()
                    .anyMatch(hit -> hit.getCollisionObject().getCollisionGroup() == 2)) { return false; }
            Vector3f lifted = origin.add(0, CARRY_HEIGHT, 0);
            prepareCourseAt(target, lifted);
            if (!canOccupy(lifted)) { return false; }
            target.carrySafe = target.body.getPhysicsLocation(null).clone();
            hold(targetId, lifted.x, lifted.y, lifted.z, carrier.yaw);
            target.carriedBy = carrierId;
            carrier.carryingId = targetId;
            target.carryId = java.util.UUID.randomUUID().toString();
            return true;
        });
    }

    public boolean throwCarried(String carrierId, String carryId, double dx, double dy, double dz) {
        return call(() -> {
            Actor carrier = actors.get(carrierId);
            Actor target = carrier == null ? null : actors.get(carrier.carryingId);
            if (target == null || !carryId.equals(target.carryId)) { return false; }
            carrier.carryingId = null;
            target.carriedBy = null;
            target.throwerId = carrierId;
            target.seated = false;
            target.throwTicks = MAX_THROW_TICKS;
            target.throwX = dx * THROW_SPEED;
            target.throwZ = dz * THROW_SPEED;
            target.carryReadyTick = physicsTick + CARRY_COOLDOWN_TICKS;
            carrier.carryReadyTick = physicsTick + CARRY_COOLDOWN_TICKS;
            space.addCollisionObject(target.body);
            target.body.setGravity(-number("gravity"));
            // 기본 카메라가 아래를 향해도 짧은 낙하가 아닌 포물선으로 출발한다.
            // 위/아래 시선은 체공 높이를 조절하고 수평 방향은 그대로 유지한다.
            target.body.jump(new Vector3f(0, (float) (THROW_LIFT + dy * THROW_AIM_LIFT), 0));
            target.airborne = true;
            resetMotion(target);
            return true;
        });
    }

    public void pruneCarries(java.util.Set<String> unavailable) {
        call(() -> {
            unavailable.forEach(this::releaseCarryNow);
            return null;
        });
    }

    public void releaseCarry(String id) {
        call(() -> { releaseCarryNow(id); return null; });
    }

    private void releaseCarryNow(String id) {
        for (var entry : actors.entrySet()) {
            Actor target = entry.getValue();
            if (entry.getKey().equals(id) && target.throwTicks > 0) {
                target.throwTicks = 0;
                target.throwX = target.throwZ = 0;
                stopNow(id);
                resetMotion(target);
            }
            if (target.carriedBy == null || !(entry.getKey().equals(id) || target.carriedBy.equals(id))) { continue; }
            Actor carrier = actors.get(target.carriedBy);
            if (carrier != null) { carrier.carryingId = null; }
            Vector3f origin = carrier == null ? target.body.getPhysicsLocation(null).add(0, -CARRY_HEIGHT, 0)
                    : carrier.body.getPhysicsLocation(null);
            Vector3f exit = carryExit(origin, target);
            target.carriedBy = null;
            target.carryReadyTick = physicsTick + CARRY_COOLDOWN_TICKS;
            target.body.warp(exit);
            target.seated = false;
            space.addCollisionObject(target.body);
            stopNow(entry.getKey());
            resetMotion(target);
        }
    }

    public boolean snowPileInReach(String userId, String pileId) {
        return call(() -> {
            Actor actor = actors.get(userId);
            if (actor == null) { return false; }
            Vector3f p = actor.body.getPhysicsLocation(null);
            for (JsonNode pile : scene.data.path("winterSnowPiles")) {
                if (pile.path("id").asText().equals(pileId)) {
                    double centerY = scene.groundHeight(p.x, p.z) + number("halfHeight") + number("radius")
                            + number("offset");
                    return Math.hypot(p.x - pile.path("x").asDouble(), p.z - pile.path("z").asDouble())
                            <= pile.path("radius").asDouble() && Math.abs(p.y - centerY) <= .65;
                }
            }
            return false;
        });
    }

    /** 눈덩이 포물선과 정적 구조물의 첫 충돌 거리를 반환한다. */
    public double snowballDistance(double x, double y, double z, double yaw) {
        return call(() -> {
            Vector3f previous = new Vector3f((float) x, (float) (y + .35), (float) z);
            for (int i = 1; i <= 32; i++) {
                double distance = i * .5;
                Vector3f next = new Vector3f((float) (x + Math.sin(yaw) * distance),
                        (float) (y + .35 + com.ssafy.ontop.world.winter.SnowballService.ARC_HEIGHT
                                * Math.sin(Math.PI * distance / 16)),
                        (float) (z + Math.cos(yaw) * distance));
                double fraction = space.rayTest(previous, next).stream()
                        .filter(hit -> hit.getCollisionObject().getCollisionGroup() == 2)
                        .mapToDouble(hit -> hit.getHitFraction()).min().orElse(1);
                if (fraction < 1) {
                    return distance - .5 + fraction * .5;
                }
                previous = next;
            }
            return 16.0;
        });
    }

    private boolean canOccupy(Vector3f center) {
        standProbe.setPhysicsLocation(center);
        boolean[] blocked = {false};
        space.contactTest(standProbe, event -> {
            var other = event.getObjectA() == standProbe ? event.getObjectB() : event.getObjectA();
            if (other.getCollisionGroup() == 2 && event.getDistance1() < -STAND_PENETRATION_TOLERANCE) { blocked[0] = true; }
        });
        return !blocked[0];
    }

    private Vector3f carryExit(Vector3f origin, Actor target) {
        // 내려설 위치에서 피운반자의 발판 상태를 적용한 뒤 지지면을 찾는다.
        prepareCourseAt(target, origin);
        if (canStand(origin.x, origin.y, origin.z)) { return origin; }
        Vector3f safe = target.carrySafe;
        if (safe != null && safe.distanceSquared(origin) <= 16 && canStand(safe.x, safe.y, safe.z)) {
            return safe.clone();
        }
        // 탐색은 해제 순간에만 한다. 걷던 높이의 가까운 지지면을 우선해 다른 층으로 옮기지 않는다.
        Vector3f nearby = nearbyStand(origin);
        if (nearby != null) { return nearby; }
        if (canOccupy(origin)) { return origin; }
        Vector3f below = localGroundSupport(origin.x, origin.z);
        if (below != null) { return below; }
        // 지형이 바뀌어 근처에 착지점이 없는 예외에도, 운반 중 마지막으로 검증한 위치만 사용한다.
        if (safe != null && canStand(safe.x, safe.y, safe.z)) { return safe.clone(); }
        return validatedFallback(target, (float) scene.data.path("world").path("halfSize").asDouble() - 1);
    }

    /** 하차 전 캡슐 관통과 발밑 지지면을 검사한다. */
    public boolean canStand(double x, double y, double z) {
        return call(() -> {
            var center = new Vector3f((float) x, (float) y, (float) z);
            var probe = standProbe;
            probe.setPhysicsLocation(center);
            boolean[] blocked = {false};
            space.contactTest(probe, event -> {
                if (event.getDistance1() < -STAND_PENETRATION_TOLERANCE) {
                    blocked[0] = true;
                }
            });
            float depth = number("halfHeight") + number("radius") + 0.17f;
            return scene.policy.allowsSupport(center, this::activeShape) && !blocked[0] && space.rayTest(center, center.add(0, -depth, 0)).stream()
                    .anyMatch(hit -> hit.getCollisionObject().getCollisionGroup() == 2);
        });
    }

    private void placeNow(String id, double x, double y, double z) {
        Actor a = actors.get(id);
        a.relocations++;
        a.courseRide = false;
        stop(id);
        a.body.warp(new Vector3f((float) x, (float) y, (float) z));
        Vector3f position = a.body.getPhysicsLocation(null);
        correctExclusion(a, position, scene.policy.slide(position, this::activeShape), null);
        a.body.setLinearVelocity(Vector3f.ZERO);
        a.positionValidator = null;
        resetMotion(a);
    }

    private void resetMotion(Actor actor) {
        actor.motionEpoch = clientPositions ? POSITION_EPOCHS.incrementAndGet() : actor.motionEpoch + 1;
        actor.motion = new Motion(actor.motionEpoch, physicsTick, actor.seq, 250, 0, false, false,
                actor.clientControlled ? "CLIENT_VALIDATED" : null);
        actor.positionValidator = null;
        actor.reportedJumpSpeed = 0;
        // 순간 이동·착석·epoch 변경은 남은 코요테·버퍼 창을 지운다.
        actor.jumpRequestTick = -1;
        actor.courseRidePreviousEpoch = -1;
        actor.lastGroundedTick = Long.MIN_VALUE / 2;
        actor.leftByJump = false;
        actor.coyoteUsed = false;
        actor.followSteering = null; actor.correctionReason = null;
        if (actor.clientControlled) {
            actor.receivedAt = clock.getAsLong();
            actor.reportStarted = false;
        }
    }

    private float number(String key) {
        if (tunedMovement) {
            if (key.equals("walkSpeed")) return 6f;
            if (key.equals("runSpeed")) return 8f;
            if (key.equals("gravity")) return -30f;
            if (key.equals("maxFallSpeed")) return -78.4f;
            if (key.equals("jumpSpeed")) return 8f;
        }
        return (float) movement.path(key).asDouble();
    }

    @Override
    public void close() {
        try {
            call(
                    () -> {
                        space.destroy();
                        actors.clear();
                        chairs.clear();
                        standProbe = null;
                        return null;
                    });
        } finally {
            executor.shutdown();
        }
    }

    public record Snapshot(
            long lastInputSeq,
            double x,
            double y,
            double z,
            double yaw,
            boolean moving,
            boolean running,
            boolean swimming, Motion motion, boolean interiorExitReady) {
        public Snapshot(long seq, double x, double y, double z, double yaw,
                boolean moving, boolean running, boolean swimming, Motion motion) {
            this(seq, x, y, z, yaw, moving, running, swimming, motion, false);
        }
        public Snapshot(long seq, double x, double y, double z, double yaw,
                boolean moving, boolean running, boolean swimming) {
            this(seq, x, y, z, yaw, moving, running, swimming, null);
        }
    }

    /** Receipt seq stays backward compatible; this seq describes the position after a physics step. */
    public record Motion(long epoch, long tick, long appliedInputSeq, double inputAgeMs,
            double velocityY, boolean grounded, boolean inputActive,
            @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
            String authority,
            @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
            String profile,
            @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
            Steering steering,
            @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
            String correctionReason,
            @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
            JumpGrace jumpGrace,
            @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
            MovingPad movingPad) {
        public Motion(long epoch, long tick, long appliedInputSeq, double inputAgeMs, double velocityY, boolean grounded,
                boolean inputActive, String authority, String profile, Steering steering, String correctionReason) {
            this(epoch, tick, appliedInputSeq, inputAgeMs, velocityY, grounded, inputActive, authority,
                    profile, steering, correctionReason, null, null);
        }
        public Motion(long epoch, long tick, long appliedInputSeq, double inputAgeMs, double velocityY,
                boolean grounded, boolean inputActive, String authority, String profile) {
            this(epoch, tick, appliedInputSeq, inputAgeMs, velocityY, grounded, inputActive, authority, profile, null, null);
        }
        public Motion(long epoch, long tick, long appliedInputSeq, double inputAgeMs, double velocityY,
                boolean grounded, boolean inputActive, String authority) {
            this(epoch, tick, appliedInputSeq, inputAgeMs, velocityY, grounded, inputActive, authority, null);
        }
        public Motion(long epoch, long tick, long appliedInputSeq, double inputAgeMs, double velocityY,
                boolean grounded, boolean inputActive) {
            this(epoch, tick, appliedInputSeq, inputAgeMs, velocityY, grounded, inputActive, null);
        }
    }

    public record MovingPad(int block,
            @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
            Double dipStartedAt) {}

    public record Steering(double dx, double dz, boolean run, double targetX, double targetZ) {}

    private static final class Actor {
        final String id;
        String carriedBy, carryingId, carryId, throwerId;
        Vector3f carrySafe;
        int throwTicks;
        long carryReadyTick;
        double throwX, throwZ;
        final PhysicsCharacter body;
        final int slot;
        final Vector3f lastSafe;
        MoveInput input;
        long seq;
        long receivedAt;
        long motionEpoch;
        int vehicleSpeed;
        final Vector3f beforeStepPosition = new Vector3f();
        Motion motion = new Motion(0, 0, 0, 250, 0, false, false);
        double yaw = Math.PI;
        boolean moving, running, swimming, jumpQueued, seated, airborne;
        boolean interiorExitReady;
        double climbTargetY;
        Recovery recovery;
        double reportedJumpSpeed;
        boolean clientControlled, positionDisabled, reportStarted, positionReportedEver, courseRide;
        long courseRidePreviousEpoch = -1, courseRideHandoffTick;
        // 서버 순간 이동(복구·배치·착석·시설) 횟수. 점프맵은 진행 중 변화를 RESET으로 본다.
        long relocations;
        // v2 점프 보조(점프맵 활성 채널). 요청 틱(-1 없음), 마지막 접지 틱, 떠난 이유, 코요테 사용 여부, 떠나온 바닥 점프 속도.
        long jumpRequestTick = -1, lastGroundedTick = Long.MIN_VALUE / 2;
        boolean leftByJump, coyoteUsed;
        double groundJumpSpeed = 8;
        ClientPositionValidator positionValidator;
        Steering followSteering;
        String correctionReason;

        Actor(String id, PhysicsCharacter body, int slot, Vector3f spawn) {
            this.id = id;
            this.body = body;
            this.slot = slot;
            lastSafe = spawn;
        }
    }
}
