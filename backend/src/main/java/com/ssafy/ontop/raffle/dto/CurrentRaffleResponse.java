package com.ssafy.ontop.raffle.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record CurrentRaffleResponse(long roundId, LocalDate weekStartDate, String salesStatus,
        Instant salesStartsAt, Instant salesEndsAt, long ticketPrice, int weeklyLimit,
        int purchasedCount, int remainingCount, long balance, long reservedBalance,
        long availableBalance, List<RaffleTicketResponse> tickets) {
}
