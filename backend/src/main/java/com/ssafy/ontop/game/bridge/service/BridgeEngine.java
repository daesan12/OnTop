package com.ssafy.ontop.game.bridge.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameForfeitReceipts;
import com.ssafy.ontop.game.action.GameForfeitResult;
import com.ssafy.ontop.game.engine.GameEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.bridge.domain.BridgeMatch;
import com.ssafy.ontop.game.bridge.domain.BridgeMatch.Snapshot;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameLifecycle;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateView;
import java.time.Clock;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.function.IntUnaryOperator;
import java.util.function.IntSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class BridgeEngine implements GameEngine {
    private static final Logger log = LoggerFactory.getLogger(BridgeEngine.class);
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Consumer<Object> events;
    private final GameEngineRouter router;
    private final IntSupplier randomFace;
    private final IntUnaryOperator firstPlayer;
    private final Map<String, BridgeMatch> games = new HashMap<>();
    private final Map<Long, String> latest = new HashMap<>();
    private final GameLifecycle lifecycle = new GameLifecycle();
    private final GameForfeitReceipts forfeits = new GameForfeitReceipts();

    public BridgeEngine(ObjectMapper mapper, Clock clock, Consumer<Object> events, GameEngineRouter router,
            IntSupplier randomFace, IntUnaryOperator firstPlayer) {
        this.mapper = mapper;
        this.clock = clock;
        this.events = events;
        this.router = router;
        this.randomFace = randomFace;
        this.firstPlayer = firstPlayer;
    }

    // 실제 참가·차감 커밋을 확인한 서버만 호출한다. 덱·선공도 서버에서 정한다.
    public void create(String gameId, String tableId, List<Long> players) {
        tick();
        synchronized (this) {
            BridgeMatch existing = games.get(gameId);
            if (existing != null) {
                Snapshot state = existing.snapshot();
                if (!state.tableId().equals(tableId) || !state.players().equals(players)) {
                    throw new IllegalStateException("기존 경기와 다른 거짓말 다리 생성 요청입니다.");
                }
                return;
            }
            if (players == null || players.size() < 2 || players.size() > 4) {
                throw new IllegalArgumentException("거짓말 다리 참가자는2~4명입니다.");
            }
            BridgeMatch match = new BridgeMatch(gameId, tableId, players, firstPlayer.applyAsInt(players.size()),
                    clock.instant(), randomFace);
            router.register(this, gameId, tableId, players);
            games.put(gameId, match);
            for (long userId : players) { latest.put(userId, gameId); }
        }
    }

    @Override
    public GameActionResult apply(GameActionCommand command) {
        GameActionResult result = null;
        Rejected rejected = null;
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            BridgeMatch match = games.get(command.gameId());
            if (match == null || !match.isPlayer(command.userId())) { throw new Rejected(Rejection.ACCESS_DENIED); }
            Snapshot before = match.snapshot();
            try {
                result = match.apply(command, clock.instant());
            } catch (Rejected exception) {
                rejected = exception;
            }
            collect(before, match.snapshot(), notices);
        }
        publish(notices);
        if (rejected != null) { throw rejected; }
        return result;
    }

    @Override
    public Optional<GameStateView> load(long userId, String gameId) {
        tick();
        synchronized (this) {
            BridgeMatch match = games.get(gameId);
            if (userId <= 0 || match == null) { return Optional.empty(); }
            Snapshot state = match.snapshot();
            return Optional.of(new GameStateView(userId, gameId, state.version(), match.isPlayer(userId)
                    ? GameStateView.Role.PLAYER : GameStateView.Role.SPECTATOR,
                    publicState(state), privateState(match, userId), state.tableId()));
        }
    }

    @Override
    public Optional<GameRecoverySnapshot> load(long userId) {
        tick();
        synchronized (this) {
            BridgeMatch match = games.get(latest.get(userId));
            if (match == null) { return Optional.empty(); }
            Snapshot state = match.snapshot();
            return Optional.of(new GameRecoverySnapshot(userId, state.gameId(), state.players().size(), state.version(),
                    state.endedAt() != null ? GameRecoverySnapshot.Phase.FINISHED
                            : match.isActive(userId) ? GameRecoverySnapshot.Phase.PLAYING : GameRecoverySnapshot.Phase.ELIMINATED,
                    recoveryState(match, userId)));
        }
    }

    @Override
    public GameForfeitResult forfeit(GameForfeitCommand command) {
        List<Object> notices = new ArrayList<>();
        GameForfeitResult result = null;
        Rejected rejected = null;
        synchronized (this) {
            BridgeMatch match = games.get(command.gameId());
            if (match == null || !match.isPlayer(command.userId())) {
                throw new Rejected(Rejection.ACCESS_DENIED);
            }
            GameForfeitResult previous = forfeits.previous(command);
            if (previous != null) { return previous; }
            var now = clock.instant();
            Snapshot before = match.snapshot();
            match.expire(now);
            collect(before, match.snapshot(), notices);
            before = match.snapshot();
            if (before.endedAt() != null) {
                rejected = new Rejected(Rejection.GAME_FINISHED);
            } else if (!match.isActive(command.userId())) {
                rejected = new Rejected(Rejection.NOT_ACTIVE);
            } else {
                match.forfeit(command.userId(), now);
                lifecycle.left(command.gameId(), before.tableId(), "LIAR_BRIDGE", match.snapshot().version(),
                        command.userId(), GameDepartureReason.EXPLICIT_LEAVE, now, notices);
                collect(before, match.snapshot(), notices);
                result = forfeits.accepted(command, match.snapshot().version());
            }
        }
        publish(notices);
        if (rejected != null) { throw rejected; }
        return result;
    }

    @Override
    public void graceExpired(GraceExpiration command) {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            BridgeMatch match = games.get(command.gameId());
            if (match == null || (command.action() != Action.FORFEIT && command.action() != Action.ELIMINATE) || !match.isPlayer(command.userId())
                    || clock.instant().isBefore(command.deadline())) { return; }
            Snapshot before = match.snapshot();
            match.expire(command.deadline());
            collect(before, match.snapshot(), notices);
            before = match.snapshot();
            boolean wasActive = before.endedAt() == null && match.isActive(command.userId());
            match.forfeit(command.userId(), command.deadline());
            if (wasActive && !match.isActive(command.userId())) {
                lifecycle.left(command.gameId(), before.tableId(), "LIAR_BRIDGE", match.snapshot().version(),
                        command.userId(), command.reason(), command.deadline(), notices);
            }
            collect(before, match.snapshot(), notices);
        }
        publish(notices);
    }

    public void tick() {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            for (BridgeMatch match : games.values()) {
                Snapshot before = match.snapshot();
                match.expire(clock.instant());
                collect(before, match.snapshot(), notices);
            }
        }
        publish(notices);
    }

    private void collect(Snapshot before, Snapshot after, List<Object> notices) {
        if (before.version() == after.version()) { return; }
        notices.add(new GameStateChanged(after.gameId(), after.version()));
        if (before.endedAt() == null && after.endedAt() != null) {
            router.finished(this, after.gameId());
            notices.add(new BridgeGameFinished(after.gameId(), after.tableId(), after.version(), after.players(),
                    after.winnerUserIds(), after.endReason(), after.endedAt()));
            notices.add(lifecycle.finished(after.gameId(), after.tableId(), "LIAR_BRIDGE", after.version(), after.players(),
                    after.winnerUserIds(), after.endReason(), after.endedAt()));
        }
    }

    private ObjectNode publicState(Snapshot state) {
        ObjectNode data=mapper.createObjectNode();
        data.put("gameCode","LIAR_BRIDGE").put("status",state.endedAt()==null ? "PLAYING" : "FINISHED")
                .put("phaseTimeLimitMs",30_000).put("resolutionVisualMs",1500).put("turnId",state.turnId())
                .put("stage",state.stage()).put("turnUserId",id(state.turnUserId()))
                .put("responderUserId",id(state.responderUserId()))
                .put("turnDeadline",state.turnDeadline()==null ? null : state.turnDeadline().toString())
                .put("declaration",state.declaration()).put("nextGoalSlot",state.nextGoalSlot())
                .put("lastEvent",state.lastEvent()).put("endReason",state.endReason())
                .put("endedAt",state.endedAt()==null ? null : state.endedAt().toString());
        data.set("winnerUserIds",mapper.valueToTree(state.winnerUserIds().stream().map(Object::toString).toList()));
        data.set("responseOrder",mapper.valueToTree(state.responseOrder().stream().map(Object::toString).toList()));
        data.set("acceptedBy",mapper.valueToTree(state.acceptedBy().stream().map(Object::toString).toList()));
        var players=data.putArray("players");
        for (var player : state.publicPlayers()) {
            var view=players.addObject().put("userId",id(player.userId())).put("score",player.score()).put("goals",player.goals())
                    .put("forfeited",player.forfeited()).put("pendingForfeit",player.pendingForfeit());
            view.set("pawns",mapper.valueToTree(player.pawns()));
        }
        var slots=data.putArray("goalSlots");
        for (var slot : state.goalSlots()) {
            slots.addObject().put("slot",slot.slot()).put("status",slot.status()).put("userId",id(slot.userId()))
                    .put("pawnId",slot.pawnId()).put("removedReason",slot.removedReason())
                    .put("firstAssignedTurnId",slot.firstAssignedTurnId());
        }
        data.set("operations",operations(state.operations()));
        if (state.resolution()==null) { data.putNull("resolution"); }
        else {
            var source=state.resolution();
            var value=data.putObject("resolution").put("turnId",source.turnId()).put("declarerUserId",id(source.declarerUserId()))
                    .put("declaredNumber",source.declaredNumber()).put("challenged",source.challenged())
                    .put("startedAt",source.startedAt().toString());
            value.set("operations",operations(source.operations()));
            // 모두 믿은 판정에는 실제 눈 속성 자체를 만들지 않는다.
            if (source.challenged()) {
                value.set("actualFace",face(source.actualFace()));
                value.put("challengerUserId",id(source.challengerUserId())).put("wasBluff",source.wasBluff());
            }
        }
        return data;
    }

    private com.fasterxml.jackson.databind.node.ArrayNode operations(List<BridgeMatch.Operation> operations) {
        var values=mapper.createArrayNode();
        for (var operation : operations) {
            values.addObject().put("type",operation.type()).put("userId",id(operation.userId()))
                    .put("pawnId",operation.pawnId()).put("fromPosition",operation.fromPosition())
                    .put("toPosition",operation.toPosition()).put("slotNumber",operation.slotNumber()).put("reason",operation.reason());
        }
        return values;
    }

    private com.fasterxml.jackson.databind.JsonNode face(int face) {
        return face==0 ? mapper.getNodeFactory().textNode("X") : mapper.getNodeFactory().numberNode(face);
    }
    private String id(Long value) { return value==null ? null : value.toString(); }

    private ObjectNode privateState(BridgeMatch match,long userId) {
        var value=mapper.createObjectNode();
        Integer hidden=match.privateFace(userId);
        if (hidden!=null) {
            value.put("userId",id(userId)).put("turnId",match.snapshot().turnId());
            value.set("die",face(hidden));
        }
        return value;
    }

    private ObjectNode recoveryState(BridgeMatch match, long userId) {
        ObjectNode data = mapper.createObjectNode();
        data.set("publicState", publicState(match.snapshot()));
        data.set("privateState", privateState(match, userId));
        return data;
    }

    private void publish(List<Object> notices) {
        for (Object notice : notices) {
            try { events.accept(notice); }
            catch (RuntimeException exception) {
                log.warn("거짓말 다리 상태 알림 전달 실패 type={}", notice.getClass().getSimpleName());
            }
        }
    }
}
