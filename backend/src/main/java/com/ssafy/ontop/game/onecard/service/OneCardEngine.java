package com.ssafy.ontop.game.onecard.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.engine.GameEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.onecard.domain.OneCard;
import com.ssafy.ontop.game.onecard.domain.ForfeitHandPolicy;
import com.ssafy.ontop.game.onecard.domain.OneCardMatch;
import com.ssafy.ontop.game.onecard.domain.OneCardMatch.Snapshot;
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
import java.util.function.IntUnaryOperator;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class OneCardEngine implements GameEngine {
    private static final Logger log = LoggerFactory.getLogger(OneCardEngine.class);
    private final ObjectMapper mapper;
    private final Clock clock;
    private final Consumer<Object> events;
    private final GameEngineRouter router;
    private final Consumer<List<OneCard>> shuffle;
    private final IntUnaryOperator firstPlayer;
    private final ForfeitHandPolicy forfeitHandPolicy;
    private final Map<String, OneCardMatch> games = new HashMap<>();
    private final Map<Long, String> latest = new HashMap<>();

    public OneCardEngine(ObjectMapper mapper, Clock clock, Consumer<Object> events, GameEngineRouter router,
            Consumer<List<OneCard>> shuffle, IntUnaryOperator firstPlayer, ForfeitHandPolicy forfeitHandPolicy) {
        this.mapper = mapper;
        this.clock = clock;
        this.events = events;
        this.router = router;
        this.shuffle = shuffle;
        this.firstPlayer = firstPlayer;
        this.forfeitHandPolicy = java.util.Objects.requireNonNull(forfeitHandPolicy);
    }

    // 실제 참가·차감 커밋을 확인한 서버만 호출한다. 덱·선공도 서버에서 정한다.
    public void create(String gameId, String tableId, List<Long> players) {
        tick();
        synchronized (this) {
            OneCardMatch existing = games.get(gameId);
            if (existing != null) {
                Snapshot state = existing.snapshot();
                if (!state.tableId().equals(tableId) || !state.players().equals(players)) {
                    throw new IllegalStateException("기존 경기와 다른 원카드 생성 요청입니다.");
                }
                return;
            }
            if (players == null || players.size() < 2 || players.size() > 4) {
                throw new IllegalArgumentException("원카드 참가자는2~4명입니다.");
            }
            List<OneCard> deck = initialDeck(players.size());
            OneCardMatch match = new OneCardMatch(gameId, tableId, players, deck, firstPlayer.applyAsInt(players.size()),
                    clock.instant(), shuffle, forfeitHandPolicy);
            router.register(this, gameId, tableId, players);
            games.put(gameId, match);
            for (long userId : players) { latest.put(userId, gameId); }
        }
    }

    private List<OneCard> initialDeck(int participantCount) {
        // 외부에 아직 공개하지 않은 초기 배분만 재시도한다. 유효 바닥이 없으면 루프에 갇히지 않는다.
        for (int attempt = 0; attempt < 8; attempt++) {
            List<OneCard> deck = OneCard.deck();
            shuffle.accept(deck);
            if (deck.subList(participantCount * 7, deck.size()).stream().anyMatch(OneCard::initial)) {
                return deck;
            }
        }
        throw new IllegalStateException("원카드 초기 배분에 실패했습니다. 경기 생성을 다시 시도해주세요.");
    }

    @Override
    public GameActionResult apply(GameActionCommand command) {
        GameActionResult result = null;
        Rejected rejected = null;
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            OneCardMatch match = games.get(command.gameId());
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
            OneCardMatch match = games.get(gameId);
            if (userId <= 0 || match == null) { return Optional.empty(); }
            Snapshot state = match.snapshot();
            return Optional.of(new GameStateView(userId, gameId, state.version(), match.isPlayer(userId)
                    ? GameStateView.Role.PLAYER : GameStateView.Role.SPECTATOR,
                    publicState(state), privateState(match, userId), state.tableId()));
        }
    }

    @Override
    public Optional<GameRecoverySnapshot> load(long userId) {
        tick();
        synchronized (this) {
            OneCardMatch match = games.get(latest.get(userId));
            if (match == null) { return Optional.empty(); }
            Snapshot state = match.snapshot();
            return Optional.of(new GameRecoverySnapshot(userId, state.gameId(), state.players().size(), state.version(),
                    state.endedAt() != null ? GameRecoverySnapshot.Phase.FINISHED
                            : match.isActive(userId) ? GameRecoverySnapshot.Phase.PLAYING : GameRecoverySnapshot.Phase.ELIMINATED,
                    recoveryState(match, userId)));
        }
    }

    @Override
    public void graceExpired(GraceExpiration command) {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            OneCardMatch match = games.get(command.gameId());
            if (match == null || (command.action() != Action.FORFEIT && command.action() != Action.ELIMINATE) || !match.isPlayer(command.userId())
                    || clock.instant().isBefore(command.deadline())) { return; }
            Snapshot before = match.snapshot();
            match.expire(command.deadline());
            match.forfeit(command.userId(), command.deadline());
            collect(before, match.snapshot(), notices);
        }
        publish(notices);
    }

    public void tick() {
        List<Object> notices = new ArrayList<>();
        synchronized (this) {
            for (OneCardMatch match : games.values()) {
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
            notices.add(new OneCardGameFinished(after.gameId(), after.tableId(), after.version(), after.players(),
                    after.winnerUserIds(), after.endReason(), after.endedAt()));
        }
    }

    private ObjectNode publicState(Snapshot state) {
        ObjectNode data = mapper.createObjectNode();
        data.put("gameCode", "ONE_CARD").put("status", state.endedAt() == null ? "PLAYING" : "FINISHED")
                .put("turnTimeLimitMs", 30_000).put("direction", state.direction()).put("stage", state.stage())
                .put("extraAction", state.extraAction()).put("activeSuit", state.activeSuit())
                .put("drawCount", state.drawCount()).put("attackTotal", state.attackTotal())
                .put("turnCount", state.turnCount())
                .put("turnUserId", state.turnUserId() == null ? null : state.turnUserId().toString())
                .put("turnDeadline", state.turnDeadline() == null ? null : state.turnDeadline().toString())
                .put("endReason", state.endReason()).put("endedAt", state.endedAt() == null ? null : state.endedAt().toString());
        data.set("topCard", mapper.valueToTree(state.topCard()));
        data.set("lastAttack", mapper.valueToTree(state.lastAttack()));
        data.set("winnerUserIds", mapper.valueToTree(state.winnerUserIds().stream().map(Object::toString).toList()));
        var players = data.putArray("players");
        for (var player : state.publicPlayers()) {
            players.addObject().put("userId", Long.toString(player.userId())).put("cardCount", player.cardCount())
                    .put("active", player.active()).put("oneCardStatus", player.oneCardStatus())
                    .put("oneCardUntil", player.oneCardUntil() == null ? null : player.oneCardUntil().toString());
        }
        return data;
    }

    private ObjectNode privateState(OneCardMatch match, long userId) {
        ObjectNode data = mapper.createObjectNode();
        if (match.isPlayer(userId)) {
            Snapshot state = match.snapshot();
            data.put("userId", Long.toString(userId)).put("canDraw", state.endedAt() == null && match.isActive(userId)
                    && java.util.Objects.equals(state.turnUserId(), userId) && state.stage().equals("PLAYING") && state.attackTotal() == 0);
            data.set("hand", mapper.valueToTree(match.hand(userId)));
            data.set("playableCardIds", mapper.valueToTree(match.playable(userId)));
        }
        return data;
    }

    private ObjectNode recoveryState(OneCardMatch match, long userId) {
        ObjectNode data = mapper.createObjectNode();
        data.set("publicState", publicState(match.snapshot()));
        data.set("privateState", privateState(match, userId));
        return data;
    }

    private void publish(List<Object> notices) {
        for (Object notice : notices) {
            try { events.accept(notice); }
            catch (RuntimeException exception) {
                log.warn("원카드 상태 알림 전달 실패 type={}", notice.getClass().getSimpleName());
            }
        }
    }
}
