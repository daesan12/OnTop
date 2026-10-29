package com.ssafy.ontop.admin.analytics;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/admin/analytics")
@Tag(name = "ADMIN")
public class AdminAnalyticsController {
    private final AnalyticsSnapshotStore snapshots;

    public AdminAnalyticsController(AnalyticsSnapshotStore snapshots) {
        this.snapshots = snapshots;
    }

    @GetMapping("/summary")
    @Operation(summary = "백업 기준 일별·게임별 관리자 집계", security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "익명 집계와 백업 기준·생성 시각"),
        @ApiResponse(responseCode = "401", description = "로그인 필요",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "관리자 조회 권한 필요",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "게시된 집계 파일 없음 또는 손상",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    public ResponseEntity<AnalyticsSnapshot> summary() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(snapshots.read());
    }

    @ExceptionHandler(AnalyticsSnapshotStore.SnapshotUnavailableException.class)
    public ResponseEntity<AuthErrorResponse> unavailable() {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).cacheControl(CacheControl.noStore())
                .body(new AuthErrorResponse("ANALYTICS_SNAPSHOT_UNAVAILABLE", "집계가 아직 준비되지 않았습니다."));
    }
}
