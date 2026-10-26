package com.ssafy.ontop.table.dto;

import java.util.List;

public record TableListResponse(List<TableSummaryResponse> tables, List<java.util.Map<String,String>> bindings) {
    public TableListResponse(List<TableSummaryResponse> tables) { this(tables,List.of()); }

    public TableListResponse {
        tables = List.copyOf(tables);
        bindings = List.copyOf(bindings);
    }
}
