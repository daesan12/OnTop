package com.ssafy.ontop.ranking.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

public record ParkRankingResponse(List<BalanceItem> balance,
                                  @Schema(nullable = true) BungeoppangChampion bungeoppangChampion,
                                  @Schema(nullable = true) JumpmapChampion jumpmapChampion,
                                  Instant updatedAt) {
    public ParkRankingResponse {
        balance = List.copyOf(balance);
    }

    public record BalanceItem(long rank, String userId, String nickname, long coinBalance) {
    }

    public record BungeoppangChampion(String userId, String nickname, long score, long maxCombo,
                                     Instant completedAt) {
    }

    public record JumpmapChampion(String userId, String nickname, long finishMs, Instant completedAt) {
    }
}
