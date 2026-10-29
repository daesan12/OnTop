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
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(WorldPhysics.class);
    private long physicsTick;
    public static final long STEP_NANOS = 1_000_000_000L / 30;
    private static final float DT = 1f / 30;
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
        this.sceneSource = sceneSource;
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
        if (actor != null && !actor.seated) {
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
            return actor != null && (actor.airborne || actor.jumpQueued || (inputActive(actor, now)
                    && (actor.input.dx() != 0 || actor.input.dz() != 0 || actor.input.jump())));
        });
    }

    private static boolean inputActive(Actor actor, long now) {
        return actor.input != null && now >= actor.receivedAt && now - actor.receivedAt <= 250_000_000L;
    }

    private boolean inputNow(String id, MoveInput input, long now) {
        Actor actor = actors.get(id);
        if (input.seq() <= actor.seq) {
            return false;
        }
        actor.seq = input.seq();
        actor.input = input;
        actor.receivedAt = now;
        boolean canJump = actor.body.onGround() || actor.swimming;
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
                    space.removeCollisionObject(a.body);
                    a.body.setLinearVelocity(Vector3f.ZERO);
                    a.seated = true;
                }
                continue;
            }
            if (a.seated) {
                a.seated = false;
                space.addCollisionObject(a.body);
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
                if (active && a.jumpQueued && a.body.onGround()) {
                    a.body.setJumpSpeed(
                            isTower(position)
                                    ? (float) scene.data.path("tower").path("jumpSpeed").asDouble()
                                    : number("jumpSpeed"));
                    a.body.jump();
                }
            }
            if (now >= a.receivedAt) { a.jumpQueued = false; }
            if (dx != 0 || dz != 0) {
                a.yaw = Math.atan2(dx, dz);
            }
            a.moving = active && (dx != 0 || dz != 0);
            a.running = active && input.run();
        }
        space.update(DT, 0);
        for (Actor a : actors.values()) {
            if (a.seated) { continue; }
            Vector3f position = a.body.getPhysicsLocation(null);
            a.motion = new Motion(a.motionEpoch, physicsTick, now >= a.receivedAt ? a.seq : a.motion.appliedInputSeq(),
                    Math.min(250, Math.max(0, (now - a.receivedAt) / 1_000_000.0)),
                    a.body.onGround() ? 0 : (position.y - a.beforeStepY) / DT, a.body.onGround(), inputActive(a, now));
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
                if (a.body.onGround()) {
                    a.lastSafe.set(x, position.y, z);
                }
            }
            a.airborne = !a.seated && !a.body.onGround();
        }
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
        return new Snapshot(a.seq, p.x, p.y, p.z, a.yaw, a.moving, a.running, a.swimming, a.motion);
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
                space.removeCollisionObject(actor.body);
                actor.seated = true;
            }
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
            return !blocked[0] && space.rayTest(center, center.add(0, -depth, 0)).stream()
                    .anyMatch(hit -> hit.getCollisionObject().getCollisionGroup() == 2);
        });
    }

    private void placeNow(String id, double x, double y, double z) {
        Actor a = actors.get(id);
        stop(id);
        a.body.warp(new Vector3f((float) x, (float) y, (float) z));
        a.body.setLinearVelocity(Vector3f.ZERO);
        resetMotion(a);
    }

    private void resetMotion(Actor actor) {
        actor.motion = new Motion(++actor.motionEpoch, physicsTick, actor.seq, 250, 0, false, false);
    }

    private float number(String key) {
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
            double velocityY, boolean grounded, boolean inputActive) {}

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

        Actor(PhysicsCharacter body, int slot, Vector3f spawn) {
            this.body = body;
            this.slot = slot;
            lastSafe = spawn;
        }
    }
}
