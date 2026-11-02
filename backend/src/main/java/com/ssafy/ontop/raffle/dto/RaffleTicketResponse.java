package com.ssafy.ontop.raffle.dto;

import java.time.Instant;

public record RaffleTicketResponse(long ticketId, int ticketNumber, Instant purchasedAt) {
}
