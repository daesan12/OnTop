package com.ssafy.ontop.world.fitness;

import io.swagger.v3.oas.annotations.media.Schema;

/** 운동 수입은 서버 원장 확정값이며 다음 시각은 지급 확정을 의미하지 않는다. */
@Schema(requiredProperties = {"enabled", "earningsDate", "todayEarned", "dailyCap", "rewardIntervalSeconds",
        "serverNow", "nextRewardAt", "activeLeaseId"})
public record FitnessRewardStatusResponse(boolean enabled, String earningsDate, long todayEarned, int dailyCap,
        int rewardIntervalSeconds, long serverNow, @Schema(nullable = true) Long nextRewardAt,
        @Schema(nullable = true) String activeLeaseId) {
}
