package com.ssafy.ontop.table.dto;

import java.util.List;

public record TableListResponse(List<TableSummaryResponse> tables) {

    public TableListResponse {
        tables = List.copyOf(tables);
    }
}
