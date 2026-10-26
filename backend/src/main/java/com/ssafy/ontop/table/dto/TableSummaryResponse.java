package com.ssafy.ontop.table.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record TableSummaryResponse(String tableId, int capacity, int minimumPlayers, int occupiedSeats,
        int availableSeats, int readyCount, boolean allReady, String status, boolean joinable, String gameCode,
        Integer targetScore,
        @Schema(nullable = true, description = "선택자가 확정한 1인 참가비. 미선택/빈 테이블은 null") Long betAmountPerPlayer,
        @Schema(nullable = true, description = "PLAYING인 확정 경기의 공개 gameId. 나머지 상태는 null") String gameId) {
}
