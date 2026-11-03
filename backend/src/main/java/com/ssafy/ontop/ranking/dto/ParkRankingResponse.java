package com.ssafy.ontop.ranking.dto;

import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

public record ParkRankingResponse(@Size(max = 10) List<BalanceItem> balance,
                                  @Size(max = 10) List<BungeoppangItem> bungeoppang,
                                  @Size(max = 10) List<JumpmapItem> jumpmap,
                                  Instant updatedAt) {
    public ParkRankingResponse {
        balance = List.copyOf(balance);
        bungeoppang = List.copyOf(bungeoppang);
        jumpmap = List.copyOf(jumpmap);
    }

    public record BalanceItem(long rank, String userId, String nickname, long coinBalance, boolean gameMaster) {
        public BalanceItem(long rank, String userId, String nickname, long coinBalance) {
            this(rank, userId, nickname, coinBalance, false);
        }
    }

    public record BungeoppangItem(long rank, String userId, String nickname, long score, long maxCombo,
                                  Instant completedAt, boolean gameMaster) {
        public BungeoppangItem(long rank, String userId, String nickname, long score, long maxCombo,
                Instant completedAt) {
            this(rank, userId, nickname, score, maxCombo, completedAt, false);
        }
    }

    public record JumpmapItem(long rank, String userId, String nickname, long finishMs, Instant completedAt,
                              boolean gameMaster) {
        public JumpmapItem(long rank, String userId, String nickname, long finishMs, Instant completedAt) {
            this(rank, userId, nickname, finishMs, completedAt, false);
        }
    }
}
