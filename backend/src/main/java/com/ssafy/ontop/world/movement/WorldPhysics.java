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
    /** 측정한 ghost sweep 관통 시작 속도(약 27m/s)의 절반 이하. */
    private static final double FAST_FALL_SWEEP = 12;
    private ParkScene scene;
    private final java.util.function.Supplier<ParkScene> sceneSource;
    private PhysicsSpace space;
    private com.jme3.bullet.objects.PhysicsGhostObject standProbe;
    private final Map<String, Actor> actors = new HashMap<>();
    private final Map<String, Chair> chairs = new HashMap<>();
    private static final java.util.regex.Pattern CHAIR = java.util.regex.Pattern.compile("(.+)-chair-([0-3])");
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
            JumpCourseColliders.addTo(space, course);
        }
        positionCollision = new PositionCollision(scene, space, this::activeShape);
    }

    /** 승인된 채널별 앵커 설정만 받는다. 정적 맵의 의자 몸체를 재사용한다. */
    public Map<String, Snapshot> chairCounts(Map<String, Integer> counts) {
        var copy = Map.copyOf(counts);
        if (copy.values().stream().anyMatch(count -> count < 2 || count > 4)) {
            throw new IllegalArgumentException("의자 수는 2~4개입니다.");
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
        actors.put(id, new Actor(body, slot, scene.spawn(slot)));
        actors.get(id).yaw = scene.spawnYaw();
        Actor actor = actors.get(id);
        if (clientPositions && !specialMovement(actor.body.getPhysicsLocation(null))) {
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
        Actor actor = actors.remove(id);
        if (actor != null && !actor.seated && !actor.clientControlled) {
            space.removeCollisionObject(actor.body);
        }
    }

    public boolean input(String id, MoveInput input, long now) {
        return call(() -> inputNow(id, input, now));
    }

    /** 물리 tick 전 입력과 입력 만료 뒤의 공중 상태도 활동 중으로 판정한다. */
    public boolean hasMovementActivity(String id, long now) {
        return call(() -> {
            Actor actor = actors.get(id);
            return actor != null && (actor.airborne || actor.jumpQueued || actor.jumpRequestTick >= 0 || (actor.clientControlled && actor.moving
                    && now >= actor.receivedAt && now - actor.receivedAt <= (tunedMovement ? 2_000_000_000L : 500_000_000L)) || (inputActive(actor, now)
                    && (actor.input.dx() != 0 || actor.input.dz() != 0 || actor.input.jump())));
        });
    }

    private static boolean inputActive(Actor actor, long now) {
        return actor.input != null && now >= actor.receivedAt && now - actor.receivedAt <= 250_000_000L;
    }

    private boolean inputNow(String id, MoveInput input, long now) {
        Actor actor = actors.get(id);
        if (actor.clientControlled) {
            // An already-open old client only knows WORLD_MOVE. Keep it usable during rollout.
            // Once position reporting starts, delayed directional inputs must never switch authority.
            if (actor.positionReportedEver) return false;
            actor.positionDisabled = true;
            serverControl(actor);
        }
        if (input.seq() <= actor.seq) {
            return false;
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
            actor.climbTargetY = 0;
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
                    stepNow(now, seated, following);
                    return null;
                });
    }

    private void stepNow(long now, java.util.Set<String> seated, java.util.Map<String, String> following) {
        physicsTick++;
        for (var entry : actors.entrySet()) {
            Actor a = entry.getValue();
            a.beforeStepY = a.body.getPhysicsLocation(null).y;
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
            if (a.clientControlled && (following.containsKey(entry.getKey()) || specialMovement(a.body.getPhysicsLocation(null)))) {
                serverControl(a);
            }
            if (a.clientControlled) {
                // Catch-up steps can predate a report received just before this
                // batch. The physical tick timestamp is not an expiry clock.
                long freshnessNow = clock.getAsLong();
                boolean fresh = !a.reportStarted || freshnessNow >= a.receivedAt && freshnessNow - a.receivedAt <= (tunedMovement ? 2_000_000_000L : 500_000_000L);
                if (!fresh) {
                    log.info("로컬 좌표 검증 복귀 reason=REPORT_EXPIRED seq={}", a.seq);
                    a.positionDisabled = true;
                    serverControl(a);
                }
            }
            if (a.clientControlled) {
                // Correct only a server-approved position, never a client's claimed large move.
                anticipateExclusion(a, freshnessTime());
                a.motion = new Motion(a.motionEpoch, physicsTick, a.seq, 0, a.motion.velocityY(),
                        positionCollision.supported(pose(a)), true, "CLIENT_VALIDATED");
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
            a.swimming = swimming(position);
            float speed =
                    a.swimming
                            ? (float)
                                    scene.data
                                            .path("swimming")
                                            .path(active && input.run() ? "fastSpeed" : "speed")
                                            .asDouble()
                            : number(active && input.run() ? "runSpeed" : "walkSpeed");
            double dx = active ? input.dx() : 0, dz = active ? input.dz() : 0;
            if (course != null) {
                // 기본 ghost sweep은 겹친 몸체만 검사해 얇은 발판을 약 27m/s 이상 낙하에서 지나칠 수 있다.
                // 코스 활성 채널에서 빠르게 떨어지는 틱만 world sweep으로 경로 전체를 검사한다.
                // 걷기·계단·벽·일반 점프는 기존 ghost sweep 그대로다.
                a.body.setSweepTest(a.motion.velocityY() >= -FAST_FALL_SWEEP);
            }
            a.body.setWalkDirection(
                    new Vector3f((float) dx * speed * DT, 0, (float) dz * speed * DT));
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
                    applyJumpGrace(a, position);
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
            a.moving = active && (dx != 0 || dz != 0);
            a.running = active && input.run();
        }
        space.update(DT, 0);
        for (var entry : actors.entrySet()) {
            Actor a = entry.getValue();
            if (a.seated || a.clientControlled) { continue; }
            Vector3f position = a.body.getPhysicsLocation(null);
            correctExclusion(a, position, scene.policy.slide(position, this::activeShape));
            position = a.body.getPhysicsLocation(null);
            boolean supported = a.body.onGround() && scene.policy.allowsSupport(position, this::activeShape);
            a.motion = new Motion(a.motionEpoch, physicsTick, now >= a.receivedAt ? a.seq : a.motion.appliedInputSeq(),
                    Math.min(250, Math.max(0, (now - a.receivedAt) / 1_000_000.0)),
                    supported ? 0 : (position.y - a.beforeStepY) / DT, supported, inputActive(a, now));
            float limit =
                    (float)
                                    (scene.data.path("world").path("halfSize").asDouble()
                                            - scene.data
                                                    .path("world")
                                                    .path("boundaryHalfDepth")
                                                    .asDouble())
                            - number("radius")
                            - number("offset");
            if (!Vector3f.isValidVector(position)) {
                recover(a, position, validatedFallback(a, limit), "INVALID_POSITION", now);
            } else if (position.y < scene.groundHeight(position.x, position.z)
                    + number("halfHeight") + number("radius") - .35) {
                float x = Math.max(-limit, Math.min(limit, position.x));
                float z = Math.max(-limit, Math.min(limit, position.z));
                Vector3f support = localGroundSupport(x, z);
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
            if (clientPositions && !a.positionDisabled
                    && !following.containsKey(entry.getKey()) && !specialMovement(a.body.getPhysicsLocation(null))
                    && supported) {
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

    private void applyJumpGrace(Actor a, Vector3f position) {
        if (a.jumpRequestTick >= 0 && physicsTick - a.jumpRequestTick > JUMP_BUFFER_TICKS) a.jumpRequestTick = -1;
        if (a.jumpRequestTick < 0) return;
        boolean grounded = a.body.onGround() && scene.policy.allowsSupport(position, this::activeShape);
        boolean coyote = !grounded && !a.leftByJump && !a.coyoteUsed && physicsTick - a.lastGroundedTick <= COYOTE_TICKS;
        if (!grounded && !coyote) return;
        // 코요테는 떠나온 바닥의 점프 속도를 쓴다.
        a.body.setJumpSpeed((float) (grounded ? surfaceJumpSpeed(position) : a.groundJumpSpeed));
        a.body.jump();
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
        correctExclusion(actor, current, projected);
    }

    private boolean activeShape(String id) {
        Chair chair = chairs.get(id);
        return chair == null || chair.active;
    }

    private void correctExclusion(Actor actor, Vector3f from, Vector3f target) {
        if (actor.seated || from.distanceSquared(target) < 1e-10f) return;
        float boundary = (float) scene.data.path("world").path("halfSize").asDouble()
                - (float) scene.data.path("world").path("boundaryHalfDepth").asDouble() - number("radius") - number("offset");
        if (Math.abs(target.x) > boundary || Math.abs(target.z) > boundary
                || scene.policy.slide(target, this::activeShape).distanceSquared(target) > 1e-8
                || !positionCollision.correctionClear(from, target)) {
            target = validatedFallback(actor, boundary);
        }
        float vertical = (float) Math.min(0, actor.motion.velocityY());
        actor.body.warp(target);
        actor.body.setLinearVelocity(new Vector3f(0, vertical, 0));
        actor.airborne = true;
        resetMotion(actor);
        actor.motion = new Motion(actor.motionEpoch, physicsTick, actor.seq, 0, vertical, false, true,
                actor.clientControlled ? "CLIENT_VALIDATED" : null);
        log.debug("공원 차단영역 복구 tick={} map={} reason=NO_CLIMB", physicsTick, scene.version());
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
     * 이전 연결의 위치 검증 실패 기록도 지워 새 연결이 착지 후 다시 위치 보고 방식으로 돌아갈 수 있게 한다.
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

    public Snapshot serverMovement(String id) {
        return call(() -> { serverControl(actors.get(id)); return snapshotNow(id); });
    }
    public Snapshot disablePosition(String id, long epoch) {
        return call(() -> {
            Actor actor = actors.get(id);
            if (actor.clientControlled && actor.motionEpoch == epoch) {
                actor.positionDisabled = true;
                serverControl(actor);
            }
            return snapshotNow(id);
        });
    }

    /** Local opt-in only. Validation, native body and official snapshot are changed on one owner thread. */
    public Snapshot report(String id, ClientPositionValidator.Candidate candidate, long now) {
        return call(() -> {
            if (!clientPositions) throw new IllegalStateException("위치 보고 모드가 비활성화돼 있습니다.");
            Actor a = actors.get(id);
            if (!a.clientControlled || a.seated) return snapshotNow(id);
            if (candidate.epoch() != a.motionEpoch || candidate.seq() <= a.seq) return snapshotNow(id);
            anticipateExclusion(a, now);
            if (candidate.epoch() != a.motionEpoch) return snapshotNow(id);
            if (a.positionValidator == null) {
                double boundary = scene.data.path("world").path("halfSize").asDouble()
                        - scene.data.path("world").path("boundaryHalfDepth").asDouble() - number("radius") - number("offset");
                a.positionValidator = new ClientPositionValidator(pose(a), a.motionEpoch, boundary, positionCollision, clock, tunedMovement);
                a.positionValidator.jumpGrace(jumpGrace());
            }
            var before = pose(a);
            var result = a.positionValidator.accept(candidate);
            if (!result.accepted()) {
                log.info("로컬 좌표 검증 복귀 reason={} seq={}", result.reason(), a.seq);
                // A rejection falls back for the connection's remaining life. Old reports
                // cannot keep advancing epochs or replenish a fresh validator's budget.
                a.positionDisabled = true;
                serverControl(a);
                return snapshotNow(id);
            }
            var p = result.approved();
            if (candidate.jump() && positionCollision.supported(before)) {
                a.reportedJumpSpeed = scene.policy.jumpSpeed(new Vector3f((float) before.x(), (float) before.y(), (float) before.z()), tunedMovement);
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
            a.motion = new Motion(a.motionEpoch, physicsTick, a.seq, 0, vy, !a.airborne, true, "CLIENT_VALIDATED");
            if (specialMovement(a.body.getPhysicsLocation(null))) serverControl(a);
            return snapshotNow(id);
        });
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

    private Vector3f validatedFallback(Actor actor, float limit) {
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
            return new Observation(support(id), actor.swimming, actor.seated, feet,
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
                return new MoveInput(1, dx / distance, dz / distance, distance > 5, false);
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
                tunedMovement ? "PARK_V1" : null, grace);
        return new Snapshot(a.seq, p.x, p.y, p.z, a.yaw, a.moving, a.running, a.swimming, motion);
    }

    /** Trusted server relocation, never exposed as a client coordinate command. */
    public void place(String id, double x, double y, double z) {
        call(
                () -> {
                    placeNow(id, x, y, z);
                    return null;
                });
    }

    /** 시설 이용 자세는 충돌 계산에서 분리하고, 이전 이동 입력을 폐기한다. */
    public void hold(String id, double x, double y, double z, double yaw) {
        call(() -> {
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

    /** 하차 전 캡슐 관통과 발밑 지지면을 검사한다. */
    public boolean canStand(double x, double y, double z) {
        return call(() -> {
            var center = new Vector3f((float) x, (float) y, (float) z);
            var probe = standProbe;
            probe.setPhysicsLocation(center);
            boolean[] blocked = {false};
            space.contactTest(probe, event -> {
                if (event.getDistance1() < -0.04f) {
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
        stop(id);
        a.body.warp(new Vector3f((float) x, (float) y, (float) z));
        correctExclusion(a, a.body.getPhysicsLocation(null), scene.policy.slide(a.body.getPhysicsLocation(null), this::activeShape));
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
        actor.lastGroundedTick = Long.MIN_VALUE / 2;
        actor.leftByJump = false;
        actor.coyoteUsed = false;
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
            boolean swimming, Motion motion) {
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
            JumpGrace jumpGrace) {
        public Motion(long epoch, long tick, long appliedInputSeq, double inputAgeMs, double velocityY,
                boolean grounded, boolean inputActive, String authority, String profile) {
            this(epoch, tick, appliedInputSeq, inputAgeMs, velocityY, grounded, inputActive, authority, profile, null);
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

    private static final class Actor {
        final PhysicsCharacter body;
        final int slot;
        final Vector3f lastSafe;
        MoveInput input;
        long seq;
        long receivedAt;
        long motionEpoch;
        double beforeStepY;
        Motion motion = new Motion(0, 0, 0, 250, 0, false, false);
        double yaw = Math.PI;
        boolean moving, running, swimming, jumpQueued, seated, airborne;
        double climbTargetY;
        Recovery recovery;
        double reportedJumpSpeed;
        boolean clientControlled, positionDisabled, reportStarted, positionReportedEver;
        // 서버 순간 이동(복구·배치·착석·시설) 횟수. 점프맵은 진행 중 변화를 RESET으로 본다.
        long relocations;
        // v2 점프 보조(점프맵 활성 채널). 요청 틱(-1 없음), 마지막 접지 틱, 떠난 이유, 코요테 사용 여부, 떠나온 바닥 점프 속도.
        long jumpRequestTick = -1, lastGroundedTick = Long.MIN_VALUE / 2;
        boolean leftByJump, coyoteUsed;
        double groundJumpSpeed = 8;
        ClientPositionValidator positionValidator;

        Actor(PhysicsCharacter body, int slot, Vector3f spawn) {
            this.body = body;
            this.slot = slot;
            lastSafe = spawn;
        }
    }
}
