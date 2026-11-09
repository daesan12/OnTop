package com.ssafy.ontop.raffle.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record RaffleDrawResponse(LocalDate weekStartDate, Instant announcesAt, boolean finalized,
        boolean alreadyFinalized, Integer candidateCount, Integer excludedGmCount,
        int expectedPrizeCount, int awardedPrizeCount, int vacantPrizeCount,
        List<Winner> winners) {
    public record Winner(long userId, String nickname, long raffleTicketId, int ticketNumber,
            int place, int slotNumber, String prizeName) {}
}
