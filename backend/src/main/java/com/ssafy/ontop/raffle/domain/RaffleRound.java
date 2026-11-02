package com.ssafy.ontop.raffle.domain;

import java.time.Instant;
import java.time.LocalDate;

public record RaffleRound(long id, LocalDate weekStartDate, Instant salesStartsAt, Instant salesEndsAt,
        long ticketPrice, int weeklyTicketLimit, String salesStatus) {
}
