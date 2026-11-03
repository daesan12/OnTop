package com.ssafy.ontop.game.farkle.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameForfeitReceipts;
import com.ssafy.ontop.game.action.GameForfeitResult;
import com.ssafy.ontop.game.engine.GameEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.farkle.domain.FarkleMatch;
import com.ssafy.ontop.game.farkle.domain.FarkleMatch.Snapshot;
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
import java.util.function.IntSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class FarkleEngine implements GameEngine {
    private static final Logger log = LoggerFactory.getLogger(FarkleEngine.class);
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Consumer<Object> events;
    private final GameEngineRouter router;
    private final IntSupplier face;
    private final IntSupplier firstPlayer;
    private final Map<String, FarkleMatch> games = new HashMap<>();
    private final Map<Long, String> latest = new HashMap<>();
    private final GameLifecycle lifecycle = new GameLifecycle();
    private final GameForfeitReceipts forfeits = new GameForfeitReceipts();

    public FarkleEngine(ObjectMapper mapper, Clock clock, Consumer<Object> events, GameEngineRouter router,
            IntSupplier face, IntSupplier firstPlayer) {
        this.mapper = mapper;
        this.clock = clock;
        this.events = events;
        this.router = router;
        this.face = face;
        this.firstPlayer = firstPlayer;
    }

    // 실제 참가·차감 커밋을 확인한 서버만 호출한다. 목표 점수도 시작 전에 서버에서 확정한다.
    public void create(String gameId, String tableId, List<Long> players, int targetScore) {
        tick();
        synchronized (this) {
            FarkleMatch existing = games.get(gameId);
            if (existing != null) {
                Snapshot state = existing.snapshot();
                if (!state.tableId().equals(tableId) || !state.players().equals(players)
                        || state.targetScore() != targetScore) {
                    throw new IllegalStateException("기존 경기와 다른 주사위 생성 요청입니다.");
                }
                return;
            }
            FarkleMatch match = new FarkleMatch(gameId, tableId, players, firstPlayer.getAsInt(),
                    targetScore, clock.instant(), face);
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
            FarkleMatch match = games.get(command.gameId());
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
            FarkleMatch match = games.get(gameId);
            if (userId <= 0 || match == null) { return Optional.empty(); }
            Snapshot state = match.snapshot();
            return Optional.of(new GameStateView(userId, gameId, state.version(), match.isPlayer(userId)
                    ? GameStateView.Role.PLAYER : GameStateView.Role.SPECTATOR,
                    publicState(state), mapper.createObjectNode(), state.tableId()));
        }
    }

    @Override
    public Optional<GameRecoverySnapshot> load(long userId) {
        tick();
        synchronized (this) {
            FarkleMatch match = games.get(latest.get(userId));
            if (match == null) { return Optional.empty(); }
            Snapshot state = match.snapshot();
            return Optional.of(new GameRecoverySnapshot(userId, state.gameId(), 2, state.version(),
                    state.endedAt() == null ? GameRecoverySnapshot.Phase.PLAYING
                            : GameRecoverySnapshot.Phase.FINISHED, publicState(state)));
        }
    }

    @Override
    public GameForfeitResult forfeit(GameForfeitCommand command) {
        List<Object> notices = new ArrayList<>();
        GameForfeitResult result = null;
        Rejected rejected = null;
        synchronized (this) {
            FarkleMatch match = games.get(command.gameId());
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
            } else {
                match.forfeit(command.userId(), now, "EXPLICIT_LEAVE");
                lifecycle.left(command.gameId(), before.tableId(), "DICE", match.snapshot().version(),
                        command.userId(), GameDepartureReason.EXPLICIT_LEAVE, now, before.players().size(), notices);
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
            FarkleMatch match = games.get(command.gameId());
            if (match == null || command.action() != Action.FORFEIT || !match.isPlayer(command.userId())
                    || clock.instant().isBefore(command.deadline())) { return; }
            Snapshot before = match.snapshot();
            match.expire(command.deadline());
            collect(before, match.snapshot(), notices);
            before = match.snapshot();
            match.forfeit(command.userId(), command.deadline(), command.reason() == GameDepartureReason.DISCONNECT_TIMEOUT
                    ? "RECONNECT_EXPIRED" : command.reason().name());
            if (before.endedAt() == null && match.snapshot().endedAt() != null) {
                lifecycle.left(command.gameId(), before.tableId(), "DICE", match.snapshot().version(),
                        command.userId(), command.reason(), command.deadline(), before.players().size(), notices);
            }
            collect(before, match.snapshot(), notices);
        }
        publish(notices);
    }

    public void tick() {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            for (FarkleMatch match : games.values()) {
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
            notices.add(new FarkleGameFinished(after.gameId(), after.tableId(), after.version(), after.players(),
                    after.scores(), after.winnerUserId(), after.endReason(), after.endedAt()));
            notices.add(lifecycle.finished(after.gameId(), after.tableId(), "DICE", after.version(), after.players(),
                    after.winnerUserId() == null ? List.of() : List.of(after.winnerUserId()),
                    after.endReason(), after.endedAt(), notices));
        }
    }

    private ObjectNode publicState(Snapshot state) {
        ObjectNode data = mapper.createObjectNode();
        data.put("gameCode", "DICE").put("status", state.endedAt() == null ? "PLAYING" : "FINISHED")
                .put("targetScore", state.targetScore()).put("turnTimeLimitMs", 30_000)
                .put("turnUserId", state.turnUserId() == null ? null : state.turnUserId().toString())
                .put("turnScore", state.turnScore()).put("rollId", state.rollId()).put("round", state.round())
                .put("stage", state.stage()).put("lastEvent", state.lastEvent()).put("hotDice", state.hotDice())
                .put("turnDeadline", state.turnDeadline() == null ? null : state.turnDeadline().toString())
                .put("winnerUserId", state.winnerUserId() == null ? null : state.winnerUserId().toString())
                .put("endReason", state.endReason()).put("endedAt", state.endedAt() == null ? null : state.endedAt().toString());
        data.set("players", mapper.valueToTree(state.players().stream().map(Object::toString).toList()));
        data.set("scores", mapper.valueToTree(state.scores()));
        data.set("dice", mapper.valueToTree(state.dice()));
        if (state.lastRoll() == null) {
            data.putNull("lastRoll");
        } else {
            ObjectNode roll = data.putObject("lastRoll");
            roll.put("rollId", state.lastRoll().rollId());
            roll.put("actorUserId", Long.toString(state.lastRoll().actorUserId()));
            roll.set("dice", mapper.valueToTree(state.lastRoll().dice()));
        }
        return data;
    }

    private void publish(List<Object> notices) {
        for (Object notice : notices) {
            try { events.accept(notice); }
            catch (RuntimeException exception) {
                log.warn("주사위 상태 알림 전달 실패 type={}", notice.getClass().getSimpleName());
            }
        }
    }
}
