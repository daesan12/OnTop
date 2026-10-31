package com.ssafy.ontop.ranking.dto;

import java.time.Instant;
import java.util.List;

public record ParkRankingResponse(List<BalanceItem> balance, List<ProfitItem> singleGameProfit,
                                  List<WinsItem> wins, Instant updatedAt) {
    public ParkRankingResponse {
        balance = List.copyOf(balance);
        singleGameProfit = List.copyOf(singleGameProfit);
        wins = List.copyOf(wins);
    }

    public record BalanceItem(long rank, String userId, String nickname, long coinBalance) {
    }

    public record ProfitItem(long rank, String userId, String nickname, long profit) {
    }

    public record WinsItem(long rank, String userId, String nickname, long winCount) {
    }
}
