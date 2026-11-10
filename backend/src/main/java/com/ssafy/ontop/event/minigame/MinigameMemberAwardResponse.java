package com.ssafy.ontop.event.minigame;

import java.time.Instant;
import java.time.LocalDate;

public record MinigameMemberAwardResponse(MinigameAwardType eventType,
        LocalDate weekStartDate, Instant announcesAt, String status,
        Prize prize) {
    public record Prize(String prizeName, long sourceValue, Instant sourceAchievedAt) {}
}
