package com.ssafy.ontop.history.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.util.List;

public record GameStatsResponse(List<Item> items) {
    @Schema(name = "GameStatsItem")
    public record Item(String gameCode, long played, long wins, long losses, long forfeits, long draws) {
    }
}
