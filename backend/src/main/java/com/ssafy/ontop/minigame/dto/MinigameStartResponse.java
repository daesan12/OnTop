package com.ssafy.ontop.minigame.dto;

import java.time.Instant;

public record MinigameStartResponse(String minigameSessionId, String minigameType, String status,
        Instant startedAt) {
}
