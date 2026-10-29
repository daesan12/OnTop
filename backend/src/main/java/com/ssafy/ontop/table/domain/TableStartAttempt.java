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
    private final java.util.Set<String> endedGames = new java.util.HashSet<>();
    private final java.util.Set<String> settledGames = new java.util.HashSet<>();

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

    public String phase() { return phase; }

    public boolean endRound() {
        if (!phase.equals("PLAYING")) { return false; }
        phase = "SETTLING";
        return true;
    }

    public void rememberEnd(String gameId) { endedGames.add(gameId); }
    public boolean endedEarly() { return gameSessionId != null && endedGames.contains(gameSessionId); }
    public void markSettled(String gameId) { settledGames.add(gameId); }

    public boolean returnAfterSettlement() {
        if (!phase.equals("SETTLING") || !settledGames.contains(gameSessionId)) { return false; }
        phase = "WAITING";
        return true;
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
        if (result.outcome() == Outcome.RESERVED) {
            if (!result.isReservationCommitted(command)) {
                code = "START_RESULT_INVALID";
                return;
            }
            phase = "CONFIRMED";
            gameSessionId = result.gameSessionId();
            code = null;
        } else if (result.outcome() == Outcome.REJECTED) {
            if (result.gameSessionId() != null || !result.participants().isEmpty() || result.reservedAmountPerPlayer() != 0
                    || result.totalReservedAmount() != 0 || result.code() == null || result.code().isBlank()) {
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
        return view(revision, true);
    }

    public void playing() {
        if (phase.equals("CONFIRMED")) { phase = "PLAYING"; }
    }

    public View view(long revision, boolean simulation) {
        return new View(command.tableId(), revision, phase, command.startAttemptId().toString(), command.gameCode(),
                gameSessionId, code, simulation);
    }

    public record View(String tableId, long revision, String phase, String startAttemptId, String gameCode,
            String gameSessionId, String code, boolean simulation) {

        public static View waiting(String tableId, long revision, String gameCode) {
            return waiting(tableId, revision, gameCode, true);
        }

        public static View waiting(String tableId, long revision, String gameCode, boolean simulation) {
            return new View(tableId, revision, tableId == null ? "NOT_SEATED" : "WAITING", null, gameCode,
                    null, null, simulation);
        }
    }
}
