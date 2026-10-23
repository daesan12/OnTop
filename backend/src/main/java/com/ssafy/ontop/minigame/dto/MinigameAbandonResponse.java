package com.ssafy.ontop.minigame.dto;

public record MinigameAbandonResponse(String minigameSessionId, String status, long rewardAmount) {
}
