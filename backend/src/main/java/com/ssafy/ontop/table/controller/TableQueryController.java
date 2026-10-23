package com.ssafy.ontop.table.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.table.service.TableHub;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.security.Principal;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("(local | dev) & !prod & !production")
@Tag(name = "Table")
public class TableQueryController {

    private final TableHub hub;
    private final boolean authenticated;

    public TableQueryController(TableHub hub,
            @Value("${ontop.websocket.authenticated:true}") boolean authenticated) {
        this.hub = hub;
        this.authenticated = authenticated;
    }

    @Operation(summary = "채널 테이블 목록 조회", description = "local/dev 프로필에서 실제 TableHub의 현재 상태를 조회하며 입장/예약하지 않습니다. channelId 누락/불일치 시 기존 400/404 정책을 따릅니다. Access JWT와 활성 회원 검증이 필요합니다. 비인증 개발 데모는 정식 사용 대상이 아닙니다.",
            security = {@SecurityRequirement(name = "AccessJwt")})
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공 (Cache-Control: no-store)",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = com.ssafy.ontop.table.dto.TableListResponse.class))),
        @ApiResponse(responseCode = "400", description = "CHANNEL_REQUIRED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "401", description = "UNAUTHENTICATED 또는 REST 인증 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "FORBIDDEN 또는 REST 인가 오류",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "404", description = "존재하지 않는 채널",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "SERVICE_UNAVAILABLE 또는 REST 회원 조회 장애",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
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
