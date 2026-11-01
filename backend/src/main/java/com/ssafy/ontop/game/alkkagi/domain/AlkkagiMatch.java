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
    private final AlkkagiItemRules itemRules;
    private final List<WallView> walls = new ArrayList<>();
    private final int[] wallsUsed = new int[2];
    private final World<Body> world = new World<>();
    private final Map<String, Piece> pieces = new LinkedHashMap<>();
    private final Map<String, Receipt> receipts = new LinkedHashMap<>();
    private final AlkkagiInventory inventory = new AlkkagiInventory();
    private final AlkkagiCardAwards awards;
    private final AlkkagiCardRules cardRules;
    private final String gameId = UUID.randomUUID().toString();
    private String stage = "WAITING";
    private String reason;
    private Integer winner;
    private Long endedAt;
    private final java.util.ArrayDeque<ImpactView> impacts = new java.util.ArrayDeque<>();
    private final Map<String, Long> lastImpact = new java.util.HashMap<>();
    private long impactSequence;
    private long advancingAt;
    private int turn;
    private int turnNumber = 1;
    private final int[] timeouts = new int[2];
    private long version;
    private long tick;
    private long simulationId;
    private long turnDeadline;
    private long matchDeadline;
    private long pausedTurnMillis;
    private int simulationSteps;
    private int stableSteps;
    private int shotsThisTurn;
    private boolean itemUsedThisTurn;
    private boolean extraShotActivated;
    private ItemEffect lastItemEffect;

    public AlkkagiMatch(AlkkagiSettings settings) {
        this(settings, AlkkagiPhysics.experimental());
    }

    public AlkkagiMatch(AlkkagiSettings settings, AlkkagiItemRules itemRules) {
        this(settings, AlkkagiPhysics.experimental(), itemRules);
    }

    public AlkkagiMatch(AlkkagiSettings settings, AlkkagiItemRules itemRules, AlkkagiCardRules cardRules) {
        this(settings, AlkkagiPhysics.experimental(), itemRules, cardRules, new java.security.SecureRandom());
    }

    AlkkagiMatch(AlkkagiSettings settings, AlkkagiPhysics physics) {
        this(settings, physics, AlkkagiItemRules.localPreview());
    }

    private AlkkagiMatch(AlkkagiSettings settings, AlkkagiPhysics physics, AlkkagiItemRules itemRules) {
        this(settings, physics, itemRules, new java.security.SecureRandom());
    }

    AlkkagiMatch(AlkkagiSettings settings, AlkkagiPhysics physics, AlkkagiItemRules itemRules,
            java.util.random.RandomGenerator random) {
        this(settings, physics, itemRules, AlkkagiCardRules.localPreview(), random);
    }

    private AlkkagiMatch(AlkkagiSettings settings, AlkkagiPhysics physics, AlkkagiItemRules itemRules,
            AlkkagiCardRules cardRules, java.util.random.RandomGenerator random) {
        this.cardRules = java.util.Objects.requireNonNull(cardRules);
        this.awards = new AlkkagiCardAwards(java.util.Objects.requireNonNull(random), cardRules);
        this.itemRules = java.util.Objects.requireNonNull(itemRules);
        this.settings = settings;
        this.physics = physics;
        world.setGravity(World.ZERO_GRAVITY);
        world.getSettings().setStepFrequency(settings.stepSeconds());
        // CCD의 이동 상한을 발사 검증값보다 충분히 크게 두고, 알별 bullet을 활성화한다.
        world.getSettings().setMaximumTranslation(2);
        // 경기의 stopSpeed/settleSteps만 정지 기준으로 사용한다.
        world.getSettings().setAtRestDetectionEnabled(false);
        world.addContactListener(new org.dyn4j.world.listener.ContactListenerAdapter<Body>() {
            @Override public void postSolve(org.dyn4j.world.ContactCollisionData<Body> data,
                    org.dyn4j.dynamics.contact.SolvedContact contact) {
                if (!contact.isSolved() || !Double.isFinite(contact.getNormalImpulse()) || contact.getNormalImpulse() < .1) return;
                String a = String.valueOf(data.getBody1().getUserData()), b = String.valueOf(data.getBody2().getUserData());
                String pair = a.compareTo(b) <= 0 ? a + ":" + b : b + ":" + a;
                if (tick - lastImpact.getOrDefault(pair, -100L) < 12) return;
                lastImpact.put(pair, tick);
                var p = contact.getPoint();
                if (!Double.isFinite(p.x) || !Double.isFinite(p.y)) return;
                impacts.addLast(new ImpactView(++impactSequence, advancingAt, p.x, p.y, contact.getNormalImpulse(),
                        a.equals("wall") || b.equals("wall") ? "WALL" : "PIECE"));
                while (impacts.size() > 24) impacts.removeFirst();
            }
        });
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
        body.setUserData(id);
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
        double boost = piece.powerUp ? itemRules.powerMultiplier() : 1;
        piece.body.applyImpulse(new Vector2(shot.dx() / length, shot.dy() / length)
                .multiply(physics.launchImpulse(settings.maximumImpulse(), shot.power(), physics.profile(piece.type))
                        * piece.mass / piece.baseMass * boost));
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
        require(input.placement() == null || card.type() == AlkkagiInventory.Type.WALL
                || card.type() == AlkkagiInventory.Type.RELOCATE, "INVALID_PLACEMENT");
        if (card.type() == AlkkagiInventory.Type.SWAP) {
            require(targets != null && targets.size() == 2 && !targets.get(0).equals(targets.get(1)), "INVALID_TARGETS");
            var a = pieces.get(targets.get(0)); var b = pieces.get(targets.get(1));
            require(a != null && b != null && a.alive && b.alive, "NOT_YOUR_PIECE");
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
        } else if (card.type() == AlkkagiInventory.Type.WALL) {
            require(targets != null && targets.isEmpty() && input.placement() != null, "INVALID_TARGETS");
            placeWall(actor, input.placement());
        } else {
            require(targets != null && targets.size() == 1, "INVALID_TARGETS");
            var piece = pieces.get(targets.getFirst());
            require(piece != null && piece.alive, "INVALID_TARGETS");
            if (card.type() == AlkkagiInventory.Type.POWER_UP || card.type() == AlkkagiInventory.Type.DEFEND)
                require(piece.owner == actor, "NOT_YOUR_PIECE");
            if (card.type() == AlkkagiInventory.Type.RELOCATE) {
                require(input.placement() != null, "INVALID_PLACEMENT");
                var destination = input.placement();
                validatePlacement(destination);
                require(piece.body.getWorldCenter().distance(destination.x(), destination.y()) <= itemRules.relocateDistance(), "RELOCATE_TOO_FAR");
                require(fits(destination.x(), destination.y(), piece.radius, piece, null, false), "ITEM_OVERLAP_OR_OUTSIDE");
                var at = piece.body.getWorldCenter().copy();
                piece.body.translate(destination.x() - at.x, destination.y() - at.y);
                world.setUpdateRequired(true);
            } else if (card.type() == AlkkagiInventory.Type.POWER_UP) {
                require(!piece.powerUp, "POWER_ALREADY_ACTIVE");
                piece.powerUp = true;
            } else {
                require(piece.modifier == null, "MODIFIER_ACTIVE");
                double scale = card.type() == AlkkagiInventory.Type.GROW ? itemRules.growScale()
                        : card.type() == AlkkagiInventory.Type.SHRINK ? itemRules.shrinkScale() : 1;
                double mass = piece.baseMass * (card.type() == AlkkagiInventory.Type.DEFEND
                        ? itemRules.defendMassMultiplier() : scale * scale);
                var at = piece.body.getWorldCenter();
                require(card.type() == AlkkagiInventory.Type.DEFEND
                        || fits(at.x, at.y, piece.baseRadius * scale, piece, null, false), "ITEM_OVERLAP_OR_OUTSIDE");
                resize(piece, piece.baseRadius * scale, mass);
                piece.modifier = card.type().name();
            }
        }
        inventory.consume(actor, input.cardId());
        for (var piece : pieces.values()) {
            piece.safeX = piece.body.getWorldCenter().x; piece.safeY = piece.body.getWorldCenter().y;
        }
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
        require(walls.stream().noneMatch(wall -> AlkkagiWallGeometry.overlaps(destination.x, destination.y, moving.radius, wall)), "ITEM_OVERLAP");
    }

    private boolean fits(double x, double y, double radius, Piece a, Piece b, boolean fullInside) {
        double margin = fullInside ? radius : 0;
        if (Math.abs(x) + margin > settings.halfWidth() || Math.abs(y) + margin > settings.halfHeight()) return false;
        for (var other : pieces.values()) {
            if (other.alive && other != a && other != b
                    && Math.hypot(x - other.body.getWorldCenter().x, y - other.body.getWorldCenter().y) < radius + other.radius - 1e-9) return false;
        }
        return walls.stream().noneMatch(wall -> AlkkagiWallGeometry.overlaps(x, y, radius, wall));
    }

    private void validatePlacement(Placement p) {
        require(Double.isFinite(p.x()) && Double.isFinite(p.y()) && Double.isFinite(p.angle())
                && Math.abs(p.angle()) <= Math.PI, "INVALID_PLACEMENT");
    }

    private void placeWall(int actor, Placement p) {
        validatePlacement(p);
        require(wallsUsed[actor] < 3, "WALL_LIMIT");
        double c = Math.abs(Math.cos(p.angle())), s = Math.abs(Math.sin(p.angle()));
        double halfX = (c * itemRules.wallLength() + s * itemRules.wallThickness()) / 2;
        double halfY = (s * itemRules.wallLength() + c * itemRules.wallThickness()) / 2;
        require(Math.abs(p.x()) + halfX + itemRules.wallMargin() <= settings.halfWidth()
                && Math.abs(p.y()) + halfY + itemRules.wallMargin() <= settings.halfHeight(), "ITEM_OUTSIDE_BOARD");
        var candidate = new WallView(actor, p.x(), p.y(), itemRules.wallLength(), itemRules.wallThickness(), p.angle(), null);
        require(walls.stream().noneMatch(existing -> AlkkagiWallGeometry.overlaps(candidate, existing)), "ITEM_OVERLAP");
        for (var piece : pieces.values()) {
            var at = piece.body.getWorldCenter();
            require(!piece.alive || !AlkkagiWallGeometry.overlaps(at.x, at.y, piece.radius + .02, candidate), "ITEM_OVERLAP");
        }
        Body body = new Body();
        var fixture = body.addFixture(Geometry.createRectangle(candidate.length(), candidate.thickness()));
        fixture.setRestitution(settings.restitution()); fixture.setFriction(.15);
        body.setMass(MassType.INFINITE); body.rotate(p.angle()); body.translate(p.x(), p.y());
        body.setUserData("wall");
        world.addBody(body); world.setUpdateRequired(true);
        walls.add(candidate); wallsUsed[actor]++;
    }

    private void resize(Piece piece, double radius, double mass) {
        piece.body.removeAllFixtures();
        var fixture = piece.body.addFixture(Geometry.createCircle(radius));
        fixture.setDensity(mass / (Math.PI * radius * radius)); fixture.setRestitution(settings.restitution()); fixture.setFriction(.15);
        piece.body.setMass(MassType.FIXED_ANGULAR_VELOCITY);
        piece.radius = radius; piece.mass = mass;
        world.setUpdateRequired(true);
    }

    public PrivateView privateView(int actor) {
        require(actor == 0 || actor == 1, "PLAYER_REQUIRED");
        return new PrivateView(gameId, version, inventory.cards(actor).stream()
                .map(card -> new CardView(card.id(), card.type().name())).toList(),
                awards.view(actor).stream().map(a -> new AwardView(a.losses(), a.result())).toList(), choiceView(actor));
    }

    private ChoiceView choiceView(int actor) {
        var offer = awards.offer(actor);
        return offer == null ? null : new ChoiceView(offer.id(), offer.losses(), offer.deadline(), offer.options().stream()
                .map(o -> new CardView(o.id(), o.type().name())).toList());
    }

    public long chooseCard(int actor, CardChoice input, long now) {
        require(actor == 0 || actor == 1, "PLAYER_REQUIRED");
        require(input != null && input.actionId() != null && input.actionId().matches("[A-Za-z0-9-]{1,64}"), "INVALID_ACTION");
        require(gameId.equals(input.gameId()), "STALE_GAME");
        String key = actor + ":" + input.actionId(); var old = receipts.get(key);
        if (old != null) { require(old.command().equals(input), "ACTION_ID_CONFLICT"); return old.version(); }
        expire(now);
        require(stage.equals("CHOOSING"), "CHOICE_NOT_ACTIVE");
        // 상대의 동시 선택으로 version이 바뀌어도 본인 후보는 유지한다. 소유자/후보ID/기한을 검사한다.
        awards.choose(actor, input.choiceId(), input.optionId(), now, wallsUsed[actor], inventory);
        version++; resumeAfterChoices(now); remember(key, input); return version;
    }

    private void pauseForChoices(long now) {
        if (!awards.hasPending()) return;
        pausedTurnMillis = Math.max(0, turnDeadline - now);
        stage = "CHOOSING"; version++;
    }

    private void resumeAfterChoices(long now) {
        if (!stage.equals("CHOOSING") || awards.hasPending()) return;
        turnDeadline = awards.lastResolvedAt() + pausedTurnMillis;
        stage = "AIMING"; version++;
        expire(now);
    }

    public long forfeit(int actor, String actionId, long now) {
        require(actor == 0 || actor == 1, "PLAYER_REQUIRED");
        require(actionId != null && actionId.matches("[A-Za-z0-9-]{1,64}"), "INVALID_ACTION");
        String key = actor + ":" + actionId;
        var command = new Departure(actor, "EXPLICIT_LEAVE");
        var old = receipts.get(key);
        if (old != null) {
            require(old.command().equals(command), "ACTION_ID_CONFLICT");
            return old.version();
        }
        depart(actor, "EXPLICIT_LEAVE", now);
        remember(key, command);
        return version;
    }

    /** 공통 재접속 유예·로그아웃 소비자가 호출하는 서버 경계. */
    public void depart(int actor, String reason, long now) {
        require(actor == 0 || actor == 1, "PLAYER_REQUIRED");
        require(java.util.Set.of("EXPLICIT_LEAVE", "DISCONNECT_TIMEOUT", "LOGOUT", "MEMBER_DEACTIVATED").contains(reason), "INVALID_DEPARTURE");
        expire(now);
        require(!stage.equals("WAITING") && !stage.equals("FINISHED"), "GAME_FINISHED");
        finish(1 - actor, reason, now);
        for (var piece : pieces.values()) piece.body.setLinearVelocity(0, 0);
    }

    public void checkDeadlines(long now) { expire(now); }

    public void abort(long now) {
        if (stage.equals("FINISHED")) return;
        for (var piece : pieces.values()) {
            piece.body.getTransform().setTranslation(piece.safeX, piece.safeY);
            piece.body.setLinearVelocity(0, 0);
        }
        finish(null, "SIMULATION_INVALID", now);
    }

    public void advance(long now) {
        expire(now);
        if (!stage.equals("SIMULATING")) {
            return;
        }
        for (Piece piece : pieces.values()) {
            if (!piece.alive) { continue; }
            if (!Double.isFinite(piece.body.getLinearVelocity().getMagnitude())) { abort(now); return; }
            decelerate(piece.body, settings);
        }
        advancingAt = now;
        world.step(1);
        tick++;
        // 공통 상태 전송기는 같은 version을 다시 보내지 않는다. 물리 프레임도20Hz로 갱신한다.
        if (tick % 6 == 0) version++;
        simulationSteps++;
        boolean moving = false;
        for (Piece piece : pieces.values()) {
            if (!piece.alive) { continue; }
            Vector2 at = piece.body.getWorldCenter();
            if (!Double.isFinite(at.x) || !Double.isFinite(at.y)) {
                abort(now);
                return;
            }
            piece.safeX = at.x; piece.safeY = at.y;
            // 임시 정책: 알 중심이 외곽을 넘으면 탈락. 최종 낙하 기준은 별도 합의한다.
            if (Math.abs(at.x) > settings.halfWidth() || Math.abs(at.y) > settings.halfHeight()) {
                var velocity = piece.body.getLinearVelocity();
                piece.exit = new ExitView(at.x, at.y, velocity.x, velocity.y, now);
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
            finish(null, "SIMULATION_LIMIT", now);
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
        if (stage.equals("CHOOSING")) {
            if (now >= matchDeadline) { resolveByCount("MATCH_TIME_LIMIT", matchDeadline); return; }
            if (awards.expire(now, wallsUsed[0], wallsUsed[1], inventory)) version++;
            resumeAfterChoices(now);
            return;
        }
        if (!stage.equals("AIMING")) { return; }
        if (now >= matchDeadline) {
            resolveByCount("MATCH_TIME_LIMIT", matchDeadline);
        } else if (now >= turnDeadline) {
            if (shotsThisTurn > 0) { nextTurn(now); return; }
            timeouts[turn]++;
            if (timeouts[turn] >= 2) {
                finish(1 - turn, "AFK_FORFEIT", turnDeadline);
            } else {
                nextTurn(now);
            }
        }
    }

    private void resolve(long now) {
        if (count(0) > 0 && count(1) > 0 && now < matchDeadline) {
            awards.resolve(count(0), count(1), wallsUsed[0], wallsUsed[1], inventory, now);
        }
        if (count(0) == 0 || count(1) == 0) {
            resolveByCount("PIECES_OUT", now);
        } else if (now >= matchDeadline) {
            resolveByCount("MATCH_TIME_LIMIT", now);
        } else if (extraShotActivated && shotsThisTurn == 1 && now < turnDeadline) {
            stage = "AIMING";
            version++;
        } else {
            nextTurn(now);
        }
        if (stage.equals("AIMING")) pauseForChoices(now);
    }

    private int count(int owner) {
        return (int) pieces.values().stream().filter(p -> p.alive && p.owner == owner).count();
    }

    private void resolveByCount(String endReason, long now) {
        finish(count(0) == count(1) ? null : count(0) > count(1) ? 0 : 1, endReason, now);
    }

    private void finish(Integer player, String endReason, long now) {
        if (stage.equals("FINISHED")) return;
        endedAt = now;
        awards.clear();
        extraShotActivated = false;
        for (var piece : pieces.values()) piece.body.setLinearVelocity(0, 0);
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
                    physics.maximumSpeed(settings.maximumImpulse(), physics.profile(piece.type))
                            * (piece.powerUp ? itemRules.powerMultiplier() : 1), piece.modifier, false, piece.exit, piece.powerUp));
        }
        return new Snapshot(gameId, version, tick, simulationId, stage, turn, turnNumber,
                turnDeadline, matchDeadline, now, winner, reason, List.copyOf(views),
                List.of(timeouts[0], timeouts[1]), settings, true, "separated-v1", physics.inputBoost(),
                itemUsedThisTurn, !stage.equals("FINISHED") && extraShotActivated && shotsThisTurn < 2 ? 1 : 0, lastItemEffect, walls.isEmpty() ? null : walls.getFirst(), List.of(wallsUsed[0], wallsUsed[1]), null, itemRules, endedAt, List.copyOf(impacts), cardRules, choiceClocks(), stage.equals("CHOOSING") ? pausedTurnMillis : null, List.copyOf(walls));
    }

    private List<ChoiceClock> choiceClocks() {
        var result = new ArrayList<ChoiceClock>();
        for (int actor = 0; actor < 2; actor++) {
            var offer = awards.offer(actor); if (offer != null) result.add(new ChoiceClock(actor, offer.deadline()));
        }
        return List.copyOf(result);
    }

    private static void require(boolean condition, String code) {
        if (!condition) { throw new IllegalArgumentException(code); }
    }

    public record Shot(String gameId, String actionId, long expectedVersion, String pieceId,
            double dx, double dy, double power) { }
    public record Placement(double x, double y, double angle) { }
    public record ItemUse(String gameId, String actionId, long expectedVersion, String cardId, List<String> targetPieceIds, Placement placement) {
        public ItemUse(String gameId, String actionId, long expectedVersion, String cardId, List<String> targetPieceIds) {
            this(gameId, actionId, expectedVersion, cardId, targetPieceIds, null);
        }
        public ItemUse {
            if (targetPieceIds != null) {
                require(targetPieceIds.size() <= 2 && targetPieceIds.stream().allMatch(id -> id != null && !id.isBlank()), "INVALID_TARGETS");
                targetPieceIds = List.copyOf(targetPieceIds);
            }
        }
    }
    public record ItemEffect(long version, int turnNumber, int actor, String type, List<String> targets) { }
    public record WallView(int owner, double x, double y, double length, double thickness, double angle, Integer expiresAfterTurn) { }
    public record ImpactView(long id, long at, double x, double y, double impulse, String kind) { }
    public record CardView(String id, String type) { }
    public record AwardView(int losses, String result) { }
    public record ChoiceView(String id, int losses, long deadline, List<CardView> options) { }
    public record ChoiceClock(int actor, long deadline) { }
    public record CardChoice(String gameId, String actionId, String choiceId, String optionId) { }
    public record PrivateView(String gameId, long version, List<CardView> cards, List<AwardView> awards, ChoiceView choice) { }
    public record ExitView(double x, double y, double vx, double vy, long at) { }
    public record PieceView(String id, int owner, String type, double x, double y, double vx, double vy,
            double radius, double mass, boolean alive, double launchSpeed, String modifier, boolean restorePending, ExitView exit, boolean powerUp) { }
    public record Snapshot(String gameId, long version, long tick, long simulationId, String stage,
            int turn, int turnNumber, long turnDeadline, long matchDeadline, long serverNow,
            Integer winner, String endReason, List<PieceView> pieces, List<Integer> timeouts,
            AlkkagiSettings settings, boolean provisional, String modelId, double inputCurveBoost,
            boolean itemUsedThisTurn, int extraShotsRemaining, ItemEffect lastItemEffect, WallView wall, List<Integer> wallsUsed, String boostedPieceId, AlkkagiItemRules itemRules, Long endedAt, List<ImpactView> impacts, AlkkagiCardRules cardRules, List<ChoiceClock> cardChoices, Long pausedTurnMillis, List<WallView> walls) { }
    private record Receipt(Object command, long version) { }
    private record Departure(int actor, String reason) { }
    private static final class Piece {
        private final String id;
        private final int owner;
        private final String type;
        private double radius;
        private double mass;
        private final double baseRadius;
        private final double baseMass;
        private String modifier;
        private boolean powerUp;
        private double safeX, safeY;
        private ExitView exit;
        private final Body body;
        private boolean alive = true;

        private Piece(String id, int owner, String type, double radius, double mass, Body body) {
            this.id = id; this.owner = owner; this.type = type;
            this.radius = radius; this.mass = mass; this.baseRadius = radius; this.baseMass = mass; this.body = body;
            this.safeX = body.getWorldCenter().x; this.safeY = body.getWorldCenter().y;
        }
    }
}
