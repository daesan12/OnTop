package com.ssafy.ontop.table.controller;

import com.ssafy.ontop.table.dto.TableListResponse;
import com.ssafy.ontop.table.service.TableHub;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("local")
public class TableQueryController {

    private final TableHub hub;

    public TableQueryController(TableHub hub) {
        this.hub = hub;
    }

    @GetMapping("/api/v1/tables")
    public ResponseEntity<TableListResponse> listTables() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(hub.listTables());
    }
}
