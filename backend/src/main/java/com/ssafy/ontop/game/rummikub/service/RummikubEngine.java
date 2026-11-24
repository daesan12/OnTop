package com.ssafy.ontop.game.rummikub.service;

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
import com.ssafy.ontop.game.rummikub.domain.RummikubMatch;
import com.ssafy.ontop.game.rummikub.domain.RummikubMatch.OpeningDraw;
import com.ssafy.ontop.game.rummikub.domain.RummikubMatch.Snapshot;
import com.ssafy.ontop.game.rummikub.domain.RummikubTile;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateView;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.PriorityQueue;
import java.util.function.Consumer;
import java.util.function.IntUnaryOperator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class RummikubEngine implements GameEngine {
    public static final String GAME_CODE = "RUMMIKUB";
    private static final Duration FINISHED_RETENTION = Duration.ofMinutes(30);
    private static final Logger log = LoggerFactory.getLogger(RummikubEngine.class);
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Consumer<Object> events;
    private final GameEngineRouter router;
    private final Consumer<List<RummikubTile>> shuffle;
    private final IntUnaryOperator tieBreaker;
    private final Map<String, Session> games = new HashMap<>();
    private final Map<String, Session> activeGames = new HashMap<>();
    private final PriorityQueue<Retirement> retirements = new PriorityQueue<>(
            Comparator.comparing(Retirement::expiresAt));
    private final Map<Long, String> latest = new HashMap<>();

    public RummikubEngine(ObjectMapper mapper, Clock clock, Consumer<Object> events, GameEngineRouter router,
            Consumer<List<RummikubTile>> shuffle, IntUnaryOperator tieBreaker) {
        this.mapper = mapper;
        this.clock = clock;
        this.events = events;
        this.router = router;
        this.shuffle = shuffle;
        this.tieBreaker = tieBreaker;
    }

    // 실제 참가·차감 커밋을 확인한 서버만 호출한다. 선공도 서버에서 정한다.
    public void create(String gameId, String tableId, List<Long> players) {
        tick();
        synchronized (this) {
            Session existing = games.get(gameId);
            if (existing != null) {
                Snapshot state = existing.match().snapshot();
                if (!state.tableId().equals(tableId) || !state.players().equals(players)) {
                    throw new IllegalStateException("기존 경기와 다른 수패마루 생성 요청입니다.");
                }
                return;
            }
            if (players == null || players.size() < 2 || players.size() > 4) {
                throw new IllegalArgumentException("수패마루 참가자는2~4명입니다.");
            }
            List<RummikubTile> deck = RummikubTile.deck();
            shuffle.accept(deck);
            List<OpeningDraw> opening = new ArrayList<>();
            List<Integer> highestPlayers = new ArrayList<>();
            int highest = 0;
            for (int index = 0; index < players.size(); index++) {
                RummikubTile tile = deck.get(index);
                opening.add(new OpeningDraw(players.get(index), tile.color(), tile.number()));
                int value = tile.joker() ? 14 : tile.number();
                if (value > highest) { highest = value; highestPlayers.clear(); }
                if (value == highest) { highestPlayers.add(index); }
            }
            int firstPlayer = highestPlayers.get(tieBreaker.applyAsInt(highestPlayers.size()));
            // 선공 추첨 타일을 모두 돌려놓고 다시 섞어, 공개된 추첨 결과로 손패를 추론하지 못하게 한다.
            shuffle.accept(deck);
            RummikubMatch match = new RummikubMatch(gameId, tableId, players, deck,
                    firstPlayer, opening, clock.instant());
            router.register(this, gameId, tableId, players);
            Session session = new Session(match, new GameLifecycle(), new GameForfeitReceipts());
            games.put(gameId, session);
            activeGames.put(gameId, session);
            for (long userId : players) { latest.put(userId, gameId); }
        }
    }

    @Override
    public GameActionResult apply(GameActionCommand command) {
        GameActionResult result = null;
        Rejected rejected = null;
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            Session session = games.get(command.gameId());
            RummikubMatch match = session == null ? null : session.match();
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
            Session session = games.get(gameId);
            RummikubMatch match = session == null ? null : session.match();
            if (userId <= 0 || match == null) { return Optional.empty(); }
            Snapshot state = match.snapshot();
            return Optional.of(new GameStateView(userId, gameId, state.version(), match.isPlayer(userId)
                    ? GameStateView.Role.PLAYER : GameStateView.Role.SPECTATOR,
                    publicState(state), match.isPlayer(userId) ? privateState(match, userId) : mapper.createObjectNode(), state.tableId()));
        }
    }

    @Override
    public Optional<GameRecoverySnapshot> load(long userId) {
        tick();
        synchronized (this) {
            Session session = games.get(latest.get(userId));
            RummikubMatch match = session == null ? null : session.match();
            if (match == null) { return Optional.empty(); }
            Snapshot state = match.snapshot();
            return Optional.of(new GameRecoverySnapshot(userId, state.gameId(), state.players().size(), state.version(),
                    state.endedAt() != null ? GameRecoverySnapshot.Phase.FINISHED
                            : match.isActive(userId) ? GameRecoverySnapshot.Phase.PLAYING
                                    : GameRecoverySnapshot.Phase.ELIMINATED, recoveryState(match, userId)));
        }
    }

    @Override
    public GameForfeitResult forfeit(GameForfeitCommand command) {
        List<Object> notices = new ArrayList<>();
        GameForfeitResult result = null;
        Rejected rejected = null;
        synchronized (this) {
            Session session = games.get(command.gameId());
            RummikubMatch match = session == null ? null : session.match();
            if (match == null || !match.isPlayer(command.userId())) {
                throw new Rejected(Rejection.ACCESS_DENIED);
            }
            GameForfeitResult previous = session.forfeits().previous(command);
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
                session.lifecycle().left(command.gameId(), before.tableId(), GAME_CODE, match.snapshot().version(),
                        command.userId(), GameDepartureReason.EXPLICIT_LEAVE, now, before.players().size(), notices);
                collect(before, match.snapshot(), notices);
                result = session.forfeits().accepted(command, match.snapshot().version());
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
            Session session = games.get(command.gameId());
            RummikubMatch match = session == null ? null : session.match();
            if (match == null || (command.action() != Action.FORFEIT && command.action() != Action.ELIMINATE)
                    || !match.isPlayer(command.userId()) || clock.instant().isBefore(command.deadline())) { return; }
            Snapshot before = match.snapshot();
            match.expire(command.deadline());
            collect(before, match.snapshot(), notices);
            before = match.snapshot();
            boolean wasActive = before.endedAt() == null && match.isActive(command.userId());
            match.forfeit(command.userId(), command.deadline());
            if (wasActive && !match.isActive(command.userId())) {
                session.lifecycle().left(command.gameId(), before.tableId(), GAME_CODE, match.snapshot().version(),
                        command.userId(), command.reason(), command.deadline(), before.players().size(), notices);
            }
            collect(before, match.snapshot(), notices);
        }
        publish(notices);
    }

    public void tick() {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            Instant now = clock.instant();
            removeExpiredGames(now);
            // collect가 종료된 경기를 즉시 제외하므로 활성 목록의 복사본을 순회한다.
            for (Session session : new ArrayList<>(activeGames.values())) {
                RummikubMatch match = session.match();
                Snapshot before = match.snapshot();
                match.expire(now);
                collect(before, match.snapshot(), notices);
            }
        }
        publish(notices);
    }

    private void removeExpiredGames(Instant now) {
        // 보관 중인 종료 경기는 매 틱 훑지 않고 만료 시각이 지난 항목만 제거한다.
        while (!retirements.isEmpty() && !now.isBefore(retirements.peek().expiresAt())) {
            Retirement retirement = retirements.remove();
            String gameId = retirement.gameId();
            if (!router.forgetFinished(this, gameId)) {
                retirements.add(new Retirement(gameId, now.plusSeconds(60)));
                log.warn("수패마루 종료 경기 정리를 보류합니다: gameId={}", gameId);
                continue;
            }
            Session removed = games.remove(gameId);
            if (removed != null) {
                for (long user : removed.match().snapshot().players()) {
                    latest.remove(user, gameId);
                }
            }
        }
    }

    private void collect(Snapshot before, Snapshot after, List<Object> notices) {
        if (before.version() == after.version()) { return; }
        notices.add(new GameStateChanged(after.gameId(), after.version()));
        if (before.endedAt() == null && after.endedAt() != null) {
            router.finished(this, after.gameId());
            activeGames.remove(after.gameId());
            // 이탈 기한이 과거여도 종료를 처리한 시점부터 복구·재요청 보관 기간을 보장한다.
            retirements.add(new Retirement(after.gameId(), clock.instant().plus(FINISHED_RETENTION)));
            notices.add(games.get(after.gameId()).lifecycle().finished(
                    after.gameId(), after.tableId(), GAME_CODE, after.version(), after.players(),
                    after.winnerUserIds(), after.endReason(), after.endedAt(), notices));
        }
    }

    private ObjectNode publicState(Snapshot state) {
        ObjectNode data = mapper.createObjectNode();
        data.put("gameCode", GAME_CODE).put("status", state.endedAt() == null ? "PLAYING" : "FINISHED")
                .put("turnTimeLimitMs", RummikubMatch.TURN_SECONDS * 1000)
                .put("turnUserId", id(state.turnUserId())).put("turnId", state.turnId())
                .put("poolCount", state.poolCount()).put("initialMeldPoints", 30).put("jokerPenalty", 30)
                .put("lastEvent", state.lastEvent())
                .put("turnDeadline", state.turnDeadline() == null ? null : state.turnDeadline().toString())
                .put("endReason", state.endReason())
                .put("endedAt", state.endedAt() == null ? null : state.endedAt().toString());
        data.set("melds", mapper.valueToTree(state.melds()));
        data.put("firstUserId", id(state.firstUserId()));
        var opening = data.putArray("openingDraws");
        for (OpeningDraw draw : state.openingDraws()) {
            opening.addObject().put("userId", id(draw.userId())).put("color", draw.color()).put("number", draw.number());
        }
        data.set("finalTurnUserIds", mapper.valueToTree(state.finalTurnUserIds().stream().map(Object::toString).toList()));
        data.set("winnerUserIds", mapper.valueToTree(state.winnerUserIds().stream().map(Object::toString).toList()));
        var players = data.putArray("players");
        for (var player : state.playerViews()) {
            var view = players.addObject().put("userId", id(player.userId())).put("tileCount", player.tileCount())
                    .put("registered", player.registered()).put("forfeited", player.forfeited());
            if (player.score() == null) { view.putNull("score"); }
            else { view.put("score", player.score()); }
        }
        return data;
    }

    private ObjectNode privateState(RummikubMatch match, long userId) {
        ObjectNode data = mapper.createObjectNode().put("userId", id(userId));
        data.set("tiles", mapper.valueToTree(match.hand(userId)));
        return data;
    }

    private ObjectNode recoveryState(RummikubMatch match, long userId) {
        ObjectNode data = mapper.createObjectNode();
        data.set("publicState", publicState(match.snapshot()));
        data.set("privateState", privateState(match, userId));
        return data;
    }

    private String id(Long value) { return value == null ? null : value.toString(); }

    private record Session(RummikubMatch match, GameLifecycle lifecycle, GameForfeitReceipts forfeits) { }
    private record Retirement(String gameId, Instant expiresAt) { }

    private void publish(List<Object> notices) {
        for (Object notice : notices) {
            try { events.accept(notice); }
            catch (RuntimeException exception) {
                log.warn("수패마루 상태 알림 전달 실패 type={}", notice.getClass().getSimpleName());
            }
        }
    }
}
