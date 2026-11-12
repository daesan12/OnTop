package com.ssafy.ontop.game.stonerumble.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameForfeitReceipts;
import com.ssafy.ontop.game.action.GameForfeitResult;
import com.ssafy.ontop.game.engine.GameEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameLifecycle;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateView;
import com.ssafy.ontop.game.stonerumble.domain.StoneRumbleMatch;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

public final class StoneRumbleEngine implements GameEngine {
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Consumer<Object> events;
    private final GameEngineRouter router;
    private final Map<String, Entry> games = new ConcurrentHashMap<>();
    private final Map<Long, String> latest = new ConcurrentHashMap<>();

    public StoneRumbleEngine(ObjectMapper mapper, Clock clock, Consumer<Object> events, GameEngineRouter router) {
        this.mapper = mapper;
        this.clock = clock;
        this.events = events;
        this.router = router;
    }

    public void create(String gameId, String tableId, List<Long> players) {
        synchronized (games) {
            Entry existing = games.get(gameId);
            if (existing != null) {
                if (!existing.tableId.equals(tableId) || !existing.players.equals(players)) {
                    throw new IllegalArgumentException("다른 경기의 ID입니다.");
                }
                return;
            }
            Entry entry = new Entry(gameId, tableId, players, clock.millis());
            router.register(this, gameId, tableId, players, 8);
            games.put(gameId, entry);
            players.forEach(id -> latest.put(id, gameId));
        }
        publish(List.of(new GameStateChanged(gameId, 1)));
    }

    @Override
    public GameActionResult apply(GameActionCommand command) {
        Entry entry = player(command.userId(), command.gameId());
        GameActionResult result;
        synchronized (entry) {
            String key = command.userId() + ":" + command.actionId();
            Receipt previous = entry.receipts.get(key);
            if (previous != null) {
                if (!previous.command.equals(command)) {
                    throw new Rejected(Rejection.ACTION_ID_CONFLICT);
                }
                return previous.result;
            }
            if (entry.match.finished()) {
                throw new Rejected(Rejection.GAME_FINISHED);
            }
            // 실시간 입력은 왕복 지연을 허용하되 서버가 실제 발급한 최근 500ms 버전만 받는다.
            Long issuedAt = entry.versions.get(command.expectedVersion());
            if (issuedAt == null || clock.millis() - issuedAt > 500) {
                throw new Rejected(Rejection.STALE_VERSION);
            }
            var input = command.input();
            boolean readiness = input.path("kind").asText().equals("scene_ready");
            if (readiness && !input.path("ready").isBoolean()) { throw new Rejected(Rejection.INVALID_ACTION); }
            if (!readiness && (!input.path("kind").asText().equals("control") || !input.path("seq").isIntegralNumber() || !input.path("seq").canConvertToLong()
                    || !input.path("jump").isBoolean() || !input.path("fire").isBoolean()
                    || input.has("slide") && !input.path("slide").isBoolean()
                    || !List.of("x", "z", "aimX", "aimZ").stream().allMatch(k -> input.path(k).isNumber()))) {
                throw new Rejected(Rejection.INVALID_ACTION);
            }
            long sequence = input.path("seq").asLong();
            if (!readiness && (sequence <= entry.sequences.getOrDefault(command.userId(), -1L) || sequence > 9_007_199_254_740_991L)) {
                throw new Rejected(Rejection.INVALID_ACTION);
            }
            try {
                if (readiness) {
                    entry.match.sceneReady(Long.toString(command.userId()), input.path("ready").asBoolean(), clock.millis());
                } else {
                    entry.match.control(Long.toString(command.userId()), input.path("x").asDouble(),
                        input.path("z").asDouble(), input.path("aimX").asDouble(), input.path("aimZ").asDouble(),
                        input.path("jump").asBoolean(), input.path("fire").asBoolean(), input.path("slide").asBoolean());
                }
            } catch (IllegalArgumentException rejected) {
                throw new Rejected(switch (rejected.getMessage()) {
                    case "NOT_ACTIVE" -> Rejection.NOT_ACTIVE;
                    case "GAME_FINISHED" -> Rejection.GAME_FINISHED;
                    default -> Rejection.INVALID_ACTION;
                });
            }
            if (!readiness) { entry.sequences.put(command.userId(), sequence); }
            bump(entry);
            result = new GameActionResult(command.userId(), command.gameId(), command.actionId(), entry.version);
            entry.receipts.put(key, new Receipt(command, result));
            if (entry.receipts.size() > 1024) {
                entry.receipts.remove(entry.receipts.keySet().iterator().next());
            }
        }
        return result;
    }

    @Override
    public Optional<GameStateView> load(long userId, String gameId) {
        Entry entry = games.get(gameId);
        if (entry == null || userId <= 0) {
            return Optional.empty();
        }
        synchronized (entry) {
            if (entry.publicState == null) {
                entry.publicState = mapper.valueToTree(entry.match.snapshot());
                entry.publicState.put("gameId", gameId).put("tableId", entry.tableId);
            }
            // 같은 틱의 8인 조회는 공개 스냅샷을 재사용하되, 수신자끼리 변경이 새지 않도록 복사한다.
            ObjectNode state = entry.publicState.deepCopy();
            return Optional.of(new GameStateView(userId, gameId, entry.version,
                    entry.players.contains(userId) ? GameStateView.Role.PLAYER : GameStateView.Role.SPECTATOR,
                    state, mapper.createObjectNode(), entry.tableId));
        }
    }

    @Override
    public Optional<GameRecoverySnapshot> load(long userId) {
        String gameId = latest.get(userId);
        if (gameId == null) {
            return Optional.empty();
        }
        GameStateView view = load(userId, gameId).orElseThrow();
        ObjectNode data = mapper.createObjectNode();
        data.set("publicState", view.publicState());
        data.set("privateState", view.privateState());
        return Optional.of(new GameRecoverySnapshot(userId, gameId, view.publicState().path("players").size(), view.version(),
                view.publicState().path("status").asText().equals("FINISHED")
                        ? GameRecoverySnapshot.Phase.FINISHED : GameRecoverySnapshot.Phase.PLAYING, data));
    }

    @Override
    public GameForfeitResult forfeit(GameForfeitCommand command) {
        Entry entry = player(command.userId(), command.gameId());
        if (command.actionId() == null || !command.actionId().matches("[A-Za-z0-9-]{1,64}")) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        List<Object> notices = new ArrayList<>();
        GameForfeitResult result;
        synchronized (entry) {
            result = entry.forfeits.previous(command);
            if (result != null) {
                return result;
            }
            if (entry.match.finished()) {
                throw new Rejected(Rejection.GAME_FINISHED);
            }
            depart(entry, command.userId(), GameDepartureReason.EXPLICIT_LEAVE, clock.millis(), notices);
            result = entry.forfeits.accepted(command, entry.version);
        }
        publish(notices);
        return result;
    }

    @Override
    public void graceExpired(GraceExpiration command) {
        Entry entry = games.get(command.gameId());
        if (entry == null || !entry.players.contains(command.userId()) || clock.instant().isBefore(command.deadline())) {
            return;
        }
        List<Object> notices = new ArrayList<>();
        synchronized (entry) {
            if (!entry.match.finished()) {
                depart(entry, command.userId(), command.reason(), clock.millis(), notices);
            }
        }
        publish(notices);
    }

    private void depart(Entry entry, long userId, GameDepartureReason reason, long at, List<Object> notices) {
        entry.match.depart(Long.toString(userId), at);
        bump(entry);
        entry.lifecycle.left(entry.gameId, entry.tableId, "STONE_RUMBLE", entry.version, userId,
                reason, Instant.ofEpochMilli(at), entry.players.size(), notices);
        notices.add(new GameStateChanged(entry.gameId, entry.version));
        collectFinish(entry, notices);
    }

    public void tick() {
        for (Entry entry : games.values()) {
            List<Object> notices = new ArrayList<>();
            synchronized (entry) {
                if (entry.finished) {
                    continue;
                }
                entry.publicState = null;
                entry.match.advance(clock.millis());
                if (clock.millis() - entry.publishedAt >= 100 || entry.match.finished()) {
                    bump(entry);
                    entry.publishedAt = clock.millis();
                    notices.add(new GameStateChanged(entry.gameId, entry.version));
                }
                collectFinish(entry, notices);
            }
            publish(notices);
        }
    }

    private void collectFinish(Entry entry, List<Object> notices) {
        if (!entry.finished && entry.match.finished()) {
            entry.finished = true;
            router.finished(this, entry.gameId);
            var snapshot = entry.match.snapshot();
            var finished = entry.lifecycle.finished(entry.gameId, entry.tableId, "STONE_RUMBLE", entry.version,
                    entry.players, snapshot.winnerUserIds().stream().map(Long::parseLong).toList(),
                    snapshot.endReason(), Instant.ofEpochMilli(snapshot.endedAt()), notices);
            var outcomes = finished.participants().stream().map(p -> {
                var placement = snapshot.players().stream().filter(player -> player.userId().equals(Long.toString(p.userId())))
                        .findFirst().orElseThrow();
                return new com.ssafy.ontop.game.result.GameFinished.Participant(p.userId(), p.result(), p.leaveReason(),
                        p.leftAt(), placement.rank(), placement.rank() == null ? null : placement.rewardCoins());
            }).toList();
            notices.add(new com.ssafy.ontop.game.result.GameFinished(finished.eventId(), finished.gameId(), finished.tableId(),
                    finished.gameCode(), finished.version(), outcomes, finished.endReason(), finished.endedAt()));
        }
    }

    private void bump(Entry entry) {
        entry.publicState = null;
        entry.version++;
        long time = clock.millis();
        entry.versions.put(entry.version, time);
        entry.versions.entrySet().removeIf(v -> time - v.getValue() > 500);
    }

    private Entry player(long userId, String gameId) {
        Entry entry = games.get(gameId);
        if (entry == null || !entry.players.contains(userId)) {
            throw new Rejected(Rejection.ACCESS_DENIED);
        }
        return entry;
    }

    private void publish(List<Object> notices) {
        for (Object notice : notices) {
            try {
                events.accept(notice);
            } catch (RuntimeException exception) {
                org.slf4j.LoggerFactory.getLogger(StoneRumbleEngine.class)
                        .warn("돌탑 경기 알림 전달 실패", exception);
            }
        }
    }

    private record Receipt(GameActionCommand command, GameActionResult result) { }

    private static final class Entry {
        final String gameId, tableId;
        final List<Long> players;
        final StoneRumbleMatch match;
        final GameLifecycle lifecycle = new GameLifecycle();
        final GameForfeitReceipts forfeits = new GameForfeitReceipts();
        final Map<String, Receipt> receipts = new LinkedHashMap<>();
        final Map<Long, Long> versions = new HashMap<>();
        final Map<Long, Long> sequences = new HashMap<>();
        long version = 1, publishedAt;
        ObjectNode publicState;
        boolean finished;
        Entry(String gameId, String tableId, List<Long> players, long now) {
            this.gameId = gameId;
            this.tableId = tableId;
            this.players = List.copyOf(players);
            this.match = new StoneRumbleMatch(players, now);
            this.versions.put(1L, now);
        }
    }
}
