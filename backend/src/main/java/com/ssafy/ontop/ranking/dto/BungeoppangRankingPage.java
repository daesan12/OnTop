package com.ssafy.ontop.ranking.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

@Schema(name = "BungeoppangRankingPage")
public record BungeoppangRankingPage(String rulesVersion, String period, String basis, String snapshotId,
        Instant updatedAt, long totalParticipants, List<Item> items, @Schema(nullable = true) Item me,
        @Schema(nullable = true) String nextCursor) {
    @Schema(name = "BungeoppangRankingItem")
    public record Item(long rank, String userId, String nickname, long made, long failed, Instant completedAt) { }
}
