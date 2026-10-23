package com.ssafy.ontop.minigame.dto;

import java.time.Instant;

public record MinigameStatusResponse(String minigameSessionId, String status, Long score, long rewardAmount,
        Instant startedAt, Instant endedAt) {
}
