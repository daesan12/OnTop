package com.ssafy.ontop.event.asset;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record AssetAwardPreviewResponse(String eventType, String valuationBasis,
        LocalDate weekStartDate, Instant startsAt, Instant endsAt, Instant announcesAt,
        String status, int candidateCount, int excludedGmCount, List<AssetRank> ranks) {
    public record AssetRank(int place, long userId, String nickname, String sourceRecordId,
            long coinBalance, Instant firstReachedAt) {}
}
