package com.ssafy.ontop.game.alkkagi.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameForfeitReceipts;
import com.ssafy.ontop.game.action.GameForfeitResult;
import com.ssafy.ontop.game.alkkagi.domain.AlkkagiMatch;
import com.ssafy.ontop.game.alkkagi.domain.AlkkagiSettings;
import com.ssafy.ontop.game.engine.GameEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameLifecycle;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateView;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.function.Consumer;

/** 기존 엔진 라우터·복구·기권·종료 계약을 구현한다. DB 예약/정산 구현은 소유하지 않는다. */
public final class AlkkagiEngine implements GameEngine {
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Consumer<Object> events;
    private final GameEngineRouter router;
    private final Map<String, Entry> games = new ConcurrentHashMap<>();
    private final Map<Long, String> latest = new ConcurrentHashMap<>();

    public AlkkagiEngine(ObjectMapper mapper, Clock clock, Consumer<Object> events, GameEngineRouter router) {
        this.mapper = mapper; this.clock = clock; this.events = events; this.router = router;
    }

    /** 전원 예약 커밋 확인 후 기존 시작 연결부에서 호출한다. 새 예약/차감을 수행하지 않는다. */
    public void startCommitted(GameStartCommand command, GameStartResult result) {
        if (command == null || result == null || !"ALKKAGI".equals(command.gameCode())
                || command.participants().size() != 2 || !result.isReservationCommitted(command))
            throw new IllegalArgumentException("알까기 예약 커밋을 확인해주세요.");
        var players = command.participants().stream().map(p -> {
            if (!p.userId().matches("[1-9][0-9]{0,18}")) throw new IllegalArgumentException("회원 식별자를 확인해주세요.");
            return Long.parseLong(p.userId());
        }).toList();
        create(result.gameSessionId(), command.tableId(), players.get(0), players.get(1));
    }

    public void create(String gameId, String tableId, long red, long green) {
        if (gameId == null || gameId.isBlank() || gameId.length() > 120 || tableId == null || tableId.isBlank()
                || red <= 0 || green <= 0 || red == green) throw new IllegalArgumentException("경기 식별자·참가자를 확인해주세요.");
        synchronized (games) {
            Entry previous = games.get(gameId);
            if (previous != null) {
                if (!previous.tableId.equals(tableId) || !previous.players.equals(List.of(red, green)))
                    throw new IllegalStateException("기존 알까기 경기와 다릅니다.");
                return;
            }
            var match = new AlkkagiMatch(AlkkagiSettings.provisional());
            var entry = new Entry(gameId, tableId, List.of(red, green), match);
            router.register(this, gameId, tableId, entry.players);
            match.start(clock.millis());
            games.put(gameId, entry); latest.put(red, gameId); latest.put(green, gameId);
        }
        publish(List.of(new GameStateChanged(gameId, 1)));
    }

    @Override
    public GameActionResult apply(GameActionCommand command) {
        Entry e = player(command.userId(), command.gameId());
        var notices = new ArrayList<Object>();
        GameActionResult result;
        Rejected rejected = null;
        synchronized (e) {
            long before = e.match.snapshot(0).version();
            try {
                long accepted = AlkkagiInputs.apply(e.match, e.players.indexOf(command.userId()), command.actionId(),
                        command.expectedVersion(), command.input(), clock.millis());
                result = new GameActionResult(command.userId(), command.gameId(), command.actionId(), accepted);
            } catch (IllegalArgumentException failure) {
                rejected = reject(failure.getMessage()); result = null;
            }
            collect(e, before, notices);
        }
        publish(notices);
        if (rejected != null) throw rejected;
        return result;
    }

    @Override
    public Optional<GameStateView> load(long userId, String gameId) {
        Entry e = entry(gameId);
        if (userId <= 0 || e == null) return Optional.empty();
        var notices = new ArrayList<Object>();
        GameStateView view;
        synchronized (e) {
            long before = e.match.snapshot(0).version(); e.match.checkDeadlines(clock.millis()); collect(e, before, notices);
            int actor = e.players.indexOf(userId);
            view = new GameStateView(userId, gameId, e.match.snapshot(0).version(), actor < 0
                    ? GameStateView.Role.SPECTATOR : GameStateView.Role.PLAYER, publicState(e),
                    actor < 0 ? mapper.createObjectNode() : privateState(e, actor), e.tableId);
        }
        publish(notices); return Optional.of(view);
    }

    @Override
    public Optional<GameRecoverySnapshot> load(long userId) {
        String gameId;
        synchronized (games) { gameId = latest.get(userId); }
        if (gameId == null) return Optional.empty();
        var view = load(userId, gameId).orElseThrow();
        ObjectNode data = mapper.createObjectNode();
        data.set("publicState", view.publicState()); data.set("privateState", view.privateState());
        return Optional.of(new GameRecoverySnapshot(userId, gameId, 2, view.version(),
                view.publicState().path("status").asText().equals("FINISHED")
                        ? GameRecoverySnapshot.Phase.FINISHED : GameRecoverySnapshot.Phase.PLAYING, data));
    }

    @Override
    public GameForfeitResult forfeit(GameForfeitCommand command) {
        Entry e = player(command.userId(), command.gameId());
        if (command.actionId() == null || !command.actionId().matches("[A-Za-z0-9-]{1,64}")) throw new Rejected(Rejection.INVALID_ACTION);
        var notices = new ArrayList<Object>(); GameForfeitResult result; Rejected rejected = null;
        synchronized (e) {
            var old = e.forfeits.previous(command); if (old != null) return old;
            long before = e.match.snapshot(0).version();
            try {
                // 물리 종료와 이탈 이벤트를 같은 판정 시각으로 만든다. Instant 나노초를 섞으면
                // leftAt > endedAt이 되어 정상 기권도 DB 종료 검증에서 거절된다.
                long decidedAt = clock.millis();
                e.match.forfeit(e.players.indexOf(command.userId()), command.actionId(), decidedAt);
                e.lifecycle.left(e.gameId, e.tableId, "ALKKAGI", e.match.snapshot(0).version(), command.userId(),
                        GameDepartureReason.EXPLICIT_LEAVE, Instant.ofEpochMilli(decidedAt), 2, notices);
                result = e.forfeits.accepted(command, e.match.snapshot(0).version());
            } catch (IllegalArgumentException failure) { rejected = reject(failure.getMessage()); result = null; }
            collect(e, before, notices);
        }
        publish(notices); if (rejected != null) throw rejected; return result;
    }

    @Override
    public void graceExpired(GraceExpiration command) {
        Entry e = entry(command.gameId());
        if (e == null || !e.players.contains(command.userId()) || command.action() != Action.FORFEIT
                || clock.instant().isBefore(command.deadline())) return;
        var notices = new ArrayList<Object>();
        synchronized (e) {
            long before = e.match.snapshot(0).version();
            try {
                long decidedAt = command.deadline().toEpochMilli();
                e.match.depart(e.players.indexOf(command.userId()), command.reason().name(), decidedAt);
                e.lifecycle.left(e.gameId, e.tableId, "ALKKAGI", e.match.snapshot(0).version(), command.userId(),
                        command.reason(), Instant.ofEpochMilli(decidedAt), 2, notices);
            } catch (IllegalArgumentException finished) {
                if (!"GAME_FINISHED".equals(finished.getMessage())) throw finished;
            }
            collect(e, before, notices);
        }
        publish(notices);
    }

    /** 외부 scheduler는120Hz로 호출한다. 조회/재접속은 물리를 진행하지 않는다. */
    public void tick() {
        for (Entry e : games.values()) {
            var notices = new ArrayList<Object>();
            synchronized (e) {
                if (e.finished) continue;
                long before = e.match.snapshot(0).version();
                try { e.match.advance(clock.millis()); }
                catch (RuntimeException invalid) { e.match.abort(clock.millis()); }
                collect(e, before, notices);
            }
            publish(notices);
        }
    }

    private void collect(Entry e, long before, List<Object> notices) {
        var state = e.match.snapshot(clock.millis());
        if (state.version() != before) notices.add(new GameStateChanged(e.gameId, state.version()));
        if (!e.finished && state.stage().equals("FINISHED")) {
            e.finished = true; router.finished(this, e.gameId);
            Instant at = Instant.ofEpochMilli(state.endedAt());
            notices.add(e.lifecycle.finished(e.gameId, e.tableId, "ALKKAGI", state.version(), e.players,
                    state.winner() == null ? List.of() : List.of(e.players.get(state.winner())), state.endReason(), at, notices));
        }
    }

    private ObjectNode publicState(Entry e) {
        ObjectNode data = mapper.valueToTree(e.match.snapshot(clock.millis()));
        data.put("gameId", e.gameId).put("gameCode", "ALKKAGI").put("tableId", e.tableId)
                .put("status", e.finished ? "FINISHED" : "PLAYING");
        data.set("players", mapper.valueToTree(e.players.stream().map(String::valueOf).toList()));
        data.put("turnUserId", e.finished ? null : Long.toString(e.players.get(e.match.snapshot(0).turn())));
        var winner = e.match.snapshot(0).winner();
        data.put("winnerUserId", winner == null ? null : Long.toString(e.players.get(winner)));
        return data;
    }

    private ObjectNode privateState(Entry e, int actor) {
        ObjectNode data = mapper.valueToTree(e.match.privateView(actor)); data.put("gameId", e.gameId); return data;
    }

    private Entry entry(String gameId) { synchronized (games) { return games.get(gameId); } }

    private Entry player(long userId, String gameId) {
        Entry e = entry(gameId);
        if (e == null || !e.players.contains(userId)) throw new Rejected(Rejection.ACCESS_DENIED);
        return e;
    }

    private Rejected reject(String code) {
        return new Rejected(switch (code) {
            case "NOT_YOUR_TURN" -> Rejection.NOT_YOUR_TURN;
            case "STALE_VERSION" -> Rejection.STALE_VERSION;
            case "ACTION_ID_CONFLICT" -> Rejection.ACTION_ID_CONFLICT;
            case "GAME_FINISHED" -> Rejection.GAME_FINISHED;
            case "NOT_AIMING" -> Rejection.NOT_ACTIVE;
            default -> Rejection.INVALID_ACTION;
        });
    }

    private void publish(List<Object> notices) {
        for (Object notice : notices) try { events.accept(notice); }
        catch (RuntimeException failed) {
            org.slf4j.LoggerFactory.getLogger(AlkkagiEngine.class).warn("알까기 알림 전달 실패 type={}", notice.getClass().getSimpleName());
        }
    }

    private static final class Entry {
        final String gameId, tableId;
        final List<Long> players;
        final AlkkagiMatch match;
        final GameLifecycle lifecycle = new GameLifecycle();
        final GameForfeitReceipts forfeits = new GameForfeitReceipts();
        boolean finished;
        Entry(String gameId, String tableId, List<Long> players, AlkkagiMatch match) {
            this.gameId = gameId; this.tableId = tableId; this.players = players; this.match = match;
        }
    }
}
