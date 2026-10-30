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
    private final AlkkagiPhysics physics;
    private final World<Body> world = new World<>();
    private final Map<String, Piece> pieces = new LinkedHashMap<>();
    private final Map<String, Receipt> receipts = new LinkedHashMap<>();
    private final AlkkagiInventory inventory = new AlkkagiInventory();
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
    private int shotsThisTurn;
    private boolean itemUsedThisTurn;
    private boolean extraShotActivated;
    private ItemEffect lastItemEffect;

    public AlkkagiMatch(AlkkagiSettings settings) {
        this(settings, AlkkagiPhysics.experimental());
    }

    AlkkagiMatch(AlkkagiSettings settings, AlkkagiPhysics physics) {
        this.settings = settings;
        this.physics = physics;
        world.setGravity(World.ZERO_GRAVITY);
        world.getSettings().setStepFrequency(settings.stepSeconds());
        // CCD의 이동 상한을 발사 검증값보다 충분히 크게 두고, 알별 bullet을 활성화한다.
        world.getSettings().setMaximumTranslation(2);
        // 경기의 stopSpeed/settleSteps만 정지 기준으로 사용한다.
        world.getSettings().setAtRestDetectionEnabled(false);
        for (int owner = 0; owner < 2; owner++) {
            int sign = owner == 0 ? 1 : -1;
            String[] back = {"車", "馬", "象", "士", "士", "象", "馬", "車"};
            double[] columns = {-4, -3, -2, -1, 1, 2, 3, 4};
            for (int i = 0; i < back.length; i++) {
                add(owner, back[i], columns[i], sign * 4.2);
            }
            add(owner, owner == 0 ? "漢" : "楚", 0, sign * 3.2);
            add(owner, "包", -3, sign * 2.2);
            add(owner, "包", 3, sign * 2.2);
            for (int i = 0; i < 5; i++) {
                add(owner, owner == 0 ? "兵" : "卒", i * 2 - 4, sign * 1.2);
            }
        }
    }

    private void add(int owner, String type, double x, double y) {
        var profile = physics.profile(type);
        double radius = profile.radius(), mass = profile.mass();
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
            require(old.command().equals(shot), "ACTION_ID_CONFLICT");
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
                .multiply(physics.launchImpulse(settings.maximumImpulse(), shot.power(), physics.profile(piece.type))));
        timeouts[actor] = 0;
        shotsThisTurn++;
        stage = "SIMULATING";
        simulationId++;
        simulationSteps = 0;
        stableSteps = 0;
        version++;
        remember(key, shot);
        return version;
    }

    private void remember(String key, Object command) {
        receipts.put(key, new Receipt(command, version));
        // 로컬 검증에서도 장시간의 요청 이력을 무제한 보관하지 않는다.
        if (receipts.size() > 2048) {
            receipts.remove(receipts.keySet().iterator().next());
        }
    }

    /** 신뢰된 서버 측 지급 경계. 클라이언트가 카드 종류를 지정하는 제품 API는 노출하지 않는다. */
    public void receiveCard(int actor, String type) {
        require(actor == 0 || actor == 1, "PLAYER_REQUIRED");
        require(!stage.equals("FINISHED"), "GAME_FINISHED");
        AlkkagiInventory.Type cardType;
        try { cardType = AlkkagiInventory.Type.valueOf(type); }
        catch (RuntimeException invalid) { throw new IllegalArgumentException("INVALID_CARD_TYPE"); }
        inventory.grant(actor, cardType);
        version++;
    }

    public long useItem(int actor, ItemUse input, long now) {
        require(actor == 0 || actor == 1, "PLAYER_REQUIRED");
        require(input != null && input.actionId() != null && input.actionId().matches("[A-Za-z0-9-]{1,64}"), "INVALID_ACTION");
        require(gameId.equals(input.gameId()), "STALE_GAME");
        String key = actor + ":" + input.actionId();
        var previous = receipts.get(key);
        if (previous != null) {
            require(previous.command().equals(input), "ACTION_ID_CONFLICT");
            return previous.version();
        }
        expire(now);
        require(stage.equals("AIMING"), "NOT_AIMING");
        require(actor == turn, "NOT_YOUR_TURN");
        require(input.expectedVersion() == version, "STALE_VERSION");
        require(!itemUsedThisTurn && shotsThisTurn == 0, "ITEM_ALREADY_USED_OR_SHOT");
        var card = inventory.requireCard(actor, input.cardId());
        var targets = input.targetPieceIds();
        if (card.type() == AlkkagiInventory.Type.SWAP) {
            require(targets != null && targets.size() == 2 && !targets.get(0).equals(targets.get(1)), "INVALID_TARGETS");
            var a = pieces.get(targets.get(0)); var b = pieces.get(targets.get(1));
            require(a != null && b != null && a.alive && b.alive && a.owner == actor && b.owner == actor, "NOT_YOUR_PIECE");
            var pa = a.body.getWorldCenter().copy(); var pb = b.body.getWorldCenter().copy();
            validateSwapPosition(a, pb, a, b); validateSwapPosition(b, pa, a, b);
            require(pa.distance(pb) >= a.radius + b.radius - 1e-9, "ITEM_OVERLAP");
            a.body.translate(pb.x - pa.x, pb.y - pa.y);
            b.body.translate(pa.x - pb.x, pa.y - pb.y);
            // 직접 위치를 바꾼 뒤 이전 접촉 제약을 다음 발사에 재사용하지 않는다.
            world.setUpdateRequired(true);
        } else if (card.type() == AlkkagiInventory.Type.EXTRA_SHOT) {
            require(targets != null && targets.isEmpty(), "INVALID_TARGETS");
            extraShotActivated = true;
        } else {
            throw new IllegalArgumentException("ITEM_POLICY_PENDING");
        }
        inventory.consume(actor, input.cardId());
        itemUsedThisTurn = true;
        version++;
        lastItemEffect = new ItemEffect(version, turnNumber, actor, card.type().name(), List.copyOf(targets));
        remember(key, input);
        return version;
    }

    private void validateSwapPosition(Piece moving, Vector2 destination, Piece a, Piece b) {
        require(Math.abs(destination.x) <= settings.halfWidth() && Math.abs(destination.y) <= settings.halfHeight(), "ITEM_OUTSIDE_BOARD");
        for (var other : pieces.values()) {
            if (other.alive && other != a && other != b) {
                require(destination.distance(other.body.getWorldCenter()) >= moving.radius + other.radius - 1e-9, "ITEM_OVERLAP");
            }
        }
    }

    public PrivateView privateView(int actor) {
        require(actor == 0 || actor == 1, "PLAYER_REQUIRED");
        return new PrivateView(gameId, version, inventory.cards(actor).stream()
                .map(card -> new CardView(card.id(), card.type().name())).toList());
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
        if (next < settings.stopSpeed()) next = 0;
        body.setLinearVelocity(speed > 0 ? velocity.product(next / speed) : new Vector2());
    }

    private void expire(long now) {
        if (!stage.equals("AIMING")) { return; }
        if (now >= matchDeadline) {
            resolveByCount("MATCH_TIME_LIMIT");
        } else if (now >= turnDeadline) {
            if (shotsThisTurn > 0) { nextTurn(now); return; }
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
        } else if (extraShotActivated && shotsThisTurn == 1 && now < turnDeadline) {
            stage = "AIMING";
            version++;
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
        shotsThisTurn = 0;
        itemUsedThisTurn = false;
        extraShotActivated = false;
        version++;
    }

    public Snapshot snapshot(long now) {
        List<PieceView> views = new ArrayList<>();
        for (Piece piece : pieces.values()) {
            Vector2 at = piece.body.getWorldCenter();
            Vector2 v = piece.body.getLinearVelocity();
            views.add(new PieceView(piece.id, piece.owner, piece.type, at.x, at.y, v.x, v.y,
                    piece.radius, piece.mass, piece.alive,
                    physics.maximumSpeed(settings.maximumImpulse(), physics.profile(piece.type))));
        }
        return new Snapshot(gameId, version, tick, simulationId, stage, turn, turnNumber,
                turnDeadline, matchDeadline, now, winner, reason, List.copyOf(views),
                List.of(timeouts[0], timeouts[1]), settings, true, "separated-v1", physics.inputBoost(),
                itemUsedThisTurn, !stage.equals("FINISHED") && extraShotActivated && shotsThisTurn < 2 ? 1 : 0, lastItemEffect);
    }

    private static void require(boolean condition, String code) {
        if (!condition) { throw new IllegalArgumentException(code); }
    }

    public record Shot(String gameId, String actionId, long expectedVersion, String pieceId,
            double dx, double dy, double power) { }
    public record ItemUse(String gameId, String actionId, long expectedVersion, String cardId, List<String> targetPieceIds) {
        public ItemUse {
            if (targetPieceIds != null) {
                require(targetPieceIds.size() <= 2 && targetPieceIds.stream().allMatch(id -> id != null && !id.isBlank()), "INVALID_TARGETS");
                targetPieceIds = List.copyOf(targetPieceIds);
            }
        }
    }
    public record ItemEffect(long version, int turnNumber, int actor, String type, List<String> targets) { }
    public record CardView(String id, String type) { }
    public record PrivateView(String gameId, long version, List<CardView> cards) { }
    public record PieceView(String id, int owner, String type, double x, double y, double vx, double vy,
            double radius, double mass, boolean alive, double launchSpeed) { }
    public record Snapshot(String gameId, long version, long tick, long simulationId, String stage,
            int turn, int turnNumber, long turnDeadline, long matchDeadline, long serverNow,
            Integer winner, String endReason, List<PieceView> pieces, List<Integer> timeouts,
            AlkkagiSettings settings, boolean provisional, String modelId, double inputCurveBoost,
            boolean itemUsedThisTurn, int extraShotsRemaining, ItemEffect lastItemEffect) { }
    private record Receipt(Object command, long version) { }
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
