package com.ssafy.ontop.game.bang.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameForfeitReceipts;
import com.ssafy.ontop.game.action.GameForfeitResult;
import com.ssafy.ontop.game.bang.domain.BangMatch;
import com.ssafy.ontop.game.engine.GameEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
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
import java.util.Random;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** 생성은 공통 판돈 예약 커밋 이후에만 호출한다. 상태 알림은 잠금 밖에서 발행한다. */
public final class BangEngine implements GameEngine {
    private static final Logger log = LoggerFactory.getLogger(BangEngine.class);
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Consumer<Object> events;
    private final GameEngineRouter router;
    private final Random random;
    private final Map<String, BangMatch> games = new HashMap<>();
    private final Map<Long, String> latest = new HashMap<>();
    private final GameLifecycle lifecycle = new GameLifecycle();
    private final GameForfeitReceipts forfeits = new GameForfeitReceipts();

    public BangEngine(ObjectMapper mapper, Clock clock, Consumer<Object> events, GameEngineRouter router, Random random) {
        this.mapper = mapper;
        this.clock = clock;
        this.events = events;
        this.router = router;
        this.random = random;
    }

    public synchronized void create(String gameId, String tableId, List<Long> users) {
        BangMatch existing = games.get(gameId);
        if (existing != null) {
            if (!existing.tableId().equals(tableId) || !existing.users().equals(users)) {
                throw new IllegalStateException("기존 경기와 다른 총잡이 생성 요청입니다.");
            }
            return;
        }
        BangMatch match = new BangMatch(gameId, tableId, users, mapper, random, clock.instant());
        router.register(this, gameId, tableId, users, 7);
        games.put(gameId, match);
        users.forEach(user -> latest.put(user, gameId));
    }

    @Override
    public GameActionResult apply(GameActionCommand command) {
        List<Object> notices = new ArrayList<>();
        GameActionResult result;
        Rejected rejected = null;
        synchronized (this) {
            BangMatch match = games.get(command.gameId());
            if (match == null || !match.users().contains(command.userId())) { throw new Rejected(Rejection.ACCESS_DENIED); }
            long version = match.version();
            Instant ended = match.endedAt();
            try {
                match.expire(clock.instant());
                result = match.apply(command, clock.instant());
            } catch (Rejected exception) {
                rejected = exception;
                result = null;
            }
            collect(match, version, ended, notices);
        }
        publish(notices);
        if (rejected != null) { throw rejected; }
        return result;
    }

    @Override
    public Optional<GameStateView> load(long userId, String gameId) {
        tick();
        synchronized (this) {
            BangMatch match = games.get(gameId);
            if (userId <= 0 || match == null) { return Optional.empty(); }
            return Optional.of(new GameStateView(userId, gameId, match.version(), match.users().contains(userId)
                    ? GameStateView.Role.PLAYER : GameStateView.Role.SPECTATOR,
                    match.publicState(), match.privateState(userId), match.tableId()));
        }
    }

    @Override
    public Optional<GameRecoverySnapshot> load(long userId) {
        tick();
        synchronized (this) {
            BangMatch match = games.get(latest.get(userId));
            if (match == null) { return Optional.empty(); }
            var state = mapper.createObjectNode();
            state.set("publicState", match.publicState());
            state.set("privateState", match.privateState(userId));
            return Optional.of(new GameRecoverySnapshot(userId, match.gameId(), match.users().size(), match.version(),
                    match.endedAt() != null ? GameRecoverySnapshot.Phase.FINISHED : match.active(userId)
                    ? GameRecoverySnapshot.Phase.PLAYING : GameRecoverySnapshot.Phase.ELIMINATED, state));
        }
    }

    @Override
    public GameForfeitResult forfeit(GameForfeitCommand command) {
        List<Object> notices = new ArrayList<>();
        GameForfeitResult result;
        synchronized (this) {
            BangMatch match = games.get(command.gameId());
            if (match == null || !match.users().contains(command.userId())) { throw new Rejected(Rejection.ACCESS_DENIED); }
            result = forfeits.previous(command);
            if (result != null) { return result; }
            if (match.endedAt() != null) { throw new Rejected(Rejection.GAME_FINISHED); }
            if (!match.active(command.userId())) { throw new Rejected(Rejection.NOT_ACTIVE); }
            depart(match, command.userId(), GameDepartureReason.EXPLICIT_LEAVE, clock.instant(), notices);
            result = forfeits.accepted(command, match.version());
        }
        publish(notices);
        return result;
    }

    @Override
    public void graceExpired(GraceExpiration command) {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            BangMatch match = games.get(command.gameId());
            if (match == null || clock.instant().isBefore(command.deadline()) || match.endedAt() != null
                    || !match.active(command.userId()) || command.action() == null) { return; }
            depart(match, command.userId(), command.reason(), command.deadline(), notices);
        }
        publish(notices);
    }

    private void depart(BangMatch match, long userId, GameDepartureReason reason, Instant at, List<Object> notices) {
        long version = match.version();
        Instant ended = match.endedAt();
        if (match.forfeit(userId, at)) {
            lifecycle.left(match.gameId(), match.tableId(), "BANG", match.version(), userId,
                    reason, at, match.users().size(), notices);
        }
        collect(match, version, ended, notices);
    }

    public void tick() {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            for (BangMatch match : games.values()) {
                long version = match.version();
                Instant ended = match.endedAt();
                match.expire(clock.instant());
                collect(match, version, ended, notices);
            }
        }
        publish(notices);
    }

    private void collect(BangMatch match, long beforeVersion, Instant beforeEnd, List<Object> notices) {
        if (match.version() == beforeVersion) { return; }
        notices.add(new GameStateChanged(match.gameId(), match.version()));
        if (beforeEnd == null && match.endedAt() != null) {
            router.finished(this, match.gameId());
            notices.add(lifecycle.finished(match.gameId(), match.tableId(), "BANG", match.version(), match.users(),
                    match.winners(), match.endReason(), match.endedAt(), notices));
        }
    }

    private void publish(List<Object> notices) {
        for (Object notice : notices) {
            try { events.accept(notice); }
            catch (RuntimeException exception) { log.warn("총잡이 상태 알림 전달 실패", exception); }
        }
    }
}
