package com.ssafy.ontop.game.start;

import java.util.List;
import java.util.UUID;

public record GameStartResult(UUID startAttemptId, Outcome outcome, String gameSessionId,
        List<GameStartCommand.Participant> participants, long reservedAmountPerPlayer, long totalReservedAmount, String code) {

    public GameStartResult {
        participants = participants == null ? List.of() : List.copyOf(participants);
    }

    public static GameStartResult reserved(GameStartCommand command, String gameSessionId) {
        return new GameStartResult(command.startAttemptId(), Outcome.RESERVED, gameSessionId,
                command.participants(), command.betAmountPerPlayer(),
                Math.multiplyExact(command.betAmountPerPlayer(), command.participants().size()), null);
    }

    public static GameStartResult rejected(UUID attemptId, String code) {
        return new GameStartResult(attemptId, Outcome.REJECTED, null, List.of(), 0, 0, code);
    }

    public static GameStartResult pending(UUID attemptId) {
        return new GameStartResult(attemptId, Outcome.PENDING, null, List.of(), 0, 0, null);
    }

    public static GameStartResult conflict(UUID attemptId) {
        return new GameStartResult(attemptId, Outcome.CONFLICT, null, List.of(), 0, 0, "IDEMPOTENCY_CONFLICT");
    }

    public enum Outcome {
        RESERVED, REJECTED, PENDING, CONFLICT
    }

    public boolean isReservationCommitted(GameStartCommand command) {
        return command.startAttemptId().equals(startAttemptId) && outcome == Outcome.RESERVED
                && gameSessionId != null && !gameSessionId.isBlank() && gameSessionId.length() <= 120
                && command.participants().equals(participants)
                && reservedAmountPerPlayer == command.betAmountPerPlayer()
                && totalReservedAmount == Math.multiplyExact(command.betAmountPerPlayer(), command.participants().size());
    }
}
