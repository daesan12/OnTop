package com.ssafy.ontop.minigame.dto;

public record MinigameCompleteResponse(String minigameSessionId, String status, long verifiedCompletedCount,
        long rewardAmount) {
}
