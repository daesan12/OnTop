package com.ssafy.ontop.raffle.dto;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

public record RaffleMemberResultResponse(LocalDate weekStartDate, Instant announcesAt,
        String status, List<Prize> prizes) {
    public record Prize(int place, String prizeName, int ticketNumber) {}
}
