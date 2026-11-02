package com.ssafy.ontop.raffle.dto;

import java.time.Instant;

public record RafflePurchaseResponse(long ticketId, long roundId, int ticketNumber, long purchasePrice,
        Instant purchasedAt, long balanceAfter, int purchasedCount, int remainingCount) {
}
