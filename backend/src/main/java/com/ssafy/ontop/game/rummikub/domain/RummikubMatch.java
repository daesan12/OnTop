package com.ssafy.ontop.game.rummikub.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.rummikub.domain.RummikubRules.Placed;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 편집 초안은 클라이언트에만 둔다. 전체 판 검증에 성공한 턴만 원자적으로 확정한다. */
public final class RummikubMatch {
    public static final int TURN_SECONDS = 60;
    private final String gameId;
    private final String tableId;
    private final List<Long> players;
    private final long firstUserId;
    private final List<OpeningDraw> openingDraws;
    private final Map<String, RummikubTile> tiles = new LinkedHashMap<>();
    private final Map<Long, List<RummikubTile>> hands = new LinkedHashMap<>();
    private final List<RummikubTile> pool;
    private final Set<Long> registered = new HashSet<>();
    private final Set<Long> forfeited = new HashSet<>();
    private final Map<Key, Accepted> accepted = new HashMap<>();
    private List<List<Placed>> board = List.of();
    private long version;
    private long turnId = 1;
    private int turn;
    private Set<Long> finalTurnUsers;
    private Instant deadline;
    private Instant endedAt;
    private String endReason;
    private List<Long> winners = List.of();
    private String lastEvent = "START";

    public RummikubMatch(String gameId, String tableId, List<Long> players, List<RummikubTile> deck,
            int firstPlayer, Instant now) {
        this(gameId, tableId, players, deck, firstPlayer, List.of(), now);
    }

    public RummikubMatch(String gameId, String tableId, List<Long> players, List<RummikubTile> deck,
            int firstPlayer, List<OpeningDraw> openingDraws, Instant now) {
        if (gameId == null || gameId.isBlank() || gameId.length() > 120 || tableId == null || tableId.isBlank()
                || players == null || players.size() < 2 || players.size() > 4
                || players.stream().anyMatch(id -> id == null || id <= 0)
                || players.stream().distinct().count() != players.size() || firstPlayer < 0
                || firstPlayer >= players.size() || now == null || deck == null || deck.size() != 106
                || !new HashSet<>(deck).equals(new HashSet<>(RummikubTile.deck()))) {
            throw new IllegalArgumentException("수패마루 경기·참가자·타일을 확인해주세요.");
        }
        this.gameId = gameId;
        this.tableId = tableId;
        this.players = List.copyOf(players);
        this.firstUserId = players.get(firstPlayer);
        this.openingDraws = List.copyOf(openingDraws);
        deck.forEach(tile -> tiles.put(tile.id(), tile));
        for (int index = 0; index < players.size(); index++) {
            hands.put(players.get(index), new ArrayList<>(deck.subList(index * 14, (index + 1) * 14)));
        }
        pool = new ArrayList<>(deck.subList(players.size() * 14, deck.size()));
        turn = firstPlayer;
        deadline = now.plusSeconds(TURN_SECONDS);
    }

    public GameActionResult apply(GameActionCommand command, Instant now) {
        if (!gameId.equals(command.gameId()) || !isPlayer(command.userId())) {
            throw new Rejected(Rejection.ACCESS_DENIED);
        }
        expire(now);
        Key key = new Key(command.userId(), command.actionId());
        Accepted previous = accepted.get(key);
        if (previous != null) {
            if (previous.version() != command.expectedVersion() || !previous.input().equals(command.input())) {
                throw new Rejected(Rejection.ACTION_ID_CONFLICT);
            }
            return previous.result();
        }
        if (endedAt != null) { throw new Rejected(Rejection.GAME_FINISHED); }
        if (!isActive(command.userId())) { throw new Rejected(Rejection.NOT_ACTIVE); }
        if (version != command.expectedVersion()) { throw new Rejected(Rejection.STALE_VERSION); }
        if (players.get(turn) != command.userId()) { throw new Rejected(Rejection.NOT_YOUR_TURN); }
        JsonNode input = command.input();
        if (input.path("kind").asText().equals("draw") && input.size() == 1) {
            draw(now, "DRAW", 1);
        } else if (input.path("kind").asText().equals("play") && input.size() == 2) {
            play(command.userId(), parseBoard(input.path("melds")), now);
        } else {
            invalid();
        }
        version++;
        GameActionResult result = new GameActionResult(command.userId(), gameId, command.actionId(), version);
        accepted.put(key, new Accepted(command.expectedVersion(), input.deepCopy(), result));
        return result;
    }

    private List<List<Placed>> parseBoard(JsonNode source) {
        if (!source.isArray() || source.size() > 35) { invalid(); }
        List<List<Placed>> candidate = new ArrayList<>();
        int count = 0;
        for (JsonNode meld : source) {
            if (!meld.isArray() || meld.size() < 3 || meld.size() > 13) { invalid(); }
            List<Placed> placed = new ArrayList<>();
            for (JsonNode tile : meld) {
                if (!tile.isObject() || tile.size() != 3 || !tile.path("id").isTextual()
                        || !tile.path("color").isTextual() || !tile.path("number").isIntegralNumber()
                        || !tile.path("number").canConvertToInt() || ++count > 106) { invalid(); }
                placed.add(new Placed(tile.path("id").textValue(), tile.path("color").textValue(),
                        tile.path("number").intValue()));
            }
            if (!RummikubRules.validMeld(placed)) { invalid(); }
            candidate.add(List.copyOf(placed));
        }
        return List.copyOf(candidate);
    }

    private void play(long user, List<List<Placed>> candidate, Instant now) {
        Set<String> existing = new HashSet<>(board.stream().flatMap(List::stream).map(Placed::id).toList());
        Set<String> own = new HashSet<>(hands.get(user).stream().map(RummikubTile::id).toList());
        Set<String> seen = new HashSet<>();
        List<Placed> added = new ArrayList<>();
        for (Placed placement : candidate.stream().flatMap(List::stream).toList()) {
            RummikubTile tile = tiles.get(placement.id());
            if (tile == null || !seen.add(tile.id()) || !existing.contains(tile.id()) && !own.contains(tile.id())
                    || !tile.joker() && (!tile.color().equals(placement.color())
                        || tile.number() != placement.number())) { invalid(); }
            if (own.contains(tile.id())) { added.add(placement); }
        }
        if (!seen.containsAll(existing) || added.isEmpty()) { invalid(); }
        if (!registered.contains(user)) {
            // 최초 등록 턴에는 기존 묶음의 순서·역할까지 보존한다.
            if (candidate.size() < board.size() || !candidate.subList(0, board.size()).equals(board)
                    || added.stream().mapToInt(Placed::number).sum() < 30) { invalid(); }
        } else {
            validateJokers(candidate, added);
        }
        // 이 지점 전에는 손패와 공개 판을 변경하지 않는다.
        board = candidate;
        Set<String> playedIds = new HashSet<>(added.stream().map(Placed::id).toList());
        hands.get(user).removeIf(tile -> playedIds.contains(tile.id()));
        registered.add(user);
        lastEvent = "PLAY";
        if (hands.get(user).isEmpty()) { finish(List.of(user), "EMPTY_HAND", now); }
        else { completeTurn(user, now); }
    }

    private void validateJokers(List<List<Placed>> candidate, List<Placed> added) {
        Set<String> replacements = new HashSet<>();
        for (List<Placed> oldMeld : board) {
            for (Placed joker : oldMeld) {
                if (!tiles.get(joker.id()).joker()) { continue; }
                List<Placed> newMeld = candidate.stream().filter(meld -> meld.stream()
                        .anyMatch(tile -> tile.id().equals(joker.id()))).findFirst().orElseThrow();
                if (newMeld.containsAll(oldMeld)) { continue; }
                // 회수한 조커는 같은 턴의 다른 묶음에서 사용하며 손패의 실제 타일로 교체한다.
                Placed replacement = added.stream().filter(tile -> !tiles.get(tile.id()).joker()
                        && tile.color().equals(joker.color()) && tile.number() == joker.number()
                        && !newMeld.contains(tile) && !replacements.contains(tile.id())).findFirst().orElse(null);
                if (replacement == null) { invalid(); }
                replacements.add(replacement.id());
            }
        }
    }

    private void draw(Instant now, String event, int count) {
        long user = players.get(turn);
        boolean alreadyFinalRound = finalTurnUsers != null;
        for (int index = 0; index < count && !pool.isEmpty(); index++) {
            hands.get(players.get(turn)).add(pool.removeLast());
        }
        lastEvent = event;
        if (!alreadyFinalRound && pool.isEmpty()) {
            // 마지막 타일을 뽑은 차례 이후, 모든 활동 참가자에게 한 차례씩 더 준다.
            finalTurnUsers = new HashSet<>(players.stream().filter(this::isActive).toList());
            advance(now);
        } else {
            completeTurn(user, now);
        }
    }

    private void completeTurn(long user, Instant now) {
        if (finalTurnUsers != null) {
            finalTurnUsers.remove(user);
            if (finalTurnUsers.isEmpty()) {
                finishByPenalty(now);
                return;
            }
        }
        advance(now);
    }

    private void finishByPenalty(Instant now) {
        int lowest = players.stream().filter(this::isActive).mapToInt(this::penalty).min().orElseThrow();
        finish(players.stream().filter(this::isActive).filter(user -> penalty(user) == lowest).toList(),
                "STALEMATE", now);
    }

    public void expire(Instant now) {
        if (endedAt == null && !now.isBefore(deadline)) {
            draw(now, "TURN_TIMEOUT", 3);
            version++;
        }
    }

    public void forfeit(long user, Instant now) {
        if (endedAt != null || !isActive(user)) { return; }
        forfeited.add(user);
        if (finalTurnUsers != null) { finalTurnUsers.remove(user); }
        lastEvent = "PLAYER_LEFT";
        List<Long> active = players.stream().filter(this::isActive).toList();
        if (active.size() == 1) { finish(active, "LAST_PLAYER_STANDING", now); }
        else if (finalTurnUsers != null && finalTurnUsers.isEmpty()) { finishByPenalty(now); }
        else if (players.get(turn) == user) { advance(now); }
        version++;
    }

    private void advance(Instant now) {
        do { turn = (turn + 1) % players.size(); } while (!isActive(players.get(turn)));
        turnId++;
        deadline = now.plusSeconds(TURN_SECONDS);
    }

    private void finish(List<Long> winnerIds, String reason, Instant now) {
        winners = List.copyOf(winnerIds);
        if (finalTurnUsers != null) { finalTurnUsers.clear(); }
        endReason = reason;
        endedAt = now;
        deadline = null;
    }

    public boolean isPlayer(long user) { return hands.containsKey(user); }
    public boolean isActive(long user) { return isPlayer(user) && !forfeited.contains(user); }
    public List<RummikubTile> hand(long user) { return List.copyOf(hands.getOrDefault(user, List.of())); }
    private int penalty(long user) { return hands.get(user).stream().mapToInt(RummikubTile::penalty).sum(); }

    public Snapshot snapshot() {
        int losses = players.stream().filter(user -> !winners.contains(user)).mapToInt(this::penalty).sum();
        List<Player> views = players.stream().map(user -> new Player(user, hands.get(user).size(),
                registered.contains(user), forfeited.contains(user), endedAt == null ? null
                        : winners.size() == 1 && winners.contains(user) ? losses : -penalty(user))).toList();
        return new Snapshot(gameId, tableId, players, version, endedAt == null ? players.get(turn) : null,
                turnId, deadline, board, pool.size(), views, winners, endReason, endedAt, lastEvent,
                firstUserId, openingDraws, finalTurnUsers == null ? List.of()
                        : players.stream().filter(finalTurnUsers::contains).toList());
    }

    private static void invalid() { throw new Rejected(Rejection.INVALID_ACTION); }
    private record Key(long user, String actionId) { }
    private record Accepted(long version, JsonNode input, GameActionResult result) { }
    public record Player(long userId, int tileCount, boolean registered, boolean forfeited, Integer score) { }
    public record OpeningDraw(long userId, String color, int number) { }
    public record Snapshot(String gameId, String tableId, List<Long> players, long version, Long turnUserId,
            long turnId, Instant turnDeadline, List<List<Placed>> melds, int poolCount, List<Player> playerViews,
            List<Long> winnerUserIds, String endReason, Instant endedAt, String lastEvent,
            long firstUserId, List<OpeningDraw> openingDraws, List<Long> finalTurnUserIds) { }
}
