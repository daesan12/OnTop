package com.ssafy.ontop.table.controller;

import com.ssafy.ontop.table.service.TableHub;
import java.security.Principal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("local")
public class TableQueryController {

    private final TableHub hub;
    private final boolean authenticated;

    public TableQueryController(TableHub hub,
            @Value("${ontop.websocket.authenticated:true}") boolean authenticated) {
        this.hub = hub;
        this.authenticated = authenticated;
    }

    @GetMapping("/api/v1/tables")
    public ResponseEntity<?> listTables(@RequestParam(required = false) String channelId, Principal principal) {
        if (authenticated && principal == null) {
            return ResponseEntity.status(401).cacheControl(CacheControl.noStore())
                    .body(new QueryError("UNAUTHENTICATED", "로그인이 필요합니다.", null));
        }
        try {
            return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(hub.listTables(channelId));
        } catch (TableHub.TableScopeException exception) {
            int status = exception.code().equals("CHANNEL_REQUIRED") ? 400 : 404;
            return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                    .body(new QueryError(exception.code(), exception.getMessage(), null));
        }
    }

    private record QueryError(String code, String message, Object details) {
    }
}
