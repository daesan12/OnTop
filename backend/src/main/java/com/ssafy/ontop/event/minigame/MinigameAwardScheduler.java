package com.ssafy.ontop.event.minigame;

import org.springframework.scheduling.annotation.Scheduled;

public final class MinigameAwardScheduler {
    private final MinigameAwardService awards;

    public MinigameAwardScheduler(MinigameAwardService awards) {
        this.awards = awards;
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    public void finalizeDueRounds() {
        awards.finalizeDueRounds();
    }
}
