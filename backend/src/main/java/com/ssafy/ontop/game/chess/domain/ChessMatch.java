package com.ssafy.ontop.game.chess.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameActionResult;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 엔진의 경기 잠금 안에서만 접근한다. 10분 대국, 증분 없음. 기물 가치는 정산 점수가 아니다. */
public final class ChessMatch {
    public static final long INITIAL_CLOCK_MS = 600_000;
    private final String gameId;
    private final String tableId;
    private final List<Long> players;
    private final Map<String, Accepted> receipts = new HashMap<>();
    private final Map<String, Integer> repetitions = new HashMap<>();
    private final List<String> moves = new ArrayList<>();
    private final long[] remaining = {INITIAL_CLOCK_MS, INITIAL_CLOCK_MS};
    private ChessPosition position;
    private Instant turnStarted;
    private long version;
    private Long winner;
    private Instant endedAt;
    private String reason;
    private Long drawOfferedBy;
    private final java.util.Set<Long> drawOffersUsed = new java.util.HashSet<>();

    public ChessMatch(String gameId, String tableId, List<Long> players, Instant now) {
        this(gameId, tableId, players, now, ChessPosition.initial());
    }

    public ChessMatch(String gameId, String tableId, List<Long> players, Instant now, ChessPosition position) {
        if (gameId == null || gameId.isBlank() || tableId == null || tableId.isBlank() || tableId.length() > 120
                || players.size() != 2 || players.stream().anyMatch(id -> id == null || id <= 0)
                || players.get(0).equals(players.get(1)) || now == null) {
            throw new IllegalArgumentException("체스 경기와 두 참가자를 확인해주세요.");
        }
        this.gameId = gameId;
        this.tableId = tableId;
        this.players = List.copyOf(players);
        this.turnStarted = now;
        this.position = position;
        repetitions.put(position.repetitionKey(), 1);
    }

    public GameActionResult apply(GameActionCommand command, Instant now) {
        if (!isPlayer(command.userId()) || !gameId.equals(command.gameId())) {
            throw new Rejected(Rejection.ACCESS_DENIED);
        }
        String receiptKey = command.userId() + ":" + command.actionId();
        Accepted previous = receipts.get(receiptKey);
        if (previous != null) {
            if (previous.version() != command.expectedVersion() || !previous.input().equals(command.input())) {
                throw new Rejected(Rejection.ACTION_ID_CONFLICT);
            }
            return previous.result();
        }
        expire(now);
        if (endedAt != null) { throw new Rejected(Rejection.GAME_FINISHED); }
        if (command.expectedVersion() != version) { throw new Rejected(Rejection.STALE_VERSION); }
        JsonNode input = command.input();
        String kind = input.path("kind").asText();
        switch (kind) {
            case "drawOffer" -> {
                if (input.size() != 1 || drawOfferedBy != null || !drawOffersUsed.add(command.userId())) {
                    throw new Rejected(Rejection.INVALID_ACTION);
                }
                drawOfferedBy = command.userId();
            }
            case "drawRespond" -> {
                if (input.size() != 2 || !input.path("accept").isBoolean() || drawOfferedBy == null
                        || drawOfferedBy == command.userId()) {
                    throw new Rejected(Rejection.INVALID_ACTION);
                }
                drawOfferedBy = null;
                if (input.path("accept").booleanValue()) { finish(null, "AGREED_DRAW", now); }
            }
            case "move", "claimDraw" -> {
                if (command.userId() != turnUserId()) { throw new Rejected(Rejection.NOT_YOUR_TURN); }
                if (kind.equals("claimDraw")) {
                    claimDraw(input, now);
                } else {
                    ChessPosition.Move move = parseMove(input);
                    ChessPosition next;
                    try { next = position.play(move); }
                    catch (IllegalArgumentException exception) { throw new Rejected(Rejection.INVALID_ACTION); }
                    remaining[position.whiteToMove() ? 0 : 1] = remainingForTurn(now);
                    position = next;
                    moves.add(move.uci());
                    turnStarted = now;
                    if (drawOfferedBy != null && drawOfferedBy != command.userId()) { drawOfferedBy = null; }
                    int repetition = repetitions.merge(position.repetitionKey(), 1, Integer::sum);
                    if (position.legalMoves().isEmpty()) {
                        if (position.inCheck(position.whiteToMove())) { finish(command.userId(), "CHECKMATE", now); }
                        else { finish(null, "STALEMATE", now); }
                    } else if (position.insufficientMaterial()) { finish(null, "INSUFFICIENT_MATERIAL", now); }
                    else if (repetition >= 5) { finish(null, "FIVEFOLD_REPETITION", now); }
                    else if (position.halfmove() >= 150) { finish(null, "SEVENTY_FIVE_MOVES", now); }
                }
            }
            default -> throw new Rejected(Rejection.INVALID_ACTION);
        }
        version++;
        GameActionResult result = new GameActionResult(command.userId(), gameId, command.actionId(), version);
        receipts.put(receiptKey, new Accepted(command.expectedVersion(), input, result));
        return result;
    }

    private void claimDraw(JsonNode input, Instant now) {
        ChessPosition candidate = position;
        int count = repetitions.getOrDefault(position.repetitionKey(), 0);
        if (input.has("from")) {
            try { candidate = position.play(parseMove(input)); }
            catch (IllegalArgumentException exception) { throw new Rejected(Rejection.INVALID_ACTION); }
            count = repetitions.getOrDefault(candidate.repetitionKey(), 0) + 1;
        } else if (input.size() != 1) { throw new Rejected(Rejection.INVALID_ACTION); }
        if (count >= 3) { finish(null, "THREEFOLD_REPETITION", now); }
        else if (candidate.halfmove() >= 100) { finish(null, "FIFTY_MOVES", now); }
        else { throw new Rejected(Rejection.INVALID_ACTION); }
    }

    private ChessPosition.Move parseMove(JsonNode input) {
        if ((input.size() != 3 && input.size() != 4) || !input.path("from").isTextual()
                || !input.path("to").isTextual() || input.size() == 4 && !input.has("promotion")) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        String promotion = input.has("promotion") ? input.path("promotion").asText() : null;
        if (promotion != null && (!input.path("promotion").isTextual() || !promotion.matches("[qrbn]"))) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        return new ChessPosition.Move(input.path("from").textValue(), input.path("to").textValue(), promotion);
    }

    private long remainingForTurn(Instant now) {
        return Math.max(0, remaining[position.whiteToMove() ? 0 : 1]
                - Math.max(0, Duration.between(turnStarted, now).toMillis()));
    }

    public void expire(Instant now) {
        if (endedAt == null && remainingForTurn(now) <= 0) {
            Instant deadline = deadline();
            remaining[position.whiteToMove() ? 0 : 1] = 0;
            finish(position.canPossiblyMate(!position.whiteToMove()) ? opponent(turnUserId()) : null,
                    position.canPossiblyMate(!position.whiteToMove()) ? "TIMEOUT" : "TIMEOUT_DRAW", deadline);
            version++;
        }
    }

    public void forfeit(long userId, Instant now, String endReason) {
        if (!isPlayer(userId)) { throw new Rejected(Rejection.ACCESS_DENIED); }
        if (endedAt == null) {
            finish(opponent(userId), endReason, now);
            version++;
        }
    }

    private void finish(Long winner, String reason, Instant at) {
        remaining[position.whiteToMove() ? 0 : 1] = remainingForTurn(at);
        this.winner = winner;
        this.reason = reason;
        this.endedAt = at;
        this.drawOfferedBy = null;
    }

    public boolean isPlayer(long userId) { return players.contains(userId); }
    public long opponent(long userId) { return players.get(players.get(0) == userId ? 1 : 0); }
    public long turnUserId() { return players.get(position.whiteToMove() ? 0 : 1); }
    public Instant deadline() { return turnStarted.plusMillis(remaining[position.whiteToMove() ? 0 : 1]); }
    public ChessPosition position() { return position; }
    public String gameId() { return gameId; }
    public String tableId() { return tableId; }
    public List<Long> players() { return players; }
    public long version() { return version; }
    public Long winner() { return winner; }
    public Instant endedAt() { return endedAt; }
    public String reason() { return reason; }
    public Long drawOfferedBy() { return drawOfferedBy; }
    public List<String> moves() { return List.copyOf(moves); }
    public List<Long> drawOffersUsed() { return drawOffersUsed.stream().sorted().toList(); }
    public long[] remaining() { return remaining.clone(); }
    public Instant turnStarted() { return turnStarted; }
    public boolean canClaimDraw() {
        return endedAt == null && (position.halfmove() >= 100
                || repetitions.getOrDefault(position.repetitionKey(), 0) >= 3);
    }
    private record Accepted(long version, JsonNode input, GameActionResult result) { }
}
