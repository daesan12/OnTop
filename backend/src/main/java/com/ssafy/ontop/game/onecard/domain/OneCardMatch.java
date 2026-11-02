package com.ssafy.ontop.game.onecard.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameActionResult;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

// 모든 변경·조회를 소유 엔진의 동일 잠금 안에서 수행한다.
public final class OneCardMatch {
    private final String gameId;
    private final String tableId;
    private final List<Long> players;
    private final Map<Long,List<OneCard>> hands = new LinkedHashMap<>();
    private final Map<Long,Window> windows = new HashMap<>();
    private final Set<Long> active = new HashSet<>();
    private final Set<Long> stalled = new HashSet<>();
    private final List<OneCard> draw = new ArrayList<>();
    private final List<OneCard> discard = new ArrayList<>();
    private final Map<Key,Accepted> accepted = new HashMap<>();
    private final Consumer<List<OneCard>> shuffle;
    private final ForfeitHandPolicy forfeitHandPolicy;
    private long version;
    private int turn;
    private int direction = 1;
    private int attackTotal;
    private OneCard lastAttack;
    private String activeSuit;
    private String stage = "PLAYING";
    private boolean extraAction;
    private long turnCount = 1;
    private Instant deadline;
    private Instant endedAt;
    private String reason;
    private List<Long> winners = List.of();

    public OneCardMatch(String gameId, String tableId, List<Long> players, List<OneCard> deck,
            int firstPlayer, Instant now, Consumer<List<OneCard>> shuffle, ForfeitHandPolicy forfeitHandPolicy) {
        if (gameId == null || gameId.isBlank() || gameId.length() > 120 || tableId == null || tableId.isBlank()
                || players == null || players.size() < 2 || players.size() > 4
                || players.stream().anyMatch(id -> id == null || id <= 0)
                || players.stream().distinct().count() != players.size() || firstPlayer < 0 || firstPlayer >= players.size()
                || deck == null || deck.size() != 54 || !new HashSet<>(deck).equals(new HashSet<>(OneCard.deck()))
                || now == null || shuffle == null || forfeitHandPolicy == null) {
            throw new IllegalArgumentException("원카드 경기·참가자·54장 덱을 확인해주세요.");
        }
        this.gameId = gameId;
        this.tableId = tableId;
        this.players = List.copyOf(players);
        this.shuffle = shuffle;
        this.forfeitHandPolicy = forfeitHandPolicy;
        turn = firstPlayer;
        draw.addAll(deck);
        for (long user : players) {
            List<OneCard> hand = new ArrayList<>();
            for (int index = 0; index < 7; index++) { hand.add(draw.removeFirst()); }
            hands.put(user, hand);
            windows.put(user,new Window(null,"none"));
            active.add(user);
        }
        OneCard top = draw.stream().filter(OneCard::initial).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("바닥 숫자 카드가 남도록 초기 덱을 다시 배분해주세요."));
        draw.remove(top);
        // 유효 바닥을 선택한 뒤 남은 덱을 다시 섞어 앞쪽 특수 카드 편향을 없앤다.
        shuffle.accept(draw);
        discard.add(top);
        activeSuit = top.suit();
        deadline = now.plusSeconds(30);
    }

    public GameActionResult apply(GameActionCommand command, Instant now) {
        if (!gameId.equals(command.gameId()) || !isPlayer(command.userId())) { throw new Rejected(Rejection.ACCESS_DENIED); }
        expire(now);
        Key key = new Key(command.userId(),command.actionId());
        Accepted previous = accepted.get(key);
        if (previous != null) {
            if (previous.version() != command.expectedVersion() || !previous.input().equals(command.input())) {
                throw new Rejected(Rejection.ACTION_ID_CONFLICT);
            }
            return previous.result();
        }
        if (endedAt != null || !active.contains(command.userId())) { throw new Rejected(Rejection.INVALID_ACTION); }
        if (command.expectedVersion() != version) { throw new Rejected(Rejection.STALE_VERSION); }
        JsonNode input = command.input();
        if (!input.path("kind").isTextual()) { throw new Rejected(Rejection.INVALID_ACTION); }
        String kind = input.path("kind").asText();
        if (kind.equals("declare-one") || kind.equals("catch-one")) {
            declaration(command.userId(),kind,input,now);
        } else {
            if (players.get(turn) != command.userId()) { throw new Rejected(Rejection.NOT_YOUR_TURN); }
            switch (kind) {
                case "play" -> play(input,now);
                case "draw", "accept-attack" -> {
                    if (input.size() != 1 || !stage.equals("PLAYING")
                            || (kind.equals("draw") ? attackTotal != 0 : attackTotal == 0)) { invalid(); }
                    int count = drawCards(players.get(turn),attackTotal > 0 ? attackTotal : 1);
                    attackTotal = 0;
                    lastAttack = null;
                    completeTurn(count > 0,now,1);
                }
                case "select-suit" -> {
                    if (input.size() != 2 || !stage.equals("CHOOSE_SUIT") || !input.path("suit").isTextual()
                            || !OneCard.SUITS.contains(input.path("suit").asText())) { invalid(); }
                    activeSuit = input.path("suit").asText();
                    stage = "PLAYING";
                    completeTurn(true,now,1);
                }
                default -> invalid();
            }
        }
        version++;
        GameActionResult result = new GameActionResult(command.userId(),gameId,command.actionId(),version);
        accepted.put(key,new Accepted(command.expectedVersion(),input.deepCopy(),result));
        return result;
    }

    private void play(JsonNode input,Instant now) {
        if (!stage.equals("PLAYING") || input.size() != 2 || !input.path("cardId").isTextual()) { invalid(); }
        long user = players.get(turn);
        List<OneCard> hand = hands.get(user);
        OneCard card = hand.stream().filter(value -> value.id().equals(input.path("cardId").asText())).findFirst()
                .orElseThrow(() -> new Rejected(Rejection.INVALID_ACTION));
        if (!card.canPlay(top(),activeSuit,attackTotal,lastAttack)) { invalid(); }
        hand.remove(card);
        discard.add(card);
        stalled.clear();
        windows.put(user,hand.size() == 1 ? new Window(now.plusSeconds(3),"pending") : new Window(null,"none"));
        if (hand.isEmpty()) { finish(List.of(user),"EMPTY_HAND",now); return; }
        if (!card.joker()) { activeSuit = card.suit(); }
        if (attackTotal > 0 && card.rank().equals("3")) { attackTotal = 0; lastAttack = null; }
        else if (card.attack() > 0) { attackTotal += card.attack(); lastAttack = card; }
        if (card.joker() || card.rank().equals("7")) { stage = "CHOOSE_SUIT"; return; }
        if (card.rank().equals("K")) { extraAction = true; return; }
        if (card.rank().equals("Q")) { direction = -direction; }
        int steps = card.rank().equals("J") ? 2 : 1;
        completeTurn(true,now,steps);
    }

    private void declaration(long actor,String kind,JsonNode input,Instant now) {
        long target = actor;
        if (kind.equals("catch-one")) {
            if (input.size() != 2 || !input.path("targetUserId").isTextual()) { invalid(); }
            try { target = Long.parseLong(input.path("targetUserId").asText()); }
            catch (NumberFormatException exception) { throw new Rejected(Rejection.INVALID_ACTION); }
            if (target == actor) { invalid(); }
        } else if (input.size() != 1) { invalid(); }
        Window window = windows.get(target);
        if (!active.contains(target) || hands.get(target).size() != 1 || window == null
                || !window.status().equals("pending") || !now.isBefore(window.until())) { invalid(); }
        if (kind.equals("declare-one")) {
            windows.put(target,new Window(null,"declared"));
        } else {
            drawCards(target,2);
            windows.put(target,new Window(null,"caught"));
        }
    }

    public void expire(Instant now) {
        if (endedAt != null) { return; }
        for (long user : players) {
            Window window = windows.get(user);
            if (window.status().equals("pending") && !now.isBefore(window.until())) {
                windows.put(user,new Window(null,"expired")); version++;
            }
        }
        while (endedAt == null && !now.isBefore(deadline)) {
            Instant at = deadline;
            if (stage.equals("CHOOSE_SUIT")) {
                activeSuit = chooseSuit(hands.get(players.get(turn)));
                stage = "PLAYING";
                completeTurn(true,at,1);
            } else {
                int count = drawCards(players.get(turn),attackTotal > 0 ? attackTotal : 1);
                attackTotal = 0;
                lastAttack = null;
                completeTurn(count > 0,at,1);
            }
            version++;
        }
    }

    private void completeTurn(boolean progress,Instant now,int steps) {
        if (progress) { stalled.clear(); } else { stalled.add(players.get(turn)); }
        if (stalled.containsAll(active)) {
            int minimum = active.stream().mapToInt(user -> hands.get(user).size()).min().orElseThrow();
            finish(players.stream().filter(active::contains).filter(user -> hands.get(user).size() == minimum).toList(),"STALEMATE",now);
            return;
        }
        for (int step = 0; step < steps; step++) {
            do { turn = Math.floorMod(turn + direction,players.size()); } while (!active.contains(players.get(turn)));
        }
        extraAction = false;
        turnCount++;
        deadline = now.plusSeconds(30);
    }

    private int drawCards(long user,int requested) {
        int given = 0;
        for (; given < requested; given++) {
            if (draw.isEmpty() && discard.size() > 1) {
                draw.addAll(discard.subList(0,discard.size()-1));
                discard.subList(0,discard.size()-1).clear();
                shuffle.accept(draw);
            }
            if (draw.isEmpty()) { break; }
            hands.get(user).add(draw.removeFirst());
        }
        if (given > 0) { windows.put(user,new Window(null,"none")); stalled.clear(); }
        return given;
    }

    public void forfeit(long user,Instant now) {
        if (endedAt != null || !active.contains(user)) { return; }
        if (players.get(turn) == user && stage.equals("CHOOSE_SUIT")) {
            activeSuit = chooseSuit(hands.get(user)); stage = "PLAYING";
        }
        active.remove(user);
        if (forfeitHandPolicy == ForfeitHandPolicy.RECYCLE) {
            draw.addAll(hands.get(user));
            shuffle.accept(draw);
        }
        hands.get(user).clear();
        windows.put(user,new Window(null,"none"));
        stalled.clear();
        version++;
        if (active.size() <= 1) { finish(players.stream().filter(active::contains).toList(),"PLAYER_LEFT",now); }
        else if (players.get(turn) == user) { completeTurn(true,now,1); }
    }

    private String chooseSuit(List<OneCard> hand) {
        String best = OneCard.SUITS.getFirst();
        long maximum = -1;
        for (String suit : OneCard.SUITS) {
            long count = hand.stream().filter(card -> suit.equals(card.suit())).count();
            if (count > maximum) { maximum = count; best = suit; }
        }
        return best;
    }

    private void finish(List<Long> winners,String reason,Instant now) {
        this.winners = List.copyOf(winners);
        this.reason = reason;
        endedAt = now;
        stage = "FINISHED";
        deadline = null;
        extraAction = false;
    }
    private void invalid() { throw new Rejected(Rejection.INVALID_ACTION); }
    private OneCard top() { return discard.getLast(); }
    public boolean isPlayer(long user) { return hands.containsKey(user); }
    public boolean isActive(long user) { return active.contains(user); }
    public List<OneCard> hand(long user) { return List.copyOf(hands.getOrDefault(user,List.of())); }
    public List<String> playable(long user) {
        if (endedAt != null || !active.contains(user) || players.get(turn) != user || !stage.equals("PLAYING")) { return List.of(); }
        return hands.get(user).stream().filter(card -> card.canPlay(top(),activeSuit,attackTotal,lastAttack)).map(OneCard::id).toList();
    }
    public Snapshot snapshot() {
        List<Player> publicPlayers = players.stream().map(user -> new Player(user,hands.get(user).size(),active.contains(user),
                windows.get(user).until(),windows.get(user).status())).toList();
        return new Snapshot(gameId,tableId,players,publicPlayers,version,endedAt == null ? players.get(turn) : null,
                direction,stage,extraAction,top(),activeSuit,draw.size(),attackTotal,lastAttack,deadline,turnCount,winners,reason,endedAt);
    }
    private record Key(long user,String actionId) { }
    private record Accepted(long version,JsonNode input,GameActionResult result) { }
    private record Window(Instant until,String status) { }
    public record Player(long userId,int cardCount,boolean active,Instant oneCardUntil,String oneCardStatus) { }
    public record Snapshot(String gameId,String tableId,List<Long> players,List<Player> publicPlayers,long version,
            Long turnUserId,int direction,String stage,boolean extraAction,OneCard topCard,String activeSuit,int drawCount,
            int attackTotal,OneCard lastAttack,Instant turnDeadline,long turnCount,List<Long> winnerUserIds,String endReason,Instant endedAt) { }
}
