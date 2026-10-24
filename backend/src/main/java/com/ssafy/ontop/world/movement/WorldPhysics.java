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
    public static final long STEP_NANOS = 1_000_000_000L / 30;
    private static final float DT = 1f / 30;
    private ParkScene scene;
    private PhysicsSpace space;
    private final Map<String, Actor> actors = new HashMap<>();
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
        scene = ParkScene.load();
        movement = scene.data.path("movement");
        space = new PhysicsSpace(PhysicsSpace.BroadphaseType.DBVT);
        space.setAccuracy(DT);
        space.setMaxSubSteps(0);
        for (ParkScene.Shape shape : scene.shapes) {
            var body = new PhysicsRigidBody(shape.shape(), 0);
            body.setPhysicsLocation(shape.center());
            body.setPhysicsRotation(shape.rotation());
            body.setCollisionGroup(2);
            body.setCollideWithGroups(1);
            space.addCollisionObject(body);
        }
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

    private boolean inputNow(String id, MoveInput input, long now) {
        Actor actor = actors.get(id);
        if (input.seq() <= actor.seq) {
            return false;
        }
        actor.seq = input.seq();
        actor.input = input;
        actor.receivedAt = now;
        actor.jumpQueued |= input.jump() && (actor.body.onGround() || actor.swimming);
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
        call(
                () -> {
                    stepNow(now, seated);
                    return null;
                });
    }

    private void stepNow(long now, java.util.Set<String> seated) {
        for (var entry : actors.entrySet()) {
            Actor a = entry.getValue();
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
            boolean active =
                    a.input != null && now >= a.receivedAt && now - a.receivedAt <= 250_000_000L;
            Vector3f position = a.body.getPhysicsLocation(null);
            a.swimming = swimming(position);
            float speed =
                    a.swimming
                            ? (float)
                                    scene.data
                                            .path("swimming")
                                            .path(active && a.input.run() ? "fastSpeed" : "speed")
                                            .asDouble()
                            : number(active && a.input.run() ? "runSpeed" : "walkSpeed");
            double dx = active ? a.input.dx() : 0, dz = active ? a.input.dz() : 0;
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
            a.jumpQueued = false;
            if (dx != 0 || dz != 0) {
                a.yaw = Math.atan2(dx, dz);
            }
            a.moving = active && (dx != 0 || dz != 0);
            a.running = active && a.input.run();
        }
        space.update(DT, 0);
        for (Actor a : actors.values()) {
            Vector3f position = a.body.getPhysicsLocation(null);
            float limit =
                    (float)
                                    (scene.data.path("world").path("halfSize").asDouble()
                                            - scene.data
                                                    .path("world")
                                                    .path("boundaryHalfDepth")
                                                    .asDouble())
                            - number("radius")
                            - number("offset");
            if (!Vector3f.isValidVector(position)
                    || position.y
                            < scene.groundHeight(position.x, position.z)
                                    + number("halfHeight")
                                    + number("radius")
                                    - .35) {
                a.body.warp(a.lastSafe);
                a.body.setLinearVelocity(Vector3f.ZERO);
                a.input = null;
                a.moving = false;
                a.running = false;
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
        }
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
        if (Math.abs(foot - t.path("height").asDouble() - .12) < .25) {
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
        double base = .12 + angle / (Math.PI * 2) * rise;
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
        return new Snapshot(a.seq, p.x, p.y, p.z, a.yaw, a.moving, a.running, a.swimming);
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
            return null;
        });
    }

    /** 하차 전 캡슐 관통과 발밑 지지면을 검사한다. */
    public boolean canStand(double x, double y, double z) {
        return call(() -> {
            var center = new Vector3f((float) x, (float) y, (float) z);
            var probe = new com.jme3.bullet.objects.PhysicsGhostObject(
                    new CapsuleCollisionShape(number("radius"), number("halfHeight") * 2, 1));
            probe.setCollisionGroup(1);
            probe.setCollideWithGroups(2);
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
            boolean swimming) {}

    private static final class Actor {
        final PhysicsCharacter body;
        final int slot;
        final Vector3f lastSafe;
        MoveInput input;
        long seq;
        long receivedAt;
        double yaw = Math.PI;
        boolean moving, running, swimming, jumpQueued, seated;
        double climbTargetY;

        Actor(PhysicsCharacter body, int slot, Vector3f spawn) {
            this.body = body;
            this.slot = slot;
            lastSafe = spawn;
        }
    }
}
