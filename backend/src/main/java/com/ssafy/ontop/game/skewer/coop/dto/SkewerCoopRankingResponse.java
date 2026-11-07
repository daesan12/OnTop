package com.ssafy.ontop.game.skewer.coop.dto;

import java.time.Instant;
import java.util.List;

/** 같은 두 회원의 최고 팀 기록. 역할을 바꾸어도 별개의 팀으로 중복 등록하지 않는다. */
public record SkewerCoopRankingResponse(String rulesVersion, String period, String aggregation, Instant asOf,
        List<Item> items, Item myBest, String playMode) {
    public SkewerCoopRankingResponse(String rulesVersion, String period, String aggregation, Instant asOf,
            List<Item> items, Item myBest) {
        this(rulesVersion, period, aggregation, asOf, items, myBest, "VR");
    }
    public SkewerCoopRankingResponse {
        items = List.copyOf(items);
    }

    public record Item(long rank, String gameId, String chefUserId, String chefNickname, String serverUserId,
            String serverNickname, int teamScore, int served, Instant endedAt) {
    }
}
