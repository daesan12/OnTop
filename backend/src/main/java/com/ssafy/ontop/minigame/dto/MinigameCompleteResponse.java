package com.ssafy.ontop.minigame.dto;

public record MinigameCompleteResponse(String minigameSessionId, String status, long verifiedCompletedCount,
        long rewardAmount, long score, int made, int golden, int failed, int wasted, int maxCombo,
        long coinsCalculated, long coinsGranted, long todayEarned, int dailyCap, boolean capReached) {
}
