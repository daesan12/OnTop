package com.ssafy.ontop.table.domain;

import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.game.start.GameStartResult.Outcome;

// TableHub의 잠금 안에서만 변경한다. 실제 경기 실행 상태와 구분되는 시작 연동 상태다.
public final class TableStartAttempt {

    private final GameStartCommand command;
    private String phase = "STARTING";
    private String code = "START_PENDING";
    private String gameSessionId;
    private boolean dispatched;
    private boolean checking;

    public TableStartAttempt(GameStartCommand command) {
        this.command = command;
    }

    public GameStartCommand command() {
        return command;
    }

    public boolean frozen() {
        return !phase.equals("WAITING");
    }

    public boolean starting() {
        return phase.equals("STARTING");
    }

    public boolean dispatched() {
        return dispatched;
    }

    public void dispatch() {
        dispatched = true;
    }

    public boolean beginCheck() {
        if (checking || !dispatched || !starting()) {
            return false;
        }
        checking = true;
        return true;
    }

    public void finishCheck() {
        checking = false;
    }

    public void uncertain() {
        code = "START_RESULT_UNKNOWN";
    }

    public void apply(GameStartResult result) {
        if (result == null || !command.startAttemptId().equals(result.startAttemptId())
                || result.outcome() == null) {
            code = "START_RESULT_INVALID";
            return;
        }
        if (result.outcome() == Outcome.SUCCEEDED) {
            if (result.gameSessionId() == null || result.gameSessionId().isBlank()
                    || !command.participants().equals(result.participants()) || result.entryFeePerPlayer() != 1
                    || result.totalPot() != command.participants().size()) {
                code = "START_RESULT_INVALID";
                return;
            }
            phase = "CONFIRMED";
            gameSessionId = result.gameSessionId();
            code = null;
        } else if (result.outcome() == Outcome.REJECTED) {
            if (result.gameSessionId() != null || !result.participants().isEmpty() || result.entryFeePerPlayer() != 0
                    || result.totalPot() != 0 || result.code() == null || result.code().isBlank()) {
                code = "START_RESULT_INVALID";
                return;
            }
            phase = "WAITING";
            code = "START_REJECTED";
        } else {
            code = result.outcome() == Outcome.CONFLICT ? "START_CONFLICT" : "START_PENDING";
        }
    }

    public View view(long revision) {
        return new View(command.tableId(), revision, phase, command.startAttemptId().toString(), command.gameCode(),
                gameSessionId, code, true);
    }

    public record View(String tableId, long revision, String phase, String startAttemptId, String gameCode,
            String gameSessionId, String code, boolean simulation) {

        public static View waiting(String tableId, long revision) {
            return new View(tableId, revision, tableId == null ? "NOT_SEATED" : "WAITING", null, "OMOK",
                    null, null, true);
        }
    }
}
