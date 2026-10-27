package com.ssafy.ontop.table.dto;

import io.swagger.v3.oas.annotations.media.Schema;

public record TableSummaryResponse(String tableId, int capacity, int minimumPlayers, int occupiedSeats,
        int availableSeats, int readyCount, boolean allReady, String status, boolean joinable, String gameCode,
        Integer targetScore,
        @Schema(nullable = true, description = "선택자가 확정한 1인 참가비. 미선택/빈 테이블은 null") Long betAmountPerPlayer,
        @Schema(nullable = true, description = "PLAYING인 확정 경기의 공개 gameId. 나머지 상태는 null") String gameId,
        @Schema(nullable = true, description = "현재 방장. 빈 테이블은 null") String selectorUserId,
        @Schema(nullable = true, description = "MANUAL의 선택 정원. AUTO는 null") Integer selectedPlayers,
        @Schema(allowableValues = {"AUTO", "MANUAL"}, description = "기존 자동 시작 또는 새 태블릿 수동 시작") String startMode) {
}
