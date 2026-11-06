package com.ssafy.ontop.event.asset;

import java.time.Instant;
import java.time.LocalDate;

public record AssetMemberAwardResponse(String eventType, String valuationBasis,
        LocalDate weekStartDate, Instant announcesAt, String status, AssetPrize prize) {
    public record AssetPrize(int place, String prizeName, long coinBalance,
            Instant firstReachedAt) {}
}
