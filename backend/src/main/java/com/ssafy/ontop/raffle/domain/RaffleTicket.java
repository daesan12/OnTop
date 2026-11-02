package com.ssafy.ontop.raffle.domain;

import java.time.Instant;

public record RaffleTicket(long id, long roundId, long userId, int ticketNumber, long purchasePrice,
        long balanceAfter, long walletTransactionId, String idempotencyKey, Instant purchasedAt) {
}
