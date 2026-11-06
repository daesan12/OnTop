package com.ssafy.ontop.game.skewer.coop.service;

import com.ssafy.ontop.game.skewer.coop.dto.SkewerCoopRankingResponse;
import com.ssafy.ontop.game.skewer.coop.dto.SkewerCoopResultResponse;
import java.time.Instant;
import java.util.Optional;

public interface SkewerCoopResultStore {
    void settle(SkewerCoopFinished result, Instant at);

    Optional<SkewerCoopResultResponse> find(long user, String gameId, Instant now);

    SkewerCoopRankingResponse ranking(long user, Instant now);

    default SkewerCoopRankingResponse ranking(long user, Instant now, String mode) {
        if (!"VR".equals(mode)) {
            throw new IllegalStateException("PC 랭킹을 지원하는 저장소가 필요합니다.");
        }
        return ranking(user, now);
    }
}
