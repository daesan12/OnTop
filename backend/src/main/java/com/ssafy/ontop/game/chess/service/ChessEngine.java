package com.ssafy.ontop.game.chess.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameForfeitReceipts;
import com.ssafy.ontop.game.action.GameForfeitResult;
import com.ssafy.ontop.game.chess.domain.ChessMatch;
import com.ssafy.ontop.game.engine.GameEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class ChessEngine implements GameEngine {
    private static final Logger log = LoggerFactory.getLogger(ChessEngine.class);
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Consumer<Object> events;
    private final GameEngineRouter router;
    private final Map<String, ChessMatch> games = new HashMap<>();
    private final Map<Long, String> latest = new HashMap<>();
    private final GameLifecycle lifecycle = new GameLifecycle();
    private final GameForfeitReceipts forfeits = new GameForfeitReceipts();

    public ChessEngine(ObjectMapper mapper, Clock clock, Consumer<Object> events, GameEngineRouter router) {
        this.mapper = mapper;
        this.clock = clock;
        this.events = events;
        this.router = router;
    }

    public synchronized void create(String gameId, String tableId, List<Long> players) {
        ChessMatch existing = games.get(gameId);
        if (existing != null) {
            if (!existing.tableId().equals(tableId) || !existing.players().equals(players)) {
                throw new IllegalArgumentException("같은 경기 ID의 참가자와 테이블이 다릅니다.");
            }
            return;
        }
        ChessMatch match = new ChessMatch(gameId, tableId, players, clock.instant());
        router.register(this, gameId, tableId, players);
        games.put(gameId, match);
        players.forEach(user -> latest.put(user, gameId));
    }

    @Override
    public GameActionResult apply(GameActionCommand command) {
        List<Object> notices = new ArrayList<>();
        GameActionResult result = null;
        Rejected rejected = null;
        synchronized (this) {
            ChessMatch match = authorized(command.userId(), command.gameId());
            long before = match.version();
            boolean finished = match.endedAt() != null;
            try { result = match.apply(command, clock.instant()); }
            catch (Rejected exception) { rejected = exception; }
            collect(match, before, finished, notices);
        }
        publish(notices);
        if (rejected != null) { throw rejected; }
        return result;
    }

    @Override
    public GameForfeitResult forfeit(GameForfeitCommand command) {
        List<Object> notices = new ArrayList<>();
        GameForfeitResult result = null;
        Rejected rejected = null;
        synchronized (this) {
            ChessMatch match = authorized(command.userId(), command.gameId());
            GameForfeitResult previous = forfeits.previous(command);
            if (previous != null) { return previous; }
            long before = match.version();
            boolean finished = match.endedAt() != null;
            match.expire(clock.instant());
            if (match.endedAt() != null) { rejected = new Rejected(Rejection.GAME_FINISHED); }
            else {
                match.forfeit(command.userId(), clock.instant(), "EXPLICIT_LEAVE");
                lifecycle.left(match.gameId(), match.tableId(), "CHESS", match.version(), command.userId(),
                        GameDepartureReason.EXPLICIT_LEAVE, match.endedAt(), 2, notices);
                result = forfeits.accepted(command, match.version());
            }
            collect(match, before, finished, notices);
        }
        publish(notices);
        if (rejected != null) { throw rejected; }
        return result;
    }

    @Override
    public Optional<GameStateView> load(long userId, String gameId) {
        tick();
        synchronized (this) {
            ChessMatch match = games.get(gameId);
            if (userId <= 0 || match == null) { return Optional.empty(); }
            return Optional.of(new GameStateView(userId, gameId, match.version(), match.isPlayer(userId)
                    ? GameStateView.Role.PLAYER : GameStateView.Role.SPECTATOR,
                    publicState(match), mapper.createObjectNode(), match.tableId()));
        }
    }

    @Override
    public Optional<GameRecoverySnapshot> load(long userId) {
        tick();
        synchronized (this) {
            ChessMatch match = games.get(latest.get(userId));
            if (match == null) { return Optional.empty(); }
            ObjectNode state = publicState(match);
            state.set("privateState", mapper.createObjectNode());
            return Optional.of(new GameRecoverySnapshot(userId, match.gameId(), 2, match.version(),
                    match.endedAt() == null ? GameRecoverySnapshot.Phase.PLAYING : GameRecoverySnapshot.Phase.FINISHED,
                    state));
        }
    }

    @Override
    public void graceExpired(GraceExpiration command) {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            ChessMatch match = games.get(command.gameId());
            if (match == null || !match.isPlayer(command.userId()) || command.action() != Action.FORFEIT
                    || clock.instant().isBefore(command.deadline()) || match.endedAt() != null) { return; }
            long before = match.version();
            match.expire(command.deadline());
            if (match.endedAt() == null) {
                match.forfeit(command.userId(), command.deadline(), command.reason() == GameDepartureReason.DISCONNECT_TIMEOUT
                        ? "RECONNECT_EXPIRED" : command.reason().name());
                lifecycle.left(match.gameId(), match.tableId(), "CHESS", match.version(), command.userId(),
                        command.reason(), command.deadline(), 2, notices);
            }
            collect(match, before, false, notices);
        }
        publish(notices);
    }

    public void tick() {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            for (ChessMatch match : games.values()) {
                long before = match.version();
                boolean finished = match.endedAt() != null;
                match.expire(clock.instant());
                collect(match, before, finished, notices);
            }
        }
        publish(notices);
    }

    private ChessMatch authorized(long userId, String gameId) {
        ChessMatch match = games.get(gameId);
        if (match == null || !match.isPlayer(userId)) { throw new Rejected(Rejection.ACCESS_DENIED); }
        return match;
    }

    private void collect(ChessMatch match, long before, boolean wasFinished, List<Object> notices) {
        if (match.version() == before) { return; }
        notices.add(new GameStateChanged(match.gameId(), match.version()));
        if (!wasFinished && match.endedAt() != null) {
            router.finished(this, match.gameId());
            notices.add(lifecycle.finished(match.gameId(), match.tableId(), "CHESS", match.version(), match.players(),
                    match.winner() == null ? List.of() : List.of(match.winner()), match.reason(), match.endedAt(), notices));
        }
    }

    private ObjectNode publicState(ChessMatch match) {
        ObjectNode state = mapper.createObjectNode();
        state.put("gameCode", "CHESS").put("status", match.endedAt() == null ? "PLAYING" : "FINISHED")
                .put("board", match.position().board()).put("fen", match.position().fen())
                .put("whiteUserId", match.players().get(0).toString()).put("blackUserId", match.players().get(1).toString())
                .put("turnUserId", match.endedAt() == null ? Long.toString(match.turnUserId()) : null)
                .put("turnDeadline", match.endedAt() == null ? match.deadline().toString() : null)
                .put("turnStartedAt", match.turnStarted().toString()).put("inCheck", match.position().inCheck(match.position().whiteToMove()))
                .put("canClaimDraw", match.canClaimDraw()).put("moveCount", match.moves().size())
                .put("winnerUserId", match.winner() == null ? null : match.winner().toString())
                .put("endReason", match.reason()).put("endedAt", match.endedAt() == null ? null : match.endedAt().toString())
                .put("drawOfferedBy", match.drawOfferedBy() == null ? null : match.drawOfferedBy().toString());
        state.set("remainingMs", mapper.valueToTree(match.remaining()));
        state.set("moves", mapper.valueToTree(match.moves()));
        state.set("drawOffersUsed", mapper.valueToTree(match.drawOffersUsed().stream().map(Object::toString).toList()));
        state.set("legalMoves", mapper.valueToTree(match.endedAt() == null ? match.position().legalMoves() : List.of()));
        return state;
    }

    private void publish(List<Object> notices) {
        for (Object notice : notices) {
            try { events.accept(notice); }
            catch (RuntimeException exception) { log.warn("체스 이벤트 전달 실패", exception); }
        }
    }
}
