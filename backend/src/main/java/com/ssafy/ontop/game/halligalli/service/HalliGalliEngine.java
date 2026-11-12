package com.ssafy.ontop.game.halligalli.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.action.GameForfeitReceipts;
import com.ssafy.ontop.game.action.GameForfeitResult;
import com.ssafy.ontop.game.engine.GameEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.halligalli.domain.FruitCard;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliDeck;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliMatch;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliMatch.Snapshot;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliTiming;
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
import java.util.Objects;
import java.util.Optional;
import java.util.function.Consumer;
import java.util.random.RandomGenerator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

// 모든 경기의 공개·종·자동 공개·기권을 엔진 잠금 하나로 직렬화한다. 알림은 잠금을 놓은 뒤 발행한다.
public final class HalliGalliEngine implements GameEngine {
    public static final String GAME_CODE = HalliGalliMatch.GAME_CODE;
    private static final Logger log = LoggerFactory.getLogger(HalliGalliEngine.class);
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Consumer<Object> events;
    private final GameEngineRouter router;
    private final Consumer<List<FruitCard>> shuffle;
    private final RandomGenerator random;
    private final HalliGalliTiming timing;
    private final Map<String, HalliGalliMatch> games = new HashMap<>();
    private final Map<Long, String> latest = new HashMap<>();
    private final GameLifecycle lifecycle = new GameLifecycle();
    private final GameForfeitReceipts forfeits = new GameForfeitReceipts();

    // shuffle은 기본 56장 덱 순서를, random은 벌칙 부족분 발행 카드를 정한다.
    public HalliGalliEngine(ObjectMapper mapper, Clock clock, Consumer<Object> events, GameEngineRouter router,
            Consumer<List<FruitCard>> shuffle, RandomGenerator random, HalliGalliTiming timing) {
        this.mapper = mapper;
        this.clock = clock;
        this.events = events;
        this.router = router;
        this.shuffle = Objects.requireNonNull(shuffle);
        this.random = Objects.requireNonNull(random);
        this.timing = Objects.requireNonNull(timing);
    }

    // 실제 참가·차감 커밋을 확인한 서버만 호출한다. 덱 순서도 서버에서 정한다.
    public void create(String gameId, String tableId, List<Long> players) {
        tick();
        synchronized (this) {
            HalliGalliMatch existing = games.get(gameId);
            if (existing != null) {
                Snapshot state = existing.snapshot();
                if (!state.tableId().equals(tableId) || !state.players().equals(players)) {
                    throw new IllegalStateException("기존 경기와 다른 할리갈리 생성 요청입니다.");
                }
                return;
            }
            if (players == null || players.size() < 2 || players.size() > 4) {
                throw new IllegalArgumentException("할리갈리 참가자는2~4명입니다.");
            }
            List<FruitCard> deck = new ArrayList<>(HalliGalliDeck.standard());
            shuffle.accept(deck);
            HalliGalliMatch match = new HalliGalliMatch(gameId, tableId, players, deck, clock.instant(), random, timing);
            router.register(this, gameId, tableId, players);
            games.put(gameId, match);
            for (long userId : players) { latest.put(userId, gameId); }
        }
    }

    // 종은 bellWindowId로, 공개는 턴 시작 버전으로 늦은 요청을 가린다. 마감이 지난 턴은 도메인이 먼저 자동 공개한다.
    @Override
    public GameActionResult apply(GameActionCommand command) {
        GameActionResult result = null;
        Rejected rejected = null;
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            HalliGalliMatch match = games.get(command.gameId());
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
            HalliGalliMatch match = games.get(gameId);
            if (userId <= 0 || match == null) { return Optional.empty(); }
            Snapshot state = match.snapshot();
            return Optional.of(new GameStateView(userId, gameId, state.version(), match.isPlayer(userId)
                    ? GameStateView.Role.PLAYER : GameStateView.Role.SPECTATOR,
                    publicState(state), mapper.createObjectNode(), state.tableId()));
        }
    }

    // 유예 중에도 턴 시간을 멈추지 않는다. 복구 시점의 서버 상태를 그대로 돌려준다.
    @Override
    public Optional<GameRecoverySnapshot> load(long userId) {
        tick();
        synchronized (this) {
            HalliGalliMatch match = games.get(latest.get(userId));
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
            HalliGalliMatch match = games.get(command.gameId());
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

    // 재접속 유예가 끝난 시각 기준으로 밀린 자동 공개를 먼저 처리한 뒤 기권을 확정한다.
    @Override
    public void graceExpired(GraceExpiration command) {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            HalliGalliMatch match = games.get(command.gameId());
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
            for (HalliGalliMatch match : games.values()) {
                Snapshot before = match.snapshot();
                match.expire(clock.instant());
                collect(before, match.snapshot(), notices);
            }
        }
        publish(notices);
    }

    // 종료 전이는 경기당 한 번만 일어나므로 종료 알림도 한 번만 만든다.
    private void collect(Snapshot before, Snapshot after, List<Object> notices) {
        if (before.version() == after.version()) { return; }
        notices.add(new GameStateChanged(after.gameId(), after.version()));
        if (before.endedAt() == null && after.endedAt() != null) {
            router.finished(this, after.gameId());
            notices.add(new HalliGalliGameFinished(after.gameId(), after.tableId(), after.version(), after.players(),
                    after.winnerUserIds(), after.endReason(), after.endedAt()));
            HalliGalliMatch match = games.get(after.gameId());
            if (match != null) {
                notices.add(new HalliGalliBellStats(after.gameId(), after.tableId(), after.endedAt(),
                        match.bellSummaries()));
            }
            notices.add(lifecycle.finished(after.gameId(), after.tableId(), GAME_CODE, after.version(), after.players(),
                    after.winnerUserIds(), after.endReason(), after.endedAt(), notices));
        }
    }

    // 뒷면 더미의 순서·내용은 보내지 않는다. 공개 더미는 맨 위 카드와 장수만 보낸다.
    private ObjectNode publicState(Snapshot state) {
        ObjectNode data = mapper.createObjectNode();
        data.put("gameCode", GAME_CODE).put("status", state.endedAt() == null ? "PLAYING" : "FINISHED")
                .put("version", state.version())
                .put("flipTimeLimitMs", timing.turnLimit().toMillis())
                .put("resultPauseMs", timing.resultPause().toMillis())
                .put("turnUserId", id(state.turnUserId()))
                .put("flipDeadline", time(state.turnDeadline()))
                .put("resultUntil", time(state.resultUntil()))
                .put("flipSeq", state.flipSeq())
                .put("issuedPenaltyCards", state.issuedPenaltyCards())
                .put("endReason", state.endReason())
                .put("endedAt", time(state.endedAt()));
        if (state.bellWindowId() == null) { data.putNull("bellWindowId"); }
        else { data.put("bellWindowId", state.bellWindowId()); }
        data.set("winnerUserIds", mapper.valueToTree(state.winnerUserIds().stream().map(Object::toString).toList()));
        HalliGalliMatch.Event event = state.lastEvent();
        if (event == null) { data.putNull("lastEvent"); }
        else {
            data.putObject("lastEvent").put("type", event.type()).put("userId", Long.toString(event.userId()))
                    .put("at", event.at().toString()).put("cardCount", event.cardCount())
                    .put("issuedCards", event.issuedCards());
        }
        var players = data.putArray("players");
        for (int seat = 0; seat < state.publicPlayers().size(); seat++) {
            HalliGalliMatch.Player player = state.publicPlayers().get(seat);
            var view = players.addObject().put("userId", Long.toString(player.userId())).put("seat", seat)
                    .put("drawCount", player.drawCount()).put("faceUpCount", player.faceUpCount())
                    .put("cardCount", player.drawCount() + player.faceUpCount())
                    .put("active", !player.eliminated()).put("eliminated", player.eliminated())
                    .put("forfeited", player.forfeited());
            if (player.topCard() == null) { view.putNull("topCard"); }
            else {
                view.putObject("topCard").put("fruit", player.topCard().fruit().name())
                        .put("count", player.topCard().count());
            }
        }
        return data;
    }

    // 다인전 복구 형식(원카드·주사위 장부)과 같이 공개 상태와 빈 개인 상태를 함께 보낸다.
    private ObjectNode recoveryState(Snapshot state) {
        ObjectNode data = mapper.createObjectNode();
        data.set("publicState", publicState(state));
        data.set("privateState", mapper.createObjectNode());
        return data;
    }

    private String id(Long value) { return value == null ? null : value.toString(); }

    private String time(Instant value) { return value == null ? null : value.toString(); }

    private void publish(List<Object> notices) {
        for (Object notice : notices) {
            try { events.accept(notice); }
            catch (RuntimeException exception) {
                log.warn("할리갈리 상태 알림 전달 실패 type={}", notice.getClass().getSimpleName());
            }
        }
    }
}
