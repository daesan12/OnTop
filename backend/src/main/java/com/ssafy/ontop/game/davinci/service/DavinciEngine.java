package com.ssafy.ontop.game.davinci.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameForfeitReceipts;
import com.ssafy.ontop.game.action.GameForfeitResult;
import com.ssafy.ontop.game.davinci.domain.CodeTile;
import com.ssafy.ontop.game.davinci.domain.DavinciMatch;
import com.ssafy.ontop.game.engine.GameEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
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

/** 공통 인증·WS·복구·정산 계약을 재사용하는 서버 권위 엔진. */
public final class DavinciEngine implements GameEngine {
    private static final Logger log = LoggerFactory.getLogger(DavinciEngine.class);
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Consumer<Object> events;
    private final GameEngineRouter router;
    private final Consumer<List<CodeTile>> shuffle;
    private final Map<String, DavinciMatch> games = new HashMap<>();
    private final Map<Long, String> latest = new HashMap<>();
    private final GameLifecycle lifecycle = new GameLifecycle();
    private final GameForfeitReceipts forfeits = new GameForfeitReceipts();

    public DavinciEngine(ObjectMapper mapper, Clock clock, Consumer<Object> events, GameEngineRouter router,
            Consumer<List<CodeTile>> shuffle) {
        this.mapper = mapper;
        this.clock = clock;
        this.events = events;
        this.router = router;
        this.shuffle = shuffle;
    }

    public synchronized void create(String gameId, String tableId, List<Long> players) {
        DavinciMatch existing = games.get(gameId);
        if (existing != null) {
            if (!existing.tableId().equals(tableId) || !existing.players().equals(players)) {
                throw new IllegalStateException("기존 흑백수사 경기와 다른 생성 요청입니다.");
            }
            return;
        }
        List<CodeTile> deck = CodeTile.standard();
        shuffle.accept(deck);
        DavinciMatch match = new DavinciMatch(gameId, tableId, players, deck, clock.instant());
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
            DavinciMatch match = authorized(command.userId(), command.gameId());
            long before = match.version();
            boolean ended = match.endedAt() != null;
            match.expire(clock.instant());
            try { result = match.apply(command, clock.instant()); }
            catch (Rejected exception) { rejected = exception; }
            collect(match, before, ended, notices);
        }
        publish(notices);
        if (rejected != null) { throw rejected; }
        return result;
    }

    @Override
    public Optional<GameStateView> load(long userId, String gameId) {
        tick();
        synchronized (this) {
            DavinciMatch match = games.get(gameId);
            if (userId <= 0 || match == null) { return Optional.empty(); }
            boolean player = match.players().contains(userId);
            return Optional.of(new GameStateView(userId, gameId, match.version(), player
                    ? GameStateView.Role.PLAYER : GameStateView.Role.SPECTATOR,
                    publicState(match), player ? privateState(match, userId) : mapper.createObjectNode(), match.tableId()));
        }
    }

    /** 공원 구경꾼에게도 보내는 공개 투영. 개인 상태와 준비 중 타일 순서는 포함하지 않는다. */
    public synchronized Map<String, com.fasterxml.jackson.databind.JsonNode> tablePresentations() {
        Map<String, com.fasterxml.jackson.databind.JsonNode> result = new HashMap<>();
        for (DavinciMatch match : games.values()) {
            if (match.endedAt() != null) { continue; }
            ObjectNode view = mapper.createObjectNode().put("gameId", match.gameId());
            view.set("state", publicState(match));
            result.put(match.tableId(), view);
        }
        return Map.copyOf(result);
    }

    @Override
    public Optional<GameRecoverySnapshot> load(long userId) {
        tick();
        synchronized (this) {
            DavinciMatch match = games.get(latest.get(userId));
            if (match == null) { return Optional.empty(); }
            ObjectNode state = mapper.createObjectNode();
            state.set("publicState", publicState(match));
            state.set("privateState", privateState(match, userId));
            return Optional.of(new GameRecoverySnapshot(userId, match.gameId(), match.players().size(), match.version(),
                    match.endedAt() != null ? GameRecoverySnapshot.Phase.FINISHED
                            : match.active(userId) ? GameRecoverySnapshot.Phase.PLAYING
                                    : GameRecoverySnapshot.Phase.ELIMINATED, state));
        }
    }

    @Override
    public GameForfeitResult forfeit(GameForfeitCommand command) {
        List<Object> notices = new ArrayList<>();
        GameForfeitResult result;
        synchronized (this) {
            DavinciMatch match = authorized(command.userId(), command.gameId());
            GameForfeitResult previous = forfeits.previous(command);
            if (previous != null) { return previous; }
            if (match.endedAt() != null) { throw new Rejected(Rejection.GAME_FINISHED); }
            if (!match.active(command.userId())) { throw new Rejected(Rejection.NOT_ACTIVE); }
            long before = match.version();
            match.forfeit(command.userId(), clock.instant());
            lifecycle.left(match.gameId(), match.tableId(), DavinciMatch.GAME_CODE, match.version(), command.userId(),
                    com.ssafy.ontop.game.result.GameDepartureReason.EXPLICIT_LEAVE, clock.instant(),
                    match.players().size(), notices);
            collect(match, before, false, notices);
            result = forfeits.accepted(command, match.version());
        }
        publish(notices);
        return result;
    }

    @Override
    public void graceExpired(GraceExpiration command) {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            DavinciMatch match = games.get(command.gameId());
            if (match == null || clock.instant().isBefore(command.deadline())
                    || (command.action() != Action.FORFEIT && command.action() != Action.ELIMINATE)) { return; }
            long before = match.version();
            boolean ended = match.endedAt() != null;
            if (match.forfeit(command.userId(), command.deadline())) {
                lifecycle.left(match.gameId(), match.tableId(), DavinciMatch.GAME_CODE, match.version(), command.userId(),
                        command.reason(), command.deadline(), match.players().size(), notices);
            }
            collect(match, before, ended, notices);
        }
        publish(notices);
    }

    public void tick() {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            for (DavinciMatch match : games.values()) {
                long before = match.version();
                boolean ended = match.endedAt() != null;
                match.expire(clock.instant());
                collect(match, before, ended, notices);
            }
        }
        publish(notices);
    }

    private DavinciMatch authorized(long userId, String gameId) {
        DavinciMatch match = games.get(gameId);
        if (match == null || !match.players().contains(userId)) { throw new Rejected(Rejection.ACCESS_DENIED); }
        return match;
    }

    private void collect(DavinciMatch match, long before, boolean wasEnded, List<Object> notices) {
        if (before == match.version()) { return; }
        notices.add(new GameStateChanged(match.gameId(), match.version()));
        if (!wasEnded && match.endedAt() != null) {
            router.finished(this, match.gameId());
            notices.add(lifecycle.finished(match.gameId(), match.tableId(), DavinciMatch.GAME_CODE, match.version(),
                    match.players(), match.winners(), "LAST_PLAYER_STANDING", match.endedAt(), notices));
        }
    }

    private ObjectNode publicState(DavinciMatch match) {
        // 서버 시각 기준으로 늦게 접속한 클라이언트도 섞기 연출을 다시 재생하지 않는다.
        ObjectNode data = mapper.createObjectNode();
        data.put("gameCode", DavinciMatch.GAME_CODE).put("status", match.endedAt() == null ? "PLAYING" : "FINISHED")
                .put("stage", match.stage().name()).put("version", match.version())
                .put("turnUserId", match.turnUserId() == null ? null : match.turnUserId().toString())
                .put("turnDeadline", match.deadline() == null ? null : match.deadline().toString())
                .put("openingStartedAt", match.openingStartedAt().toString())
                .put("endedAt", match.endedAt() == null ? null : match.endedAt().toString())
                .put("endReason", match.endedAt() == null ? null : "LAST_PLAYER_STANDING");
        data.set("winnerUserIds", mapper.valueToTree(match.winners().stream().map(Object::toString).toList()));
        var players = data.putArray("players");
        for (int seat = 0; seat < match.players().size(); seat++) {
            long user = match.players().get(seat);
            var player = players.addObject().put("userId", Long.toString(user)).put("seat", seat)
                    .put("active", match.active(user)).put("forfeited", match.forfeited(user)).put("ready", match.ready(user))
                    .put("tileCount", match.hand(user).size());
            var tiles = player.putArray("tiles");
            // 초기 조커 위치를 결정하는 동안에는 상대의 정렬 전 순서를 내보내지 않는다.
            if (match.stage() != DavinciMatch.Stage.SETUP) {
                for (CodeTile tile : match.hand(user)) {
                    boolean revealed = match.revealed().contains(tile.id());
                    var view = tiles.addObject().put("id", tile.id()).put("color", tile.color().name())
                            .put("revealed", revealed);
                    if (revealed) { view.put("value", tile.value()); } else { view.putNull("value"); }
                }
            }
        }
        var supply = data.putArray("supply");
        for (CodeTile tile : match.pool()) { supply.addObject().put("id", tile.id()).put("color", tile.color().name()); }
        DavinciMatch.Event event = match.lastEvent();
        if (event == null) { data.putNull("lastEvent"); }
        else {
            var view = data.putObject("lastEvent").put("kind", event.kind()).put("actorUserId", Long.toString(event.actor()))
                    .put("targetUserId", event.target() == null ? null : event.target().toString()).put("tileId", event.tileId());
            if (event.value() == null) { view.putNull("value"); } else { view.put("value", event.value()); }
            if (event.correct() == null) { view.putNull("correct"); } else { view.put("correct", event.correct()); }
        }
        return data;
    }

    private ObjectNode privateState(DavinciMatch match, long user) {
        ObjectNode data = mapper.createObjectNode().put("userId", Long.toString(user));
        var tiles = data.putArray("tiles");
        for (CodeTile tile : match.hand(user)) {
            tiles.addObject().put("id", tile.id()).put("color", tile.color().name()).put("value", tile.value())
                    .put("revealed", match.revealed().contains(tile.id()));
        }
        data.set("unplacedJokerIds", mapper.valueToTree(match.unplacedJokers(user)));
        data.set("validPositions", mapper.valueToTree(match.validPositions(user)));
        CodeTile pending = match.pendingTile(user);
        if (pending == null) { data.putNull("pendingTile"); }
        else { data.putObject("pendingTile").put("id", pending.id()).put("color", pending.color().name())
                .put("value", pending.value()).put("revealed", false); }
        return data;
    }

    private void publish(List<Object> notices) {
        for (Object notice : notices) {
            try { events.accept(notice); }
            catch (RuntimeException exception) { log.error("흑백수사 알림 전달 실패", exception); }
        }
    }
}
