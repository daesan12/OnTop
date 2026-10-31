package com.ssafy.ontop.ranking.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

@Schema(name = "BungeoppangRankingPage")
public record BungeoppangRankingPage(String rulesVersion,
        @Schema(nullable = true, description = "v5 기록의 플레이 시간(ms). 판에 저장된 시작·종료 시각 차이로 구분합니다. v4는 null.",
                allowableValues = {"120000", "180000"}) Integer durationMs,
        String period, String basis, String snapshotId,
        Instant updatedAt, long totalParticipants, List<Item> items, @Schema(nullable = true) Item me,
        @Schema(nullable = true) String nextCursor) {
    @Schema(name = "BungeoppangRankingItem")
    public record Item(long rank, String userId, String nickname, long made, long failed,
            Instant completedAt, long score, long maxCombo) {
    }
}
