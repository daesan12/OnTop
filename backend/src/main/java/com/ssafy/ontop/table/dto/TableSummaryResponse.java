package com.ssafy.ontop.table.dto;

public record TableSummaryResponse(String tableId, int capacity, int minimumPlayers, int occupiedSeats,
        int availableSeats, int readyCount, boolean allReady, String status, boolean joinable, String gameCode) {
}
