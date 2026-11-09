package com.ssafy.ontop.ranking.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

public record RankingResponse(List<Item> items,
        @Schema(nullable = true, description = "본인 지갑이 없으면 null") MyRank myRank, Instant updatedAt) {
    public RankingResponse {
        items = List.copyOf(items);
    }

    @Schema(name = "RankingItem")
    public record Item(long rank, String userId, String nickname, long coinBalance, long equipmentValue, long totalAssets) {
        public Item(long rank,String userId,String nickname,long coinBalance) { this(rank,userId,nickname,coinBalance,0,coinBalance); }
    }

    @Schema(name = "RankingMyRank")
    public record MyRank(long rank, long coinBalance, long equipmentValue, long totalAssets) {
        public MyRank(long rank,long coinBalance) { this(rank,coinBalance,0,coinBalance); }
    }
}
