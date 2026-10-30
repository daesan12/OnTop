package com.ssafy.ontop.game.alkkagi.domain;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.dyn4j.dynamics.Body;
import org.dyn4j.geometry.Geometry;
import org.dyn4j.geometry.MassType;
import org.dyn4j.geometry.Vector2;
import org.dyn4j.world.World;

/** 한 경기의 소유 스레드에서만 호출한다. 발사 결과를 클라이언트로부터 받지 않는다. */
public final class AlkkagiMatch {
    private final AlkkagiSettings settings;
    private final World<Body> world = new World<>();
    private final Map<String, Piece> pieces = new LinkedHashMap<>();
    private final Map<String, Receipt> receipts = new LinkedHashMap<>();
    private final String gameId = UUID.randomUUID().toString();
    private String stage = "WAITING";
    private String reason;
    private Integer winner;
    private int turn;
    private int turnNumber = 1;
    private final int[] timeouts = new int[2];
    private long version;
    private long tick;
    private long simulationId;
    private long turnDeadline;
    private long matchDeadline;
    private int simulationSteps;
    private int stableSteps;

    public AlkkagiMatch(AlkkagiSettings settings) {
        this.settings = settings;
        world.setGravity(World.ZERO_GRAVITY);
        world.getSettings().setStepFrequency(settings.stepSeconds());
        // CCD의 이동 상한을 발사 검증값보다 충분히 크게 두고, 알별 bullet을 활성화한다.
        world.getSettings().setMaximumTranslation(2);
        for (int owner = 0; owner < 2; owner++) {
            int sign = owner == 0 ? 1 : -1;
            String[] back = {"車", "馬", "象", "士", "士", "象", "馬", "車"};
            double[] columns = {-4, -3, -2, -1, 1, 2, 3, 4};
            for (int i = 0; i < back.length; i++) {
                // 사용자 검수 기준: 작은 알은 왕을 거의 밀지 못한다. 원작 실측 질량은 아니다.
                boolean small = back[i].equals("士");
                add(owner, back[i], columns[i], sign * 4.2, small ? .24 : .32, small ? .8 : 3.2);
            }
            add(owner, owner == 0 ? "漢" : "楚", 0, sign * 3.2, 0.43, 19.2);
            add(owner, "包", -3, sign * 2.2, 0.32, 3.2);
            add(owner, "包", 3, sign * 2.2, 0.32, 3.2);
            for (int i = 0; i < 5; i++) {
                add(owner, owner == 0 ? "兵" : "卒", i * 2 - 4, sign * 1.2, 0.24, 0.8);
            }
        }
    }

    private void add(int owner, String type, double x, double y, double radius, double mass) {
        Body body = collisionBody(radius, mass, settings.restitution());
        body.translate(x, y);
        String id = "p" + pieces.size();
        pieces.put(id, new Piece(id, owner, type, radius, mass, body));
        world.addBody(body);
    }

    static Body collisionBody(double radius, double mass, double restitution) {
        Body body = new Body();
        var fixture = body.addFixture(Geometry.createCircle(radius));
        fixture.setDensity(mass / (Math.PI * radius * radius));
        fixture.setRestitution(restitution);
        fixture.setFriction(0.15);
        body.setMass(MassType.FIXED_ANGULAR_VELOCITY);
        body.setLinearDamping(0);
        body.setBullet(true);
        return body;
    }

    public void start(long now) {
        require(stage.equals("WAITING"), "ALREADY_STARTED");
        stage = "AIMING";
        turnDeadline = now + settings.turnMillis();
        matchDeadline = now + settings.matchMillis();
        version++;
    }

    public long shoot(int actor, Shot shot, long now) {
        require(actor == 0 || actor == 1, "PLAYER_REQUIRED");
        require(shot != null && shot.actionId() != null && shot.actionId().matches("[A-Za-z0-9-]{1,64}"),
                "INVALID_ACTION");
        require(gameId.equals(shot.gameId()), "STALE_GAME");
        String key = actor + ":" + shot.actionId();
        Receipt old = receipts.get(key);
        if (old != null) {
            require(old.shot().equals(shot), "ACTION_ID_CONFLICT");
            return old.version();
        }
        expire(now);
        require(stage.equals("AIMING"), "NOT_AIMING");
        require(actor == turn, "NOT_YOUR_TURN");
        require(shot.expectedVersion() == version, "STALE_VERSION");
        Piece piece = pieces.get(shot.pieceId());
        require(piece != null && piece.alive && piece.owner == actor, "NOT_YOUR_PIECE");
        require(Double.isFinite(shot.dx()) && Double.isFinite(shot.dy()) && Double.isFinite(shot.power())
                && shot.power() > 0 && shot.power() <= 1, "INVALID_SHOT");
        double length = Math.hypot(shot.dx(), shot.dy());
        require(Double.isFinite(length) && length >= 0.0001 && length <= 1.0001, "INVALID_DIRECTION");
        piece.body.applyImpulse(new Vector2(shot.dx() / length, shot.dy() / length)
                .multiply(launchImpulse(settings.maximumImpulse(), shot.power(), piece.mass)));
        timeouts[actor] = 0;
        stage = "SIMULATING";
        simulationId++;
        simulationSteps = 0;
        stableSteps = 0;
        version++;
        receipts.put(key, new Receipt(shot, version));
        // 로컬 검증에서도 장시간의 요청 이력을 무제한 보관하지 않는다.
        if (receipts.size() > 2048) {
            receipts.remove(receipts.keySet().iterator().next());
        }
        return version;
    }

    /** 출발 속도는 같게, 충격량·밀림 저항은 질량에 비례시킨 검수 모델. 원작 공식은 아니다. */
    static double launchImpulse(double referenceImpulse, double power, double mass) {
        return referenceImpulse * power * (mass / 0.8);
    }

    public void advance(long now) {
        expire(now);
        if (!stage.equals("SIMULATING")) {
            return;
        }
        for (Piece piece : pieces.values()) {
            if (!piece.alive) { continue; }
            decelerate(piece.body, settings);
        }
        world.step(1);
        tick++;
        simulationSteps++;
        boolean moving = false;
        for (Piece piece : pieces.values()) {
            if (!piece.alive) { continue; }
            Vector2 at = piece.body.getWorldCenter();
            if (!Double.isFinite(at.x) || !Double.isFinite(at.y)) {
                finish(null, "SIMULATION_INVALID");
                return;
            }
            // 임시 정책: 알 중심이 외곽을 넘으면 탈락. 최종 낙하 기준은 별도 합의한다.
            if (Math.abs(at.x) > settings.halfWidth() || Math.abs(at.y) > settings.halfHeight()) {
                piece.alive = false;
                world.removeBody(piece.body);
            } else if (piece.body.getLinearVelocity().getMagnitude() > settings.stopSpeed()) {
                moving = true;
            }
        }
        stableSteps = moving ? 0 : stableSteps + 1;
        if (stableSteps >= settings.settleSteps()) {
            for (Piece piece : pieces.values()) {
                piece.body.setLinearVelocity(0, 0);
            }
            resolve(now);
        } else if (simulationSteps >= settings.maximumSimulationSteps()) {
            finish(null, "SIMULATION_LIMIT");
        }
    }

    static void decelerate(Body body, AlkkagiSettings settings) {
        Vector2 velocity = body.getLinearVelocity();
        double speed = velocity.getMagnitude();
        double next = Math.max(0, speed - settings.deceleration() * settings.stepSeconds());
        body.setLinearVelocity(speed > 0 ? velocity.product(next / speed) : new Vector2());
    }

    private void expire(long now) {
        if (!stage.equals("AIMING")) { return; }
        if (now >= matchDeadline) {
            resolveByCount("MATCH_TIME_LIMIT");
        } else if (now >= turnDeadline) {
            timeouts[turn]++;
            if (timeouts[turn] >= 2) {
                finish(1 - turn, "AFK_FORFEIT");
            } else {
                nextTurn(now);
            }
        }
    }

    private void resolve(long now) {
        if (count(0) == 0 || count(1) == 0) {
            resolveByCount("PIECES_OUT");
        } else if (now >= matchDeadline) {
            resolveByCount("MATCH_TIME_LIMIT");
        } else {
            nextTurn(now);
        }
    }

    private int count(int owner) {
        return (int) pieces.values().stream().filter(p -> p.alive && p.owner == owner).count();
    }

    private void resolveByCount(String endReason) {
        finish(count(0) == count(1) ? null : count(0) > count(1) ? 0 : 1, endReason);
    }

    private void finish(Integer player, String endReason) {
        stage = "FINISHED";
        winner = player;
        reason = endReason;
        version++;
    }

    private void nextTurn(long now) {
        turn = 1 - turn;
        turnNumber++;
        turnDeadline = now + settings.turnMillis();
        stage = "AIMING";
        version++;
    }

    public Snapshot snapshot(long now) {
        List<PieceView> views = new ArrayList<>();
        for (Piece piece : pieces.values()) {
            Vector2 at = piece.body.getWorldCenter();
            Vector2 v = piece.body.getLinearVelocity();
            views.add(new PieceView(piece.id, piece.owner, piece.type, at.x, at.y, v.x, v.y,
                    piece.radius, piece.mass, piece.alive));
        }
        return new Snapshot(gameId, version, tick, simulationId, stage, turn, turnNumber,
                turnDeadline, matchDeadline, now, winner, reason, List.copyOf(views),
                List.of(timeouts[0], timeouts[1]), settings, true);
    }

    private static void require(boolean condition, String code) {
        if (!condition) { throw new IllegalArgumentException(code); }
    }

    public record Shot(String gameId, String actionId, long expectedVersion, String pieceId,
            double dx, double dy, double power) { }
    public record PieceView(String id, int owner, String type, double x, double y, double vx, double vy,
            double radius, double mass, boolean alive) { }
    public record Snapshot(String gameId, long version, long tick, long simulationId, String stage,
            int turn, int turnNumber, long turnDeadline, long matchDeadline, long serverNow,
            Integer winner, String endReason, List<PieceView> pieces, List<Integer> timeouts,
            AlkkagiSettings settings, boolean provisional) { }
    private record Receipt(Shot shot, long version) { }
    private static final class Piece {
        private final String id;
        private final int owner;
        private final String type;
        private final double radius;
        private final double mass;
        private final Body body;
        private boolean alive = true;

        private Piece(String id, int owner, String type, double radius, double mass, Body body) {
            this.id = id; this.owner = owner; this.type = type;
            this.radius = radius; this.mass = mass; this.body = body;
        }
    }
}
