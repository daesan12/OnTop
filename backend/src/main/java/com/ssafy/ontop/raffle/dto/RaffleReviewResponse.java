package com.ssafy.ontop.raffle.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record RaffleReviewResponse(long drawId, LocalDate weekStartDate, Instant announcesAt,
        int attemptNumber, String status, long requestedByUserId, String rerollReason,
        Instant drawnAt, int candidateCount, int excludedGmCount,
        int expectedPrizeCount, int awardedPrizeCount, int vacantPrizeCount,
        List<RaffleDrawResponse.Winner> picks) {}
