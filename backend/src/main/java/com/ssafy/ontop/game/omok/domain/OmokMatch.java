package com.ssafy.ontop.game.omok.domain;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameActionResult;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

// 호출자는 경기 변경·조회 전체를 같은 잠금 안에서 수행한다.
public final class OmokMatch {
    private final String gameId;
    private final String tableId;
    private final long blackUserId;
    private final long whiteUserId;
    private final Instant startsAt;
    private final OmokBoard board = new OmokBoard();
    private final Map<ActionKey, AcceptedAction> accepted = new HashMap<>();
    private long version;
    private long turnUserId;
    private Long winnerUserId;
    private Instant turnDeadline;
    private Instant endedAt;
    private String endReason;
    private Undo undo;
    private UndoDecision undoDecision;

    public OmokMatch(String gameId, String tableId, long blackUserId, long whiteUserId, Instant startedAt) {
        if (gameId == null || gameId.isBlank() || gameId.length() > 120 || tableId == null || tableId.isBlank()
                || blackUserId <= 0 || whiteUserId <= 0 || blackUserId == whiteUserId || startedAt == null) {
            throw new IllegalArgumentException("오목 경기와 참가자를 확인해주세요.");
        }
        this.gameId = gameId;
        this.tableId = tableId;
        this.blackUserId = blackUserId;
        this.whiteUserId = whiteUserId;
        this.startsAt = startedAt;
        turnUserId = blackUserId;
        turnDeadline = startedAt.plusSeconds(30);
    }

    public GameActionResult apply(GameActionCommand command, Instant now) {
        if (!isPlayer(command.userId()) || !gameId.equals(command.gameId())) {
            throw new Rejected(Rejection.ACCESS_DENIED);
        }
        expire(now);
        ActionKey key = new ActionKey(command.userId(), command.actionId());
        AcceptedAction previous = accepted.get(key);
        if (previous != null) {
            if (previous.version() != command.expectedVersion() || !previous.input().equals(command.input())) {
                throw new Rejected(Rejection.ACTION_ID_CONFLICT);
            }
            return previous.result();
        }
        if (endedAt != null) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        if (now.isBefore(startsAt)) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        if (command.expectedVersion() != version) {
            throw new Rejected(Rejection.STALE_VERSION);
        }
        JsonNode input = command.input();
        if ("undoRespond".equals(input.path("kind").asText())) {
            respondUndo(command, input);
            return accept(command, key, input);
        }
        if (command.userId() != turnUserId) {
            throw new Rejected(Rejection.NOT_YOUR_TURN);
        }
        if (undo != null) throw new Rejected(Rejection.INVALID_ACTION);
        if ("undoRequest".equals(input.path("kind").asText())) {
            if (input.size() != 1 || board.snapshot().moveCount() < 2) {
                throw new Rejected(Rejection.INVALID_ACTION);
            }
            Instant deadline = now.plusSeconds(10).isBefore(turnDeadline) ? now.plusSeconds(10) : turnDeadline;
            undo = new Undo(command.actionId(), Long.toString(command.userId()), deadline);
            undoDecision = null;
            version++;
            return accept(command, key, input);
        }
        if (input.size() != 2 || !coordinate(input.get("x")) || !coordinate(input.get("y"))) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        try {
            board.place(command.userId() == blackUserId ? OmokBoard.Stone.BLACK : OmokBoard.Stone.WHITE,
                    input.get("x").intValue(), input.get("y").intValue());
        } catch (OmokBoard.ForbiddenMove exception) {
            throw new Rejected(Rejection.FORBIDDEN_MOVE);
        } catch (IllegalArgumentException exception) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        version++;
        undoDecision = null;
        switch (board.snapshot().outcome()) {
            case BLACK_WIN -> finish(blackUserId, "FIVE_IN_ROW", now);
            case WHITE_WIN -> finish(whiteUserId, "FIVE_IN_ROW", now);
            case DRAW -> finish(null, "BOARD_FULL", now);
            case PLAYING -> {
                turnUserId = opponent(turnUserId);
                turnDeadline = now.plusSeconds(30);
            }
        }
        return accept(command, key, input);
    }

    private GameActionResult accept(GameActionCommand command, ActionKey key, JsonNode input) {
        GameActionResult result = new GameActionResult(command.userId(), gameId, command.actionId(), version);
        accepted.put(key, new AcceptedAction(command.expectedVersion(), input, result));
        return result;
    }

    private void respondUndo(GameActionCommand command, JsonNode input) {
        if (input.size() != 3 || !input.path("requestId").isTextual() || !input.path("accept").isBoolean()
                || undo == null || !undo.requestId().equals(input.path("requestId").textValue())
                || command.userId() == turnUserId) {
            throw new Rejected(Rejection.INVALID_ACTION);
        }
        Undo pending = undo;
        if (input.path("accept").booleanValue()) board.undoPair();
        undo = null;
        undoDecision = new UndoDecision(pending.requestId(), input.path("accept").booleanValue() ? "ACCEPTED" : "REJECTED");
        version++;
    }

    public void expire(Instant now) {
        if (endedAt == null && !now.isBefore(turnDeadline)) {
            version++;
            // 대기 중에도 착수 시계는 흐른다. 동시 만료는 시간패를 우선한다.
            finish(opponent(turnUserId), "TURN_TIMEOUT", turnDeadline);
            return;
        }
        if (endedAt == null && undo != null && !now.isBefore(undo.deadline())) {
            Undo expired = undo;
            undo = null;
            undoDecision = new UndoDecision(expired.requestId(), "EXPIRED");
            version++;
        }
    }

    public void forfeit(long userId, Instant now) {
        forfeit(userId, now, "RECONNECT_EXPIRED");
    }

    public void forfeit(long userId, Instant now, String reason) {
        if (endedAt == null && isPlayer(userId)) {
            version++;
            finish(opponent(userId), reason, now);
        }
    }

    public Snapshot snapshot() {
        return new Snapshot(gameId, tableId, blackUserId, whiteUserId, version, board.snapshot(),
                endedAt == null ? turnUserId : null, winnerUserId, turnDeadline, endedAt, endReason, undo, undoDecision);
    }

    public boolean isPlayer(long userId) {
        return userId == blackUserId || userId == whiteUserId;
    }

    private long opponent(long userId) {
        return userId == blackUserId ? whiteUserId : blackUserId;
    }

    private void finish(Long winner, String reason, Instant at) {
        winnerUserId = winner;
        endedAt = at;
        endReason = reason;
        turnDeadline = null;
        undo = null;
        undoDecision = null;
    }

    private boolean coordinate(JsonNode value) {
        return value != null && value.isIntegralNumber() && value.canConvertToInt()
                && value.intValue() >= 0 && value.intValue() < OmokBoard.SIZE;
    }

    private record ActionKey(long userId, String actionId) { }
    private record AcceptedAction(long version, JsonNode input, GameActionResult result) { }
    public record Undo(String requestId, String requesterUserId, Instant deadline) { }
    public record UndoDecision(String requestId, String status) { }
    public record Snapshot(String gameId, String tableId, long blackUserId, long whiteUserId, long version,
            OmokBoard.Snapshot board, Long turnUserId, Long winnerUserId, Instant turnDeadline,
            Instant endedAt, String endReason, Undo undo, UndoDecision undoDecision) { }
}
