package com.ssafy.ontop.notification.dto;

import com.ssafy.ontop.notification.domain.NotificationReward;
import java.time.Instant;

public record NotificationRewardResponse(NotificationReward.Kind kind, long amount, Instant expiresAt,
        @io.swagger.v3.oas.annotations.media.Schema(nullable = true) Instant claimedAt) {
    public static NotificationRewardResponse of(NotificationReward value, Instant expiresAt) {
        return new NotificationRewardResponse(value.kind(), value.amount(), expiresAt, value.claimedAt());
    }
}
