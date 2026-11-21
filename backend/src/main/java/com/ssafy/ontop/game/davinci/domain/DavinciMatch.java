package com.ssafy.ontop.game.davinci.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameActionResult;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 서버만 보유하는 숫자/덱. 외부에는 엔진의 사용자별 투영만 전달한다. */
public final class DavinciMatch {
    public static final String GAME_CODE = "DAVINCI_CODE";
    public static final Duration TURN_LIMIT = Duration.ofSeconds(120);
    public enum Stage { SETUP, DRAW, PLACE_TILE, GUESS, CONTINUE, REVEAL, FINISHED }
    public record Event(String kind, long actor, Long target, String tileId, Integer value, Boolean correct) { }
    private record Receipt(JsonNode input, long expectedVersion, GameActionResult result) { }

    private final String gameId;
    private final String tableId;
    private final Instant openingStartedAt;
    private final List<Long> players;
    private final Map<Long, List<CodeTile>> hands = new HashMap<>();
    private final List<CodeTile> pool;
    private final Set<String> revealed = new HashSet<>();
    private final Set<String> unplacedJokers = new HashSet<>();
    private final Set<Long> ready = new HashSet<>();
    private final Set<Long> forfeited = new HashSet<>();
    private final Map<String, Receipt> receipts = new HashMap<>();
    private Stage stage = Stage.SETUP;
    private int turn;
    private long version;
    private CodeTile pendingTile;
    private String drawnTileId;
    private int successes;
    private Instant deadline;
    private Instant endedAt;
    private List<Long> winners = List.of();
    private Event lastEvent;

    public DavinciMatch(String gameId, String tableId, List<Long> players, List<CodeTile> deck, Instant now) {
        if (gameId == null || gameId.isBlank() || tableId == null || tableId.isBlank() || players == null
                || players.size() < 2 || players.size() > 4 || new HashSet<>(players).size() != players.size()
                || players.stream().anyMatch(id -> id == null || id <= 0) || deck.size() != 26
                || deck.stream().map(CodeTile::id).distinct().count() != 26
                || deck.stream().map(tile -> tile.color() + ":" + tile.value()).distinct().count() != 26) {
            throw new IllegalArgumentException("비밀패 경기 구성을 확인해주세요.");
        }
        this.gameId = gameId;
        this.tableId = tableId;
        this.openingStartedAt = now;
        this.players = List.copyOf(players);
        this.pool = new ArrayList<>(deck);
        int count = players.size() == 4 ? 3 : 4;
        for (long user : players) {
            List<CodeTile> hand = new ArrayList<>();
            for (int index = 0; index < count; index++) { hand.add(pool.removeFirst()); }
            hand.sort((left, right) -> left.value() == -1 ? right.value() == -1 ? 0 : 1
                    : right.value() == -1 ? -1 : left.compareNumber(right));
            hands.put(user, hand);
            hand.stream().filter(tile -> tile.value() == -1).forEach(tile -> unplacedJokers.add(tile.id()));
        }
        deadline = now.plus(TURN_LIMIT);
    }

    public GameActionResult apply(GameActionCommand command, Instant now) {
        if (!players.contains(command.userId())) { throw new Rejected(Rejection.ACCESS_DENIED); }
        String receiptId = command.userId() + ":" + command.actionId();
        Receipt previous = receipts.get(receiptId);
        if (previous != null) {
            if (!previous.input().equals(command.input()) || previous.expectedVersion() != command.expectedVersion()) {
                throw new Rejected(Rejection.ACTION_ID_CONFLICT);
            }
            return previous.result();
        }
        if (stage == Stage.FINISHED) { throw new Rejected(Rejection.GAME_FINISHED); }
        if (command.expectedVersion() != version) { throw new Rejected(Rejection.STALE_VERSION); }
        if (!active(command.userId())) { throw new Rejected(Rejection.NOT_ACTIVE); }
        JsonNode input = command.input();
        String kind = input.path("kind").asText();
        if (stage == Stage.SETUP) {
            setup(command.userId(), kind, input, now);
        } else {
            if (players.get(turn) != command.userId()) { throw new Rejected(Rejection.NOT_YOUR_TURN); }
            switch (kind) {
                case "draw" -> draw(input.path("tileId").asText());
                case "place" -> place(input);
                case "guess" -> guess(command.userId(), input, now);
                case "stop" -> {
                    require(stage == Stage.CONTINUE);
                    next(now);
                }
                case "reveal" -> {
                    require(stage == Stage.REVEAL);
                    revealOwn(command.userId(), input.path("tileId").asText(), now);
                }
                default -> throw new Rejected(Rejection.INVALID_ACTION);
            }
        }
        version++;
        GameActionResult result = new GameActionResult(command.userId(), gameId, command.actionId(), version);
        receipts.put(receiptId, new Receipt(input, command.expectedVersion(), result));
        return result;
    }

    public Instant openingStartedAt() { return openingStartedAt; }

    private void setup(long user, String kind, JsonNode input, Instant now) {
        require(!ready.contains(user));
        List<CodeTile> hand = hands.get(user);
        if (kind.equals("place_joker")) {
            String tileId = input.path("tileId").asText();
            CodeTile tile = hand.stream().filter(item -> item.id().equals(tileId)).findFirst().orElse(null);
            require(tile != null && unplacedJokers.contains(tileId) && input.path("position").canConvertToInt()
                    && input.path("position").isIntegralNumber());
            int position = input.path("position").asInt();
            require(position >= 0 && position < hand.size());
            hand.remove(tile);
            hand.add(position, tile);
            unplacedJokers.remove(tileId);
        } else if (kind.equals("ready")) {
            require(hand.stream().noneMatch(tile -> unplacedJokers.contains(tile.id())));
            ready.add(user);
            if (players.stream().allMatch(id -> ready.contains(id) || forfeited.contains(id))) { beginTurn(now); }
        } else { throw new Rejected(Rejection.INVALID_ACTION); }
    }

    private void draw(String tileId) {
        require(stage == Stage.DRAW);
        CodeTile tile = pool.stream().filter(item -> item.id().equals(tileId)).findFirst().orElse(null);
        require(tile != null);
        pool.remove(tile);
        pendingTile = tile;
        drawnTileId = tile.id();
        stage = Stage.PLACE_TILE;
        lastEvent = new Event("DRAW", players.get(turn), null, tile.id(), null, null);
    }

    private void place(JsonNode input) {
        require(stage == Stage.PLACE_TILE && pendingTile != null && input.path("position").isIntegralNumber()
                && input.path("position").canConvertToInt());
        int position = input.path("position").asInt();
        require(validPositions(players.get(turn)).contains(position));
        hands.get(players.get(turn)).add(position, pendingTile);
        pendingTile = null;
        stage = Stage.GUESS;
    }

    private void guess(long user, JsonNode input, Instant now) {
        require(stage == Stage.GUESS || stage == Stage.CONTINUE);
        require(input.path("targetUserId").isTextual() && input.path("targetUserId").asText().matches("[1-9][0-9]{0,18}")
                && input.path("value").isIntegralNumber() && input.path("value").canConvertToInt());
        long target;
        try { target = Long.parseLong(input.path("targetUserId").asText()); }
        catch (NumberFormatException exception) { throw new Rejected(Rejection.INVALID_ACTION); }
        int value = input.path("value").asInt();
        require(target != user && active(target) && value >= -1 && value <= 11);
        CodeTile tile = hands.get(target).stream().filter(item -> item.id().equals(input.path("tileId").asText()))
                .findFirst().orElse(null);
        require(tile != null && !revealed.contains(tile.id()));
        boolean correct = tile.value() == value;
        lastEvent = new Event("GUESS", user, target, tile.id(), value, correct);
        if (correct) {
            revealed.add(tile.id());
            successes++;
            if (!finish(now)) { stage = Stage.CONTINUE; }
        } else if (successes == 0 && drawnTileId != null) {
            revealed.add(drawnTileId);
            if (!finish(now)) { next(now); }
        } else { stage = Stage.REVEAL; }
    }

    private void revealOwn(long user, String tileId, Instant now) {
        require(hands.get(user).stream().anyMatch(tile -> tile.id().equals(tileId) && !revealed.contains(tileId)));
        revealed.add(tileId);
        if (!finish(now)) { next(now); }
    }

    public boolean forfeit(long user, Instant now) {
        if (stage == Stage.FINISHED || !active(user)) { return false; }
        if (players.get(turn) == user && pendingTile != null) {
            hands.get(user).add(validPositions(user).getFirst(), pendingTile);
            pendingTile = null;
        }
        forfeited.add(user);
        hands.get(user).forEach(tile -> revealed.add(tile.id()));
        boolean wasSetup = stage == Stage.SETUP;
        if (!finish(now)) {
            if (wasSetup && players.stream().allMatch(id -> ready.contains(id) || forfeited.contains(id))) {
                beginTurn(now);
            } else if (!wasSetup && players.get(turn) == user) { next(now); }
        }
        lastEvent = new Event("FORFEIT", user, null, null, null, null);
        version++;
        return true;
    }

    /** 방치로 경기가 멈추지 않게 준비는 확정하고, 차례 시간초과는 본인 타일 하나를 공개한다. */
    public void expire(Instant now) {
        if (stage == Stage.FINISHED || now.isBefore(deadline)) { return; }
        if (stage == Stage.SETUP) {
            unplacedJokers.clear();
            ready.addAll(players);
            beginTurn(now);
        } else {
            long user = players.get(turn);
            if (pendingTile != null) {
                hands.get(user).add(validPositions(user).getFirst(), pendingTile);
                pendingTile = null;
            }
            if (stage == Stage.DRAW && !pool.isEmpty()) {
                CodeTile tile = pool.removeFirst();
                pendingTile = tile;
                hands.get(user).add(validPositions(user).getFirst(), tile);
                pendingTile = null;
                drawnTileId = tile.id();
            }
            String tileId = successes == 0 && drawnTileId != null ? drawnTileId
                    : hands.get(user).stream().filter(tile -> !revealed.contains(tile.id())).findFirst().orElseThrow().id();
            revealed.add(tileId);
            lastEvent = new Event("TIMEOUT", user, null, tileId, null, null);
            if (!finish(now)) { next(now); }
        }
        version++;
    }

    private void beginTurn(Instant now) {
        while (!active(players.get(turn))) { turn = (turn + 1) % players.size(); }
        stage = pool.isEmpty() ? Stage.GUESS : Stage.DRAW;
        successes = 0;
        drawnTileId = null;
        pendingTile = null;
        deadline = now.plus(TURN_LIMIT);
    }

    private void next(Instant now) {
        turn = (turn + 1) % players.size();
        beginTurn(now);
    }

    private boolean finish(Instant now) {
        List<Long> alive = players.stream().filter(this::active).toList();
        if (alive.size() > 1) { return false; }
        if (pendingTile != null) {
            hands.get(players.get(turn)).add(validPositions(players.get(turn)).getFirst(), pendingTile);
        }
        winners = alive;
        stage = Stage.FINISHED;
        endedAt = now;
        deadline = null;
        pendingTile = null;
        return true;
    }

    public List<Integer> validPositions(long user) {
        if (pendingTile == null || players.get(turn) != user) { return List.of(); }
        List<CodeTile> hand = hands.get(user);
        List<Integer> positions = new ArrayList<>();
        for (int position = 0; position <= hand.size(); position++) {
            boolean valid = true;
            if (pendingTile.value() != -1) {
                for (int index = 0; index < hand.size(); index++) {
                    CodeTile tile = hand.get(index);
                    if (tile.value() == -1) { continue; }
                    if (index < position ? tile.compareNumber(pendingTile) > 0 : tile.compareNumber(pendingTile) < 0) {
                        valid = false;
                    }
                }
            }
            if (valid) { positions.add(position); }
        }
        return List.copyOf(positions);
    }

    private void require(boolean condition) {
        if (!condition) { throw new Rejected(Rejection.INVALID_ACTION); }
    }

    public boolean active(long user) {
        return hands.containsKey(user) && !forfeited.contains(user)
                && hands.get(user).stream().anyMatch(tile -> !revealed.contains(tile.id()));
    }

    public String gameId() { return gameId; }
    public String tableId() { return tableId; }
    public List<Long> players() { return players; }
    public List<CodeTile> hand(long user) { return List.copyOf(hands.getOrDefault(user, List.of())); }
    public List<CodeTile> pool() { return List.copyOf(pool); }
    public Set<String> revealed() { return Set.copyOf(revealed); }
    public Set<String> unplacedJokers(long user) {
        Set<String> own = new LinkedHashSet<>();
        hand(user).stream().filter(tile -> unplacedJokers.contains(tile.id())).forEach(tile -> own.add(tile.id()));
        return Set.copyOf(own);
    }
    public boolean ready(long user) { return ready.contains(user); }
    public boolean forfeited(long user) { return forfeited.contains(user); }
    public Stage stage() { return stage; }
    public long version() { return version; }
    public Long turnUserId() { return stage == Stage.FINISHED || stage == Stage.SETUP ? null : players.get(turn); }
    public CodeTile pendingTile(long user) { return players.get(turn) == user ? pendingTile : null; }
    public Instant deadline() { return deadline; }
    public Instant endedAt() { return endedAt; }
    public List<Long> winners() { return winners; }
    public Event lastEvent() { return lastEvent; }
}
