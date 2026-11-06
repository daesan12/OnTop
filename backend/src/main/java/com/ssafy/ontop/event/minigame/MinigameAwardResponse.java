package com.ssafy.ontop.event.minigame;

import java.time.Instant;
import java.time.LocalDate;

public record MinigameAwardResponse(MinigameAwardType eventType, LocalDate weekStartDate,
        Instant startsAt, Instant endsAt, Instant announcesAt, boolean finalized,
        boolean alreadyFinalized, int candidateCount, int excludedGmCount,
        boolean vacant, Winner winner) {
    public record Winner(long userId, String sourceRecordId, long sourceValue,
            Instant sourceAchievedAt, Instant selectedAt, String prizeName) {}
}
