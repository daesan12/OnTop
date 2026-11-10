package com.ssafy.ontop.event.asset;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record AssetAwardResponse(String eventType, String valuationBasis, LocalDate weekStartDate,
        Instant startsAt, Instant endsAt, Instant announcesAt, boolean finalized,
        boolean alreadyFinalized, int candidateCount, int excludedGmCount, List<AssetWinner> winners) {
    public record AssetWinner(int place, String prizeName, long userId, String nickname, String sourceRecordId,
            long sourceValue, Instant sourceAchievedAt, Instant selectedAt) {}
}
