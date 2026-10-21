package com.ssafy.ontop.game.farkle.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameActionResult;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.function.IntSupplier;

// 생성·입력·타이머·조회를 엔진의 같은 잠금 안에서 호출한다.
public final class FarkleMatch {
    private final String gameId;
    private final String tableId;
    private final List<Long> players;
    private final int targetScore;
    private final IntSupplier randomFace;
    private final Map<Key, Accepted> accepted = new HashMap<>();
    private final long[] scores = new long[2];
    private List<Die> dice = List.of();
    private long version;
    private long rollId;
    private int turn;
    private long turnScore;
    private long round = 1;
    private String stage = "AWAITING_ROLL";
    private String lastEvent = "START";
    private boolean hotDice;
    private Instant deadline;
    private Instant endedAt;
    private Long winner;
    private String reason;

    public FarkleMatch(String gameId, String tableId, List<Long> players, int firstPlayer,
            int targetScore, Instant now, IntSupplier randomFace) {
        if (gameId == null || gameId.isBlank() || gameId.length() > 120 || tableId == null || tableId.isBlank()
                || players == null || players.size() != 2 || players.stream().anyMatch(id -> id == null || id <= 0)
                || players.get(0).equals(players.get(1)) || firstPlayer < 0 || firstPlayer > 1
                || !List.of(2000, 4000, 6000).contains(targetScore) || now == null || randomFace == null) {
            throw new IllegalArgumentException("주사위 경기·참가자·목표 점수를 확인해주세요.");
        }
        this.gameId = gameId;
        this.tableId = tableId;
        this.players = List.copyOf(players);
        this.targetScore = targetScore;
        this.randomFace = randomFace;
        turn = firstPlayer;
        deadline = now.plusSeconds(30);
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
        if (endedAt != null) { throw new Rejected(Rejection.INVALID_ACTION); }
        if (version != command.expectedVersion()) { throw new Rejected(Rejection.STALE_VERSION); }
        if (players.get(turn) != command.userId()) { throw new Rejected(Rejection.NOT_YOUR_TURN); }
        JsonNode input = command.input();
        if (input.size() != 2 || !input.path("kind").isTextual() || !input.path("selectedIds").isArray()
                || input.path("selectedIds").size() > 6) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        String kind = input.path("kind").asText();
        if (!kind.equals("roll") && !kind.equals("bank")) { throw new Rejected(Rejection.INVALID_ACTION); }
        List<Integer> selected = new ArrayList<>();
        for (JsonNode value : input.path("selectedIds")) {
            if (!value.isIntegralNumber() || !value.canConvertToInt() || value.intValue() < 0 || value.intValue() > 5
                    || selected.contains(value.intValue())) { throw new Rejected(Rejection.INVALID_ACTION); }
            selected.add(value.intValue());
        }
        int points = selection(selected);
        if (kind.equals("bank")) {
            if (!stage.equals("SELECTING") || points <= 0) { throw new Rejected(Rejection.INVALID_ACTION); }
            scores[turn] += turnScore + points;
            lastEvent = "BANK";
            if (scores[turn] >= targetScore) {
                finish(players.get(turn), "TARGET_REACHED", now);
            } else {
                nextTurn(now);
            }
        } else {
            if (stage.equals("AWAITING_ROLL") && !selected.isEmpty()
                    || stage.equals("SELECTING") && points <= 0) {
                throw new Rejected(Rejection.INVALID_ACTION);
            }
            var heldIds = new HashSet<>(selected);
            for (Die die : dice) { if (die.held()) { heldIds.add(die.id()); } }
            boolean hot = heldIds.size() == 6;
            // 난수 공급 실패 시 점수·버전·주사위를 일부만 변경하지 않는다.
            List<Die> rolled = new ArrayList<>();
            for (int id = 0; id < 6; id++) {
                if (!hot && heldIds.contains(id)) {
                    int heldId = id;
                    Die existing = dice.stream().filter(die -> die.id() == heldId).findFirst().orElseThrow();
                    rolled.add(new Die(id, existing.value(), true));
                } else {
                    int face = randomFace.getAsInt();
                    if (face < 1 || face > 6) { throw new IllegalStateException("주사위 난수 범위 오류"); }
                    rolled.add(new Die(id, face, false));
                }
            }
            turnScore += points;
            dice = List.copyOf(rolled);
            rollId++;
            hotDice = hot;
            lastEvent = hot ? "HOT_DICE" : "ROLL";
            stage = "SELECTING";
            int[] available = dice.stream().filter(die -> !die.held()).mapToInt(Die::value).toArray();
            if (!FarkleScoring.hasScore(available)) {
                lastEvent = "BUST";
                nextTurn(now);
            }
        }
        version++;
        GameActionResult result = new GameActionResult(command.userId(), gameId, command.actionId(), version);
        accepted.put(key, new Accepted(command.expectedVersion(), input.deepCopy(), result));
        return result;
    }

    private int selection(List<Integer> selected) {
        if (stage.equals("AWAITING_ROLL")) {
            if (!selected.isEmpty()) { throw new Rejected(Rejection.INVALID_ACTION); }
            return 0;
        }
        List<Integer> faces = new ArrayList<>();
        for (int id : selected) {
            Die die = dice.stream().filter(value -> value.id() == id && !value.held()).findFirst()
                    .orElseThrow(() -> new Rejected(Rejection.INVALID_ACTION));
            faces.add(die.value());
        }
        int score = FarkleScoring.score(faces.stream().mapToInt(Integer::intValue).toArray());
        if (score < 0) { throw new Rejected(Rejection.INVALID_ACTION); }
        return score;
    }

    public void expire(Instant now) {
        if (endedAt != null || now.isBefore(deadline)) { return; }
        // 지연된 타이머에도 30초 차례를 순서대로 넘기되, 무제한 반복하지 않는다.
        long turns = java.time.Duration.between(deadline, now).getSeconds() / 30 + 1;
        Instant next = deadline.plusSeconds(Math.multiplyExact(turns - 1, 30));
        version += turns;
        round += turns;
        turn = (int) ((turn + turns % 2) % 2);
        turnScore = 0;
        dice = List.of();
        stage = "AWAITING_ROLL";
        hotDice = false;
        lastEvent = "TURN_TIMEOUT";
        deadline = next.plusSeconds(30);
    }

    public void forfeit(long userId, Instant now) {
        if (endedAt == null && isPlayer(userId)) {
            version++;
            finish(players.get(players.get(0) == userId ? 1 : 0), "RECONNECT_EXPIRED", now);
        }
    }

    private void nextTurn(Instant now) {
        turn = 1 - turn;
        round++;
        turnScore = 0;
        dice = List.of();
        hotDice = false;
        stage = "AWAITING_ROLL";
        deadline = now.plusSeconds(30);
    }

    private void finish(long winner, String reason, Instant now) {
        this.winner = winner;
        this.reason = reason;
        endedAt = now;
        deadline = null;
        stage = "FINISHED";
    }

    public boolean isPlayer(long userId) { return players.contains(userId); }

    public Snapshot snapshot() {
        return new Snapshot(gameId, tableId, players, targetScore, version, rollId, round,
                endedAt == null ? players.get(turn) : null, List.of(scores[0], scores[1]), turnScore,
                dice, stage, lastEvent, hotDice, deadline, winner, reason, endedAt);
    }

    public record Die(int id, int value, boolean held) { }
    private record Key(long userId, String actionId) { }
    private record Accepted(long version, JsonNode input, GameActionResult result) { }
    public record Snapshot(String gameId, String tableId, List<Long> players, int targetScore, long version,
            long rollId, long round, Long turnUserId, List<Long> scores, long turnScore, List<Die> dice,
            String stage, String lastEvent, boolean hotDice, Instant turnDeadline, Long winnerUserId,
            String endReason, Instant endedAt) { }
}
