package com.ssafy.ontop.minigame.dto;

import java.time.Instant;
import java.util.List;

public record MinigameStartResponse(String minigameSessionId, String minigameType, String status,
        Instant startedAt, String rulesVersion, List<Integer> heats, boolean isFirstGame) {
}
