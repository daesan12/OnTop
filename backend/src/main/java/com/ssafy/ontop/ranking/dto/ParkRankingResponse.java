package com.ssafy.ontop.ranking.dto;

import jakarta.validation.constraints.Size;
import java.time.Instant;
import java.util.List;

public record ParkRankingResponse(@Size(max = 10) List<BalanceItem> balance,
                                  @Size(max = 10) List<MoleItem> mole,
                                  @Size(max = 10) List<SpeedMoleItem> speedMole,
                                  Instant updatedAt) {
    public ParkRankingResponse {
        balance = List.copyOf(balance);
        mole = List.copyOf(mole);
        speedMole = List.copyOf(speedMole);
    }

    public record BalanceItem(long rank, String userId, String nickname, long coinBalance, boolean gameMaster,
                              long equipmentValue, long totalAssets) {
        public BalanceItem(long rank,String userId,String nickname,long coinBalance,boolean gameMaster) {
            this(rank,userId,nickname,coinBalance,gameMaster,0,coinBalance);
        }
        public BalanceItem(long rank, String userId, String nickname, long coinBalance) {
            this(rank, userId, nickname, coinBalance, false);
        }
    }

    public record MoleItem(long rank, String userId, String nickname, long score, long maxCombo,
                           Instant completedAt, boolean gameMaster) {
        public MoleItem(long rank, String userId, String nickname, long score, long maxCombo, Instant completedAt) {
            this(rank, userId, nickname, score, maxCombo, completedAt, false);
        }
    }

    public record SpeedMoleItem(long rank, String userId, String nickname, long score, long misses,
                                Instant completedAt, boolean gameMaster) {
        public SpeedMoleItem(long rank, String userId, String nickname, long score, long misses,
                Instant completedAt) {
            this(rank, userId, nickname, score, misses, completedAt, false);
        }
    }
}
