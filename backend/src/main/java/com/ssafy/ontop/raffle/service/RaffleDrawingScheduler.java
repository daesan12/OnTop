package com.ssafy.ontop.raffle.service;

import org.springframework.scheduling.annotation.Scheduled;

public final class RaffleDrawingScheduler {
    private final RaffleDrawingService drawing;

    public RaffleDrawingScheduler(RaffleDrawingService drawing) {
        this.drawing = drawing;
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    public void finalizeDueRounds() {
        drawing.finalizeDueRounds();
    }
}
