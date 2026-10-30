package com.ssafy.ontop.game.ledger.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.ledger.domain.DiceLedgerScoring.Category;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.IntSupplier;

// 생성·입력·타이머·조회를 엔진의 같은 잠금 안에서 호출한다.
public final class DiceLedgerMatch {
    public static final int TURN_SECONDS = 30;
    public static final int MAX_ROLLS = 3;
    private static final int DICE = 5;
    private final String gameId;
    private final String tableId;
    private final List<Long> players;
    private final IntSupplier randomFace;
    private final Map<Key, Accepted> accepted = new HashMap<>();
    private final Integer[][] cards;
    private final Set<Long> forfeited = new HashSet<>();
    private List<Die> dice = List.of();
    private long version;
    private long rollId;
    private long turnId = 1;
    private int turn;
    private int rollCount;
    private String lastEvent = "START";
    private Scored lastScored;
    private Instant deadline;
    private Instant endedAt;
    private List<Long> winners = List.of();
    private String endReason;

    public DiceLedgerMatch(String gameId, String tableId, List<Long> players, int firstPlayer, Instant now,
            IntSupplier randomFace) {
        if (gameId == null || gameId.isBlank() || gameId.length() > 120 || tableId == null || tableId.isBlank()
                || players == null || players.size() < 2 || players.size() > 4
                || players.stream().anyMatch(id -> id == null || id <= 0)
                || players.stream().distinct().count() != players.size()
                || firstPlayer < 0 || firstPlayer >= players.size() || now == null || randomFace == null) {
            throw new IllegalArgumentException("주사위 장부 경기·참가자를 확인해주세요.");
        }
        this.gameId = gameId;
        this.tableId = tableId;
        this.players = List.copyOf(players);
        this.randomFace = randomFace;
        cards = new Integer[players.size()][Category.values().length];
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
        if (forfeited.contains(command.userId())) { throw new Rejected(Rejection.NOT_ACTIVE); }
        if (version != command.expectedVersion()) { throw new Rejected(Rejection.STALE_VERSION); }
        if (players.get(turn) != command.userId()) { throw new Rejected(Rejection.NOT_YOUR_TURN); }
        JsonNode input = command.input();
        String kind = input.path("kind").asText();
        if (input.size() != 2 || !input.path("kind").isTextual()) { throw new Rejected(Rejection.INVALID_ACTION); }
        if (kind.equals("roll")) {
            roll(keepIds(input.path("keepIds")));
        } else if (kind.equals("score") && input.path("category").isTextual()) {
            Category category = Category.find(input.path("category").textValue());
            if (category == null || rollCount == 0 || cards[turn][category.ordinal()] != null) {
                throw new Rejected(Rejection.INVALID_ACTION);
            }
            record(category, false);
            lastEvent = "SCORE";
            advance(now);
        } else {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        version++;
        GameActionResult result = new GameActionResult(command.userId(), gameId, command.actionId(), version);
        accepted.put(key, new Accepted(command.expectedVersion(), input.deepCopy(), result));
        return result;
    }

    private Set<Integer> keepIds(JsonNode values) {
        if (!values.isArray() || values.size() > DICE || rollCount >= MAX_ROLLS
                || rollCount == 0 && !values.isEmpty()) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        Set<Integer> keep = new HashSet<>();
        for (JsonNode value : values) {
            if (!value.isIntegralNumber() || !value.canConvertToInt() || value.intValue() < 0
                    || value.intValue() >= DICE || !keep.add(value.intValue())) {
                throw new Rejected(Rejection.INVALID_ACTION);
            }
        }
        return keep;
    }

    // 난수 공급 실패 시 주사위·굴림 횟수를 일부만 변경하지 않는다.
    private void roll(Set<Integer> keep) {
        List<Die> rolled = new ArrayList<>();
        for (int id = 0; id < DICE; id++) {
            if (keep.contains(id)) {
                rolled.add(new Die(id, dice.get(id).value(), true));
            } else {
                int face = randomFace.getAsInt();
                if (face < 1 || face > 6) { throw new IllegalStateException("주사위 난수 범위 오류"); }
                rolled.add(new Die(id, face, false));
            }
        }
        dice = List.copyOf(rolled);
        rollCount++;
        rollId++;
        lastEvent = "ROLL";
    }

    private void record(Category category, boolean auto) {
        int points = DiceLedgerScoring.score(category, faces());
        cards[turn][category.ordinal()] = points;
        lastScored = new Scored(players.get(turn), category.name(), points, auto, turnId);
    }

    public void expire(Instant now) {
        // 지연된 타이머에도 30초 차례를 순서대로 처리한다. 매 차례 칸 하나가 채워지므로 반복은 유한하다.
        while (endedAt == null && !now.isBefore(deadline)) {
            Instant at = deadline;
            if (rollCount == 0) { roll(Set.of()); }
            record(bestEmpty(), true);
            lastEvent = "TURN_TIMEOUT";
            version++;
            advance(at);
        }
    }

    // 빈 칸 중 현재 주사위로 가장 높은 칸. 같은 점수면 점수표 순서상 앞 칸을 고른다.
    private Category bestEmpty() {
        Category best = null;
        int bestPoints = -1;
        for (Category category : Category.values()) {
            if (cards[turn][category.ordinal()] != null) { continue; }
            int points = DiceLedgerScoring.score(category, faces());
            if (points > bestPoints) {
                best = category;
                bestPoints = points;
            }
        }
        return best;
    }

    public void forfeit(long userId, Instant now) {
        if (endedAt != null || !isActive(userId)) { return; }
        forfeited.add(userId);
        version++;
        lastEvent = "PLAYER_LEFT";
        List<Long> live = live();
        if (live.size() == 1) {
            finish(live, "LAST_PLAYER_STANDING", now);
        } else if (players.get(turn) == userId) {
            advance(now);
        }
    }

    private void advance(Instant now) {
        List<Long> live = live();
        if (live.stream().allMatch(userId -> full(players.indexOf(userId)))) {
            long best = live.stream().mapToLong(userId -> total(players.indexOf(userId))).max().orElse(0);
            finish(live.stream().filter(userId -> total(players.indexOf(userId)) == best).toList(),
                    "ALL_CATEGORIES_FILLED", now);
            return;
        }
        for (int step = 1; step <= players.size(); step++) {
            int next = (turn + step) % players.size();
            if (!forfeited.contains(players.get(next)) && !full(next)) {
                turn = next;
                break;
            }
        }
        turnId++;
        rollCount = 0;
        dice = List.of();
        deadline = now.plusSeconds(TURN_SECONDS);
    }

    private void finish(List<Long> users, String reason, Instant at) {
        winners = List.copyOf(users);
        endReason = reason;
        endedAt = at;
        deadline = null;
    }

    private int[] faces() { return dice.stream().mapToInt(Die::value).toArray(); }
    private boolean full(int index) { return Arrays.stream(cards[index]).allMatch(java.util.Objects::nonNull); }
    private List<Long> live() { return players.stream().filter(userId -> !forfeited.contains(userId)).toList(); }

    private int upper(int index) {
        int sum = 0;
        for (Category category : Category.values()) {
            Integer value = cards[index][category.ordinal()];
            if (category.upper() && value != null) { sum += value; }
        }
        return sum;
    }

    private long total(int index) {
        int sum = 0;
        for (Integer value : cards[index]) { if (value != null) { sum += value; } }
        return sum + DiceLedgerScoring.upperBonus(upper(index));
    }

    public boolean isPlayer(long userId) { return players.contains(userId); }
    public boolean isActive(long userId) { return isPlayer(userId) && !forfeited.contains(userId); }

    public Snapshot snapshot() {
        List<Card> views = new ArrayList<>();
        for (int index = 0; index < players.size(); index++) {
            int upper = upper(index);
            views.add(new Card(players.get(index), forfeited.contains(players.get(index)),
                    java.util.Collections.unmodifiableList(Arrays.asList(cards[index].clone())), upper,
                    DiceLedgerScoring.upperBonus(upper), total(index)));
        }
        return new Snapshot(gameId, tableId, players, version, rollId, turnId,
                endedAt == null ? players.get(turn) : null,
                endedAt == null ? (int) Arrays.stream(cards[turn]).filter(java.util.Objects::nonNull).count() + 1 : null,
                rollCount, dice, List.copyOf(views), lastEvent, lastScored, deadline, winners, endReason, endedAt);
    }

    public record Die(int id, int value, boolean held) { }
    public record Scored(long userId, String category, int points, boolean auto, long turnId) { }
    public record Card(long userId, boolean forfeited, List<Integer> scores, int upperSubtotal, int upperBonus,
            long total) { }
    private record Key(long userId, String actionId) { }
    private record Accepted(long version, JsonNode input, GameActionResult result) { }
    public record Snapshot(String gameId, String tableId, List<Long> players, long version, long rollId,
            long turnId, Long turnUserId, Integer round, int rollCount, List<Die> dice, List<Card> cards,
            String lastEvent, Scored lastScored, Instant turnDeadline, List<Long> winnerUserIds,
            String endReason, Instant endedAt) { }
}
