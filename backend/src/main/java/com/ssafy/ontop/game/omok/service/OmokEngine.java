package com.ssafy.ontop.game.omok.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.engine.GameEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.omok.domain.OmokMatch;
import com.ssafy.ontop.game.omok.domain.OmokMatch.Snapshot;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
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

public final class OmokEngine implements GameEngine {
    private static final Logger log = LoggerFactory.getLogger(OmokEngine.class);
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Consumer<Object> events;
    private final GameEngineRouter router;
    private final Map<String, OmokMatch> games = new HashMap<>();
    private final Map<Long, String> latest = new HashMap<>();

    public OmokEngine(ObjectMapper mapper, Clock clock, Consumer<Object> events) {
        this(mapper, clock, events, new GameEngineRouter());
    }

    public OmokEngine(ObjectMapper mapper, Clock clock, Consumer<Object> events, GameEngineRouter router) {
        this.mapper = mapper;
        this.clock = clock;
        this.events = events;
        this.router = router;
    }

    // 실제 참가·차감 커밋을 확인한 서버 코드만 호출한다. 외부 HTTP/WS 생성 API는 제공하지 않는다.
    public void create(String gameId, String tableId, long blackUserId, long whiteUserId) {
        tick();
        synchronized (this) {
            OmokMatch existing = games.get(gameId);
            if (existing != null) {
                Snapshot state = existing.snapshot();
                if (!state.tableId().equals(tableId) || state.blackUserId() != blackUserId
                        || state.whiteUserId() != whiteUserId) {
                    throw new IllegalStateException("기존 경기와 다른 오목 생성 요청입니다.");
                }
                return;
            }
            if (games.values().stream().map(OmokMatch::snapshot).anyMatch(state -> state.endedAt() == null
                    && (state.tableId().equals(tableId) || state.blackUserId() == blackUserId
                    || state.whiteUserId() == blackUserId || state.blackUserId() == whiteUserId
                    || state.whiteUserId() == whiteUserId))) {
                throw new IllegalStateException("이미 진행 중인 오목 경기입니다.");
            }
            OmokMatch game = new OmokMatch(gameId, tableId, blackUserId, whiteUserId, clock.instant());
            router.register(this, gameId, tableId, List.of(blackUserId, whiteUserId));
            games.put(gameId, game);
            latest.put(blackUserId, gameId);
            latest.put(whiteUserId, gameId);
        }
    }

    @Override
    public GameActionResult apply(GameActionCommand command) {
        GameActionResult result = null;
        Rejected rejected = null;
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            OmokMatch game = games.get(command.gameId());
            if (game == null || !game.isPlayer(command.userId())) {
                throw new Rejected(Rejection.ACCESS_DENIED);
            }
            Snapshot before = game.snapshot();
            try {
                result = game.apply(command, clock.instant());
            } catch (Rejected exception) {
                rejected = exception;
            }
            collect(before, game.snapshot(), notices);
        }
        publish(notices);
        if (rejected != null) {
            throw rejected;
        }
        return result;
    }

    @Override
    public Optional<GameStateView> load(long userId, String gameId) {
        tick();
        synchronized (this) {
            OmokMatch game = games.get(gameId);
            if (userId <= 0 || game == null) {
                return Optional.empty();
            }
            Snapshot state = game.snapshot();
            return Optional.of(new GameStateView(userId, gameId, state.version(), game.isPlayer(userId)
                    ? GameStateView.Role.PLAYER : GameStateView.Role.SPECTATOR,
                    publicState(state), mapper.createObjectNode(), state.tableId()));
        }
    }

    @Override
    public Optional<GameRecoverySnapshot> load(long userId) {
        tick();
        synchronized (this) {
            OmokMatch game = games.get(latest.get(userId));
            if (game == null) {
                return Optional.empty();
            }
            Snapshot state = game.snapshot();
            return Optional.of(new GameRecoverySnapshot(userId, state.gameId(), 2, state.version(),
                    state.endedAt() == null ? GameRecoverySnapshot.Phase.PLAYING
                            : GameRecoverySnapshot.Phase.FINISHED, publicState(state)));
        }
    }

    @Override
    public void graceExpired(GraceExpiration command) {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            OmokMatch game = games.get(command.gameId());
            if (game == null || command.action() != Action.FORFEIT || !game.isPlayer(command.userId())
                    || clock.instant().isBefore(command.deadline())) {
                return;
            }
            Snapshot before = game.snapshot();
            game.expire(command.deadline());
            game.forfeit(command.userId(), command.deadline());
            collect(before, game.snapshot(), notices);
        }
        publish(notices);
    }

    public void tick() {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            for (OmokMatch game : games.values()) {
                Snapshot before = game.snapshot();
                game.expire(clock.instant());
                collect(before, game.snapshot(), notices);
            }
        }
        publish(notices);
    }

    private void collect(Snapshot before, Snapshot after, List<Object> notices) {
        if (before.version() != after.version()) {
            notices.add(new GameStateChanged(after.gameId(), after.version()));
            if (before.endedAt() == null && after.endedAt() != null) {
                router.finished(this, after.gameId());
                notices.add(new OmokGameFinished(after.gameId(), after.tableId(), after.version(),
                        after.blackUserId(), after.whiteUserId(), after.winnerUserId(), after.endReason(), after.endedAt()));
            }
        }
    }

    private ObjectNode publicState(Snapshot state) {
        ObjectNode data = mapper.createObjectNode();
        data.put("gameCode", "OMOK").put("status", state.endedAt() == null ? "PLAYING" : "FINISHED")
                .put("boardSize", 15).put("blackUserId", Long.toString(state.blackUserId()))
                .put("whiteUserId", Long.toString(state.whiteUserId())).put("moveCount", state.board().moveCount());
        data.set("board", mapper.valueToTree(state.board().board()));
        data.put("turnUserId", state.turnUserId() == null ? null : Long.toString(state.turnUserId()));
        data.put("winnerUserId", state.winnerUserId() == null ? null : Long.toString(state.winnerUserId()));
        data.put("turnDeadline", state.turnDeadline() == null ? null : state.turnDeadline().toString());
        data.put("endedAt", state.endedAt() == null ? null : state.endedAt().toString());
        data.put("endReason", state.endReason());
        data.set("lastMove", mapper.valueToTree(state.board().lastMove()));
        return data;
    }

    private void publish(List<Object> notices) {
        for (Object notice : notices) {
            try {
                events.accept(notice);
            } catch (RuntimeException exception) {
                // 상태는 이미 확정됐다. 알림 실패를 착수 실패로 바꿔 재착수를 유도하지 않는다.
                log.warn("오목 상태 알림 전달 실패 type={}", notice.getClass().getSimpleName());
            }
        }
    }
}
