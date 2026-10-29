package com.ssafy.ontop.history.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

public record GameHistoryPageResponse(List<Item> items,
        @Schema(type = "string", nullable = true, description = "다음 페이지가 있을 때 마지막 경기 DB ID")
        String nextCursor, boolean hasNext) {
    @Schema(name = "GameHistoryItem")
    public record Item(String gameSessionId, String gameCode, String status,
            @Schema(nullable = true, description = "WIN/LOSE/FORFEIT/DRAW. 판정 없는 무효 경기는 null")
            String myResult, String settlementStatus, Instant endedAt) {
    }
}
