package com.ssafy.ontop.game.skewer.coop.service;

import com.ssafy.ontop.game.skewer.coop.dto.SkewerCoopRankingResponse;
import com.ssafy.ontop.game.skewer.coop.dto.SkewerCoopResultResponse;
import java.time.Instant;
import java.util.Optional;

public interface SkewerCoopResultStore {
    void settle(SkewerCoopFinished result, Instant at);

    Optional<SkewerCoopResultResponse> find(long user, String gameId, Instant now);

    SkewerCoopRankingResponse ranking(long user, Instant now);
}
