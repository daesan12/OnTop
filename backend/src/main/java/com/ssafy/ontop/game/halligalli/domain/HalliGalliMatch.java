package com.ssafy.ontop.game.halligalli.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameActionResult;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.random.RandomGenerator;

// 모든 변경·조회를 소유 엔진의 동일 잠금 안에서 수행한다.
// 버전은 상태 관찰용이다. 늦은 입력은 행동별 기준(카드 공개는 턴 시작 버전, 종은 bellWindowId)으로 가린다.
// 활성 참가자가 2명이면 뒷면이 빈 참가자의 차례도 건너뛰지 않는다. 그 차례는 공개 대신 5초 마지막 종 기회이고,
// 마감까지 뒷면 카드를 얻지 못하면 그 참가자가 지고 상대가 이긴다(NO_CARDS_TO_FLIP). 3명 이상이면 빈 좌석을 건너뛴다.
public final class HalliGalliMatch {
    public static final String GAME_CODE = "HALLI_GALLI";
    public static final String LAST_PLAYER_STANDING = "LAST_PLAYER_STANDING";
    public static final String NO_CARDS_TO_FLIP = "NO_CARDS_TO_FLIP";
    private static final int BELL_TOTAL = 5;

    private final String gameId;
    private final String tableId;
    private final List<Long> players;
    private final Map<Long, HalliGalliPlayer> seats = new LinkedHashMap<>();
    private final Map<Key, Accepted> accepted = new HashMap<>();
    private final RandomGenerator random;
    private final HalliGalliTiming timing;
    private long version;
    // 카드를 공개할 좌석 번호. -1이면(3명 이상일 때만) 뒷면 카드가 남은 참가자가 없어 마지막 종 기회만 남는다.
    // 활성 2명에서 이 좌석의 뒷면이 비어 있으면 그 참가자의 마지막 종 기회다.
    private int turn;
    private long turnVersion;
    private Instant turnDeadline;
    private Instant resultUntil;
    private long flipSeq;
    private boolean windowOpen;
    private int issuedPenaltyCards;
    private Event lastEvent;
    private Instant endedAt;
    private String endReason;
    private List<Long> winners = List.of();

    public HalliGalliMatch(String gameId, String tableId, List<Long> players, List<FruitCard> deck,
            Instant now, RandomGenerator random, HalliGalliTiming timing) {
        if (gameId == null || gameId.isBlank() || gameId.length() > 120 || tableId == null || tableId.isBlank()
                || players == null || players.size() < 2 || players.size() > 4
                || players.stream().anyMatch(id -> id == null || id <= 0)
                || players.stream().distinct().count() != players.size()
                || deck == null || deck.size() != HalliGalliDeck.STANDARD_SIZE
                || !new HashSet<>(deck).equals(new HashSet<>(HalliGalliDeck.standard()))
                || now == null || random == null || timing == null) {
            throw new IllegalArgumentException("할리갈리 경기·참가자·56장 덱을 확인해주세요.");
        }
        this.gameId = gameId;
        this.tableId = tableId;
        this.players = List.copyOf(players);
        this.random = random;
        this.timing = timing;
        List<List<FruitCard>> hands = HalliGalliDeck.deal(deck, players.size());
        for (int seat = 0; seat < players.size(); seat++) {
            seats.put(players.get(seat), new HalliGalliPlayer(players.get(seat), hands.get(seat)));
        }
        turn = 0;
        turnDeadline = now.plus(timing.turnLimit());
    }

    public static HalliGalliMatch create(String gameId, String tableId, List<Long> players, Instant now,
            RandomGenerator random, HalliGalliTiming timing) {
        return new HalliGalliMatch(gameId, tableId, players, HalliGalliDeck.shuffled(Objects.requireNonNull(random)),
                now, random, timing);
    }

    // 공개 더미 맨 위 카드만 받아 같은 과일 합계가 정확히 5인 과일이 하나라도 있는지 본다.
    public static boolean bellMatches(Collection<FruitCard> topCards) {
        Map<FruitType, Integer> totals = new EnumMap<>(FruitType.class);
        for (FruitCard card : topCards) {
            totals.merge(card.fruit(), card.count(), Integer::sum);
        }
        return totals.containsValue(BELL_TOTAL);
    }

    public GameActionResult apply(GameActionCommand command, Instant now) {
        if (!gameId.equals(command.gameId()) || !isPlayer(command.userId())) {
            throw new Rejected(Rejection.ACCESS_DENIED);
        }
        expire(now);
        Key key = new Key(command.userId(), command.actionId());
        Accepted previous = accepted.get(key);
        if (previous != null) {
            if (previous.expectedVersion() != command.expectedVersion() || !previous.input().equals(command.input())) {
                throw new Rejected(Rejection.ACTION_ID_CONFLICT);
            }
            return previous.result();
        }
        HalliGalliPlayer actor = seats.get(command.userId());
        if (endedAt == null && actor.isForfeited()) {
            throw new Rejected(Rejection.NOT_ACTIVE);
        }
        if (endedAt != null || actor.isEliminated() || command.expectedVersion() > version) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        JsonNode input = command.input();
        String kind = input.path("kind").isTextual() ? input.path("kind").textValue() : "";
        switch (kind) {
            case "flip" -> flip(actor, input, command.expectedVersion(), now);
            case "ring" -> ring(actor, input, now);
            default -> throw new Rejected(Rejection.INVALID_ACTION);
        }
        GameActionResult result = new GameActionResult(command.userId(), gameId, command.actionId(), version);
        accepted.put(key, new Accepted(command.expectedVersion(), input, result));
        return result;
    }

    // 마감이 지난 턴은 마감 시각 기준으로 서버가 대신 공개한다. 여러 마감을 놓쳤으면 차례대로 따라잡는다.
    // 마지막 종 기회가 끝난 차례는 공개하지 않고 그 참가자의 상대를 승자로 끝낸다.
    public void expire(Instant now) {
        while (endedAt == null && !now.isBefore(turnDeadline)) {
            Instant at = turnDeadline;
            if (turn < 0) {
                version++;
                finish(mostCards(), NO_CARDS_TO_FLIP, at);
            } else if (seat(turn).canFlip()) {
                flipBy(turn, at, "AUTO_FLIP");
            } else {
                version++;
                long loser = players.get(turn);
                finish(activeUsers().stream().filter(id -> id != loser).toList(), NO_CARDS_TO_FLIP, at);
            }
        }
    }

    private void flip(HalliGalliPlayer actor, JsonNode input, long expectedVersion, Instant now) {
        if (input.size() != 1 || resultUntil != null && now.isBefore(resultUntil)) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        // 현재 턴이 시작되기 전 상태를 보고 보낸 공개는 이미 자동 공개 등으로 처리된 턴의 늦은 요청이다.
        if (expectedVersion < turnVersion) {
            throw new Rejected(Rejection.STALE_VERSION);
        }
        if (turn < 0 || players.get(turn) != actor.userId()) {
            throw new Rejected(Rejection.NOT_YOUR_TURN);
        }
        // 마지막 종 기회 차례에는 공개할 카드가 없다.
        if (!actor.canFlip()) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        flipBy(turn, now, "FLIP");
    }

    private void flipBy(int seat, Instant at, String type) {
        HalliGalliPlayer flipper = seat(seat);
        version++;
        flipper.flip();
        flipSeq++;
        windowOpen = true;
        resultUntil = null;
        lastEvent = new Event(type, flipper.userId(), at, 1, 0);
        startTurn(seat + 1, at);
    }

    private void ring(HalliGalliPlayer actor, JsonNode input, Instant now) {
        JsonNode window = input.path("bellWindowId");
        if (input.size() != 2 || !window.isIntegralNumber() || !window.canConvertToLong()
                || window.longValue() <= 0 || window.longValue() > flipSeq) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        // 닫힌 창의 늦은 종을 새 창의 카드로 판정하지 않는다. 벌칙 없이 거절한다.
        if (window.longValue() != flipSeq || !windowOpen) {
            throw new Rejected(Rejection.STALE_VERSION);
        }
        // 인원과 관계없이 같은 판정이다. 활성 2명이라는 이유만으로 종 판정 직후 끝내지 않는다.
        List<FruitCard> tops = seats.values().stream().map(HalliGalliPlayer::topCard).filter(Objects::nonNull).toList();
        if (bellMatches(tops)) {
            collect(actor, now);
        } else {
            penalize(actor, now);
        }
    }

    // 수거한 사람은 뒷면 카드가 생기므로 마지막 종 기회였어도 결과 연출 뒤 정상 차례로 돌아간다.
    private void collect(HalliGalliPlayer ringer, Instant now) {
        version++;
        int cards = gatherFaceUp(ringer);
        windowOpen = false;
        lastEvent = new Event("RING_SUCCESS", ringer.userId(), now, cards, 0);
        eliminateExhausted();
        if (activeCount() <= 1) {
            finish(activeUsers(), LAST_PLAYER_STANDING, now);
            return;
        }
        resultUntil = now.plus(timing.resultPause());
        turn = players.indexOf(ringer.userId());
        turnDeadline = resultUntil.plus(timing.turnLimit());
        turnVersion = version;
    }

    // 탈락자 것을 포함한 모든 공개 더미를 받는 사람의 뒷면 맨 아래로 옮긴다.
    private int gatherFaceUp(HalliGalliPlayer receiver) {
        List<FruitCard> pile = new ArrayList<>();
        for (HalliGalliPlayer seat : seats.values()) {
            pile.addAll(seat.surrenderFaceUp());
        }
        receiver.receiveBottom(pile);
        return pile.size();
    }

    // 다른 유효 참가자에게 한 장씩 준다. 뒷면 카드가 모자라면 부족분을 발행해 지급하고 벌칙 대상은 즉시 탈락한다.
    // 이 탈락으로 1명이 남으면 끝난다. 마지막 종 기회인 참가자는 상대의 벌칙 카드를 받아 그 차례에 다시 공개할 수 있다.
    private void penalize(HalliGalliPlayer ringer, Instant now) {
        version++;
        List<HalliGalliPlayer> recipients = othersAfter(ringer);
        int issued = 0;
        for (HalliGalliPlayer recipient : recipients) {
            FruitCard card = ringer.payPenalty();
            if (card == null) {
                card = HalliGalliDeck.issue(issuedPenaltyCards++, random);
                issued++;
            }
            recipient.receiveBottom(List.of(card));
        }
        if (issued > 0) {
            ringer.eliminate();
        }
        lastEvent = new Event("RING_PENALTY", ringer.userId(), now, recipients.size(), issued);
        eliminateExhausted();
        if (activeCount() <= 1) {
            finish(activeUsers(), LAST_PLAYER_STANDING, now);
            return;
        }
        // 활성 2명에서 차례인 사람이 벌칙으로 마지막 뒷면 카드를 냈으면 그 차례를 새 5초 마지막 종 기회로 다시 연다.
        if (turn < 0 || !seat(turn).canFlip()) {
            boolean keepTurn = activeCount() == 2 && turn >= 0 && !seat(turn).isEliminated();
            startTurn(keepTurn ? turn : players.indexOf(ringer.userId()) + 1, now);
        }
    }

    // 기권 확정. 이미 끝났거나 경기에서 빠진 참가자면 아무것도 바꾸지 않는다.
    // 남은 유효 참가자가 1명이면 끝내고, 기권자가 공개 차례였으면 결과 연출 뒤(없으면 지금) 다음 좌석에 새 턴을 준다.
    // 아무도 공개할 수 없던 상태(turn -1)에서 2명이 남으면 기권자 다음 좌석의 마지막 종 기회로 바꾼다.
    public void forfeit(long user, Instant now) {
        HalliGalliPlayer leaver = seats.get(user);
        if (endedAt != null || leaver == null || leaver.isEliminated()) {
            return;
        }
        version++;
        leaver.forfeit();
        if (activeCount() <= 1) {
            finish(activeUsers(), LAST_PLAYER_STANDING, now);
            return;
        }
        boolean leaverTurn = turn >= 0 && players.get(turn) == user;
        if (leaverTurn || turn < 0 && activeCount() == 2) {
            startTurn(players.indexOf(user) + 1, resultUntil != null && now.isBefore(resultUntil) ? resultUntil : now);
        }
    }

    // 3명 이상이면 공개할 수 있는 좌석만, 활성 2명이면 뒷면이 비어도 다음 유효 좌석에 차례를 준다.
    private void startTurn(int from, Instant at) {
        boolean twoLeft = activeCount() == 2;
        turn = -1;
        for (int step = 0; step < players.size(); step++) {
            int seat = Math.floorMod(from + step, players.size());
            if (twoLeft ? !seat(seat).isEliminated() : seat(seat).canFlip()) {
                turn = seat;
                break;
            }
        }
        turnDeadline = at.plus(timing.turnLimit());
        turnVersion = version;
    }

    // 정상 공개로 뒷면만 비면 공개 더미로 종을 계속 칠 수 있다. 공개 더미까지 모두 잃은 참가자만 탈락한다.
    private void eliminateExhausted() {
        for (HalliGalliPlayer seat : seats.values()) {
            if (!seat.isEliminated() && seat.cardCount() == 0) {
                seat.eliminate();
            }
        }
    }

    private void finish(List<Long> winners, String reason, Instant at) {
        this.winners = List.copyOf(winners);
        endReason = reason;
        endedAt = at;
        turn = -1;
        turnDeadline = null;
        resultUntil = null;
        windowOpen = false;
    }

    private List<HalliGalliPlayer> othersAfter(HalliGalliPlayer ringer) {
        int start = players.indexOf(ringer.userId());
        List<HalliGalliPlayer> others = new ArrayList<>();
        for (int step = 1; step < players.size(); step++) {
            HalliGalliPlayer other = seat(Math.floorMod(start + step, players.size()));
            if (!other.isEliminated()) {
                others.add(other);
            }
        }
        return others;
    }

    private List<Long> mostCards() {
        int most = seats.values().stream().filter(seat -> !seat.isEliminated())
                .mapToInt(HalliGalliPlayer::cardCount).max().orElse(0);
        return seats.values().stream().filter(seat -> !seat.isEliminated() && seat.cardCount() == most)
                .map(HalliGalliPlayer::userId).toList();
    }

    private List<Long> activeUsers() {
        return seats.values().stream().filter(seat -> !seat.isEliminated()).map(HalliGalliPlayer::userId).toList();
    }

    private int activeCount() {
        return activeUsers().size();
    }

    private HalliGalliPlayer seat(int index) {
        return seats.get(players.get(index));
    }

    public boolean isPlayer(long user) {
        return seats.containsKey(user);
    }

    public boolean isActive(long user) {
        return seats.containsKey(user) && !seats.get(user).isEliminated();
    }

    // 카드 보존 불변식: 기본 56장 + 추가 발행 장수.
    public int totalCards() {
        return seats.values().stream().mapToInt(HalliGalliPlayer::cardCount).sum();
    }

    public Snapshot snapshot() {
        List<Player> views = players.stream().map(seats::get).map(seat -> new Player(seat.userId(), seat.drawCount(),
                seat.faceUpCount(), seat.topCard(), seat.isEliminated(), seat.isForfeited())).toList();
        return new Snapshot(gameId, tableId, players, views, version, turn < 0 ? null : players.get(turn),
                turnDeadline, resultUntil, windowOpen ? Long.valueOf(flipSeq) : null, flipSeq, issuedPenaltyCards,
                lastEvent, winners, endReason, endedAt);
    }

    private record Key(long userId, String actionId) {
    }

    private record Accepted(long expectedVersion, JsonNode input, GameActionResult result) {
    }

    // type: FLIP, AUTO_FLIP, RING_SUCCESS, RING_PENALTY. userId는 행동한 사람(종은 친 사람)이다.
    // cardCount는 공개·수거·지급 장수다. 예전 최종 2인 특례의 FINAL_PENALTY는 더 이상 만들지 않는다.
    public record Event(String type, long userId, Instant at, int cardCount, int issuedCards) {
    }

    // topCard는 공개 더미가 비었으면 null이다. eliminated는 규칙 탈락과 기권을 모두 포함하고, forfeited는 기권만이다.
    public record Player(long userId, int drawCount, int faceUpCount, FruitCard topCard, boolean eliminated,
            boolean forfeited) {
    }

    // bellWindowId는 종을 칠 수 있는 창이 열려 있을 때만 값이 있다.
    public record Snapshot(String gameId, String tableId, List<Long> players, List<Player> publicPlayers, long version,
            Long turnUserId, Instant turnDeadline, Instant resultUntil, Long bellWindowId, long flipSeq,
            int issuedPenaltyCards, Event lastEvent, List<Long> winnerUserIds, String endReason, Instant endedAt) {
    }
}
