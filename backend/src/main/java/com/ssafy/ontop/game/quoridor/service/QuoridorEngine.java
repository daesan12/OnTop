package com.ssafy.ontop.game.quoridor.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameForfeitReceipts;
import com.ssafy.ontop.game.action.GameForfeitResult;
import com.ssafy.ontop.game.engine.GameEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Orientation;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Wall;
import com.ssafy.ontop.game.quoridor.domain.QuoridorMatch;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameLifecycle;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateView;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.random.RandomGenerator;

/** 공통 라우터·인증·복구·종료 이벤트를 재사용하며 예약금과 잔액은 변경하지 않는다. */
public final class QuoridorEngine implements GameEngine {
    public static final String GAME_CODE = "QUORIDOR";
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Consumer<Object> events;
    private final GameEngineRouter router;
    private final RandomGenerator random;
    private final Map<String, Entry> games = new HashMap<>();
    private final Map<Long, String> latest = new HashMap<>();
    private final GameLifecycle lifecycle = new GameLifecycle();
    private final GameForfeitReceipts forfeits = new GameForfeitReceipts();

    public QuoridorEngine(ObjectMapper mapper, Clock clock, Consumer<Object> events, GameEngineRouter router,
            RandomGenerator random) {
        this.mapper = mapper;
        this.clock = clock;
        this.events = events;
        this.router = router;
        this.random = random;
    }

    /** 전원 예약 커밋 확인 후에만 공통 시작 서비스가 호출한다. 좌석 순서는 북·동·남·서 순서다. */
    public synchronized void create(String gameId, String tableId, List<Long> players) {
        if (gameId == null || gameId.isBlank() || gameId.length() > 120 || tableId == null || tableId.isBlank()
                || tableId.length() > 120 || players == null || !List.of(2, 4).contains(players.size())) {
            throw new IllegalArgumentException("쿼리도 경기·테이블·참가자를 확인해주세요.");
        }
        Entry previous = games.get(gameId);
        if (previous != null) {
            if (!previous.tableId.equals(tableId) || !previous.match.users().equals(players)) {
                throw new IllegalStateException("기존 쿼리도 경기와 다른 생성 요청입니다.");
            }
            return;
        }
        QuoridorMatch match = new QuoridorMatch(players, random.nextInt(players.size()));
        router.register(this, gameId, tableId, players);
        games.put(gameId, new Entry(gameId, tableId, match));
        for (long userId : players) {
            latest.put(userId, gameId);
        }
    }

    @Override
    public GameActionResult apply(GameActionCommand command) {
        List<Object> notices = new ArrayList<>();
        GameActionResult result;
        synchronized (this) {
            Entry entry = player(command.userId(), command.gameId());
            if (command.actionId() == null || !command.actionId().matches("[A-Za-z0-9-]{1,64}")) {
                throw new Rejected(Rejection.INVALID_ACTION);
            }
            String key = command.userId() + ":" + command.actionId();
            Receipt receipt = entry.receipts.get(key);
            if (receipt != null) {
                if (receipt.expectedVersion() != command.expectedVersion()
                        || !receipt.input().equals(command.input())) {
                    throw new Rejected(Rejection.ACTION_ID_CONFLICT);
                }
                return receipt.result();
            }
            if (entry.match.endedAt() != null) {
                throw new Rejected(Rejection.GAME_FINISHED);
            }
            if (entry.match.version() != command.expectedVersion()) {
                throw new Rejected(Rejection.STALE_VERSION);
            }
            JsonNode input = command.input();
            if (input == null || !input.isObject() || !input.path("x").isIntegralNumber()
                    || !input.path("y").isIntegralNumber() || !input.path("x").canConvertToInt()
                    || !input.path("y").canConvertToInt()) {
                throw new Rejected(Rejection.INVALID_ACTION);
            }
            long before = entry.match.version();
            int x = input.path("x").intValue();
            int y = input.path("y").intValue();
            switch (input.path("kind").asText()) {
                case "move" -> {
                    if (input.size() != 3 || x < 0 || x > 8 || y < 0 || y > 8) {
                        throw new Rejected(Rejection.INVALID_ACTION);
                    }
                    entry.match.move(command.userId(), x, y, clock.instant());
                }
                case "wall" -> {
                    String orientation = input.path("orientation").asText();
                    if (input.size() != 4 || x < 0 || x > 7 || y < 0 || y > 7
                            || !List.of("HORIZONTAL", "VERTICAL").contains(orientation)) {
                        throw new Rejected(Rejection.INVALID_ACTION);
                    }
                    entry.match.place(command.userId(), new Wall(x, y, Orientation.valueOf(orientation)));
                }
                default -> throw new Rejected(Rejection.INVALID_ACTION);
            }
            result = new GameActionResult(command.userId(), command.gameId(), command.actionId(), entry.match.version());
            entry.receipts.put(key, new Receipt(command.expectedVersion(), input.deepCopy(), result));
            collect(entry, before, notices);
        }
        notices.forEach(events);
        return result;
    }

    @Override
    public synchronized Optional<GameStateView> load(long userId, String gameId) {
        Entry entry = games.get(gameId);
        if (userId <= 0 || entry == null) {
            return Optional.empty();
        }
        return Optional.of(new GameStateView(userId, gameId, entry.match.version(),
                entry.match.users().contains(userId) ? GameStateView.Role.PLAYER : GameStateView.Role.SPECTATOR,
                publicState(entry), mapper.createObjectNode(), entry.tableId));
    }

    @Override
    public synchronized Optional<GameRecoverySnapshot> load(long userId) {
        Entry entry = games.get(latest.get(userId));
        if (entry == null) {
            return Optional.empty();
        }
        ObjectNode state = mapper.createObjectNode();
        state.set("publicState", publicState(entry));
        state.set("privateState", mapper.createObjectNode());
        boolean active = entry.match.players().stream().anyMatch(p -> p.userId() == userId && p.active());
        return Optional.of(new GameRecoverySnapshot(userId, entry.gameId, entry.match.users().size(),
                entry.match.version(), entry.match.endedAt() != null ? GameRecoverySnapshot.Phase.FINISHED
                        : active ? GameRecoverySnapshot.Phase.PLAYING : GameRecoverySnapshot.Phase.ELIMINATED, state));
    }

    @Override
    public GameForfeitResult forfeit(GameForfeitCommand command) {
        List<Object> notices = new ArrayList<>();
        GameForfeitResult result;
        synchronized (this) {
            Entry entry = player(command.userId(), command.gameId());
            if (command.actionId() == null || !command.actionId().matches("[A-Za-z0-9-]{1,64}")) {
                throw new Rejected(Rejection.INVALID_ACTION);
            }
            GameForfeitResult previous = forfeits.previous(command);
            if (previous != null) {
                return previous;
            }
            if (entry.match.endedAt() != null) {
                throw new Rejected(Rejection.GAME_FINISHED);
            }
            if (!depart(entry, command.userId(), GameDepartureReason.EXPLICIT_LEAVE, clock.instant(), notices)) {
                throw new Rejected(Rejection.NOT_ACTIVE);
            }
            result = forfeits.accepted(command, entry.match.version());
        }
        notices.forEach(events);
        return result;
    }

    @Override
    public void graceExpired(GraceExpiration command) {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            Entry entry = games.get(command.gameId());
            if (entry == null || clock.instant().isBefore(command.deadline())
                    || (command.action() != Action.FORFEIT && command.action() != Action.ELIMINATE)) {
                return;
            }
            depart(entry, command.userId(), command.reason(), command.deadline(), notices);
        }
        notices.forEach(events);
    }

    private boolean depart(Entry entry, long userId, GameDepartureReason reason, Instant now, List<Object> notices) {
        long before = entry.match.version();
        if (!entry.match.forfeit(userId, now)) {
            return false;
        }
        lifecycle.left(entry.gameId, entry.tableId, GAME_CODE, entry.match.version(), userId, reason, now,
                entry.match.users().size(), notices);
        collect(entry, before, notices);
        return true;
    }

    private void collect(Entry entry, long before, List<Object> notices) {
        if (before == entry.match.version()) {
            return;
        }
        notices.add(new GameStateChanged(entry.gameId, entry.match.version()));
        if (entry.match.endedAt() != null && !entry.finished) {
            entry.finished = true;
            router.finished(this, entry.gameId);
            notices.add(lifecycle.finished(entry.gameId, entry.tableId, GAME_CODE, entry.match.version(),
                    entry.match.users(), List.of(entry.match.winnerUserId()), entry.match.endReason(),
                    entry.match.endedAt(), notices));
        }
    }

    private Entry player(long userId, String gameId) {
        Entry entry = games.get(gameId);
        if (entry == null || !entry.match.users().contains(userId)) {
            throw new Rejected(Rejection.ACCESS_DENIED);
        }
        return entry;
    }

    private ObjectNode publicState(Entry entry) {
        QuoridorMatch match = entry.match;
        if (entry.cached != null && entry.cached.path("version").asLong() == match.version()) {
            return entry.cached.deepCopy();
        }
        ObjectNode state = mapper.createObjectNode();
        state.put("gameCode", GAME_CODE).put("boardSize", 9).put("version", match.version())
                .put("status", match.endedAt() == null ? "PLAYING" : "FINISHED")
                .put("turnUserId", match.turnUserId() == null ? null : match.turnUserId().toString())
                .putNull("turnDeadline").put("endReason", match.endReason())
                .put("endedAt", match.endedAt() == null ? null : match.endedAt().toString());
        state.set("winnerUserIds", mapper.valueToTree(match.winnerUserId() == null ? List.of()
                : List.of(match.winnerUserId().toString())));
        var players = state.putArray("players");
        for (QuoridorMatch.Player player : match.players()) {
            players.addObject().put("userId", Long.toString(player.userId())).put("x", player.x()).put("y", player.y())
                    .put("goal", player.goal().name()).put("wallsRemaining", player.wallsRemaining())
                    .put("active", player.active());
        }
        state.set("walls", mapper.valueToTree(match.walls()));
        state.set("legalMoves", mapper.valueToTree(match.legalMoves()));
        state.set("legalWalls", mapper.valueToTree(match.legalWalls()));
        entry.cached = state;
        return state.deepCopy();
    }

    private record Receipt(long expectedVersion, JsonNode input, GameActionResult result) { }

    private static final class Entry {
        private final String gameId;
        private final String tableId;
        private final QuoridorMatch match;
        private final Map<String, Receipt> receipts = new HashMap<>();
        private ObjectNode cached;
        private boolean finished;

        private Entry(String gameId, String tableId, QuoridorMatch match) {
            this.gameId = gameId;
            this.tableId = tableId;
            this.match = match;
        }
    }
}
