package com.ssafy.ontop.event.asset;

import org.springframework.scheduling.annotation.Scheduled;

final class AssetAwardScheduler {
    private final AssetAwardService awards;

    AssetAwardScheduler(AssetAwardService awards) {
        this.awards = awards;
    }

    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    public void finalizeDueRound() {
        awards.finalizeDueRound();
    }
}
