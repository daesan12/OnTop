package com.ssafy.ontop.game.ledger.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameForfeitReceipts;
import com.ssafy.ontop.game.action.GameForfeitResult;
import com.ssafy.ontop.game.engine.GameEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.ledger.domain.DiceLedgerMatch;
import com.ssafy.ontop.game.ledger.domain.DiceLedgerMatch.Snapshot;
import com.ssafy.ontop.game.ledger.domain.DiceLedgerScoring;
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
import java.util.function.IntUnaryOperator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class DiceLedgerEngine implements GameEngine {
    public static final String GAME_CODE = "DICE_LEDGER";
    private static final Logger log = LoggerFactory.getLogger(DiceLedgerEngine.class);
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Consumer<Object> events;
    private final GameEngineRouter router;
    private final IntSupplier face;
    private final IntUnaryOperator firstPlayer;
    private final Map<String, DiceLedgerMatch> games = new HashMap<>();
    private final Map<Long, String> latest = new HashMap<>();
    private final GameLifecycle lifecycle = new GameLifecycle();
    private final GameForfeitReceipts forfeits = new GameForfeitReceipts();

    public DiceLedgerEngine(ObjectMapper mapper, Clock clock, Consumer<Object> events, GameEngineRouter router,
            IntSupplier face, IntUnaryOperator firstPlayer) {
        this.mapper = mapper;
        this.clock = clock;
        this.events = events;
        this.router = router;
        this.face = face;
        this.firstPlayer = firstPlayer;
    }

    // 실제 참가·차감 커밋을 확인한 서버만 호출한다. 선공도 서버에서 정한다.
    public void create(String gameId, String tableId, List<Long> players) {
        tick();
        synchronized (this) {
            DiceLedgerMatch existing = games.get(gameId);
            if (existing != null) {
                Snapshot state = existing.snapshot();
                if (!state.tableId().equals(tableId) || !state.players().equals(players)) {
                    throw new IllegalStateException("기존 경기와 다른 주사위 장부 생성 요청입니다.");
                }
                return;
            }
            if (players == null || players.size() < 2 || players.size() > 4) {
                throw new IllegalArgumentException("주사위 장부 참가자는2~4명입니다.");
            }
            DiceLedgerMatch match = new DiceLedgerMatch(gameId, tableId, players,
                    firstPlayer.applyAsInt(players.size()), clock.instant(), face);
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
            DiceLedgerMatch match = games.get(command.gameId());
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
            DiceLedgerMatch match = games.get(gameId);
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
            DiceLedgerMatch match = games.get(latest.get(userId));
            if (match == null) { return Optional.empty(); }
            Snapshot state = match.snapshot();
            return Optional.of(new GameRecoverySnapshot(userId, state.gameId(), state.players().size(), state.version(),
                    state.endedAt() != null ? GameRecoverySnapshot.Phase.FINISHED
                            : match.isActive(userId) ? GameRecoverySnapshot.Phase.PLAYING
                                    : GameRecoverySnapshot.Phase.ELIMINATED, recoveryState(state)));
        }
    }

    @Override
    public GameForfeitResult forfeit(GameForfeitCommand command) {
        List<Object> notices = new ArrayList<>();
        GameForfeitResult result = null;
        Rejected rejected = null;
        synchronized (this) {
            DiceLedgerMatch match = games.get(command.gameId());
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
                lifecycle.left(command.gameId(), before.tableId(), GAME_CODE, match.snapshot().version(),
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
            DiceLedgerMatch match = games.get(command.gameId());
            if (match == null || (command.action() != Action.FORFEIT && command.action() != Action.ELIMINATE)
                    || !match.isPlayer(command.userId()) || clock.instant().isBefore(command.deadline())) { return; }
            Snapshot before = match.snapshot();
            match.expire(command.deadline());
            collect(before, match.snapshot(), notices);
            before = match.snapshot();
            boolean wasActive = before.endedAt() == null && match.isActive(command.userId());
            match.forfeit(command.userId(), command.deadline());
            if (wasActive && !match.isActive(command.userId())) {
                lifecycle.left(command.gameId(), before.tableId(), GAME_CODE, match.snapshot().version(),
                        command.userId(), command.reason(), command.deadline(), before.players().size(), notices);
            }
            collect(before, match.snapshot(), notices);
        }
        publish(notices);
    }

    public void tick() {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            for (DiceLedgerMatch match : games.values()) {
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
            notices.add(new DiceLedgerGameFinished(after.gameId(), after.tableId(), after.version(), after.players(),
                    after.cards().stream().map(DiceLedgerMatch.Card::total).toList(), after.winnerUserIds(),
                    after.endReason(), after.endedAt()));
            notices.add(lifecycle.finished(after.gameId(), after.tableId(), GAME_CODE, after.version(), after.players(),
                    after.winnerUserIds(), after.endReason(), after.endedAt(), notices));
        }
    }

    private ObjectNode publicState(Snapshot state) {
        ObjectNode data = mapper.createObjectNode();
        data.put("gameCode", GAME_CODE).put("status", state.endedAt() == null ? "PLAYING" : "FINISHED")
                .put("turnTimeLimitMs", DiceLedgerMatch.TURN_SECONDS * 1000).put("maxRolls", DiceLedgerMatch.MAX_ROLLS)
                .put("upperBonusThreshold", DiceLedgerScoring.UPPER_BONUS_THRESHOLD)
                .put("upperBonus", DiceLedgerScoring.UPPER_BONUS)
                .put("turnUserId", id(state.turnUserId())).put("turnId", state.turnId()).put("round", state.round())
                .put("rollCount", state.rollCount()).put("rollId", state.rollId()).put("lastEvent", state.lastEvent())
                .put("turnDeadline", state.turnDeadline() == null ? null : state.turnDeadline().toString())
                .put("endReason", state.endReason())
                .put("endedAt", state.endedAt() == null ? null : state.endedAt().toString());
        var categories = data.putArray("categories");
        for (var category : DiceLedgerScoring.Category.values()) { categories.add(category.name()); }
        data.set("winnerUserIds", mapper.valueToTree(state.winnerUserIds().stream().map(Object::toString).toList()));
        var players = data.putArray("players");
        for (var card : state.cards()) {
            var view = players.addObject().put("userId", id(card.userId())).put("forfeited", card.forfeited())
                    .put("upperSubtotal", card.upperSubtotal()).put("upperBonus", card.upperBonus())
                    .put("total", card.total());
            var scores = view.putObject("scores");
            for (var category : DiceLedgerScoring.Category.values()) {
                Integer value = card.scores().get(category.ordinal());
                if (value == null) { scores.putNull(category.name()); } else { scores.put(category.name(), value); }
            }
        }
        data.set("dice", mapper.valueToTree(state.dice()));
        if (state.lastScored() == null) { data.putNull("lastScored"); }
        else {
            var scored = state.lastScored();
            data.putObject("lastScored").put("userId", id(scored.userId())).put("category", scored.category())
                    .put("points", scored.points()).put("auto", scored.auto()).put("turnId", scored.turnId());
        }
        return data;
    }

    // 다인전 복구 형식(원카드·다리)과 같이 공개 상태와 빈 개인 상태를 함께 보낸다.
    private ObjectNode recoveryState(Snapshot state) {
        ObjectNode data = mapper.createObjectNode();
        data.set("publicState", publicState(state));
        data.set("privateState", mapper.createObjectNode());
        return data;
    }

    private String id(Long value) { return value == null ? null : value.toString(); }

    private void publish(List<Object> notices) {
        for (Object notice : notices) {
            try { events.accept(notice); }
            catch (RuntimeException exception) {
                log.warn("주사위 장부 상태 알림 전달 실패 type={}", notice.getClass().getSimpleName());
            }
        }
    }
}
