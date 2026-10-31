package com.ssafy.ontop.ranking.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.ranking.dto.ParkRankingResponse;
import com.ssafy.ontop.ranking.exception.RankingException;
import com.ssafy.ontop.ranking.service.ParkRankingSnapshotService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Park Ranking", description = "공원 랭킹판의 세 목록")
public class ParkRankingController {
    private final ObjectProvider<ParkRankingSnapshotService> snapshots;

    public ParkRankingController(ObjectProvider<ParkRankingSnapshotService> snapshots) {
        this.snapshots = snapshots;
    }

    @Operation(summary = "공원 랭킹판 TOP 10", security = @SecurityRequirement(name = "AccessJwt"),
            description = "보유량·단판 최고 순이익·누적 승수의 마지막 정상 1분 스냅샷을 반환합니다. "
                    + "updatedAt은 세 목록의 실제 갱신 완료 시각입니다. 최초 성공 전에는 503을 반환합니다.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "마지막 정상 스냅샷 (Cache-Control: no-store)",
                content = @Content(schema = @Schema(implementation = ParkRankingResponse.class))),
        @ApiResponse(responseCode = "401", description = "Access JWT·회원·sid 검증 실패",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "RANKING_UNAVAILABLE: 최초 집계 전 또는 저장소 부재",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @GetMapping("/api/v1/rankings/park")
    public ResponseEntity<ParkRankingResponse> rankings(
            @Parameter(hidden = true) @AuthenticationPrincipal AuthenticatedUser user) {
        if (user == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
        ParkRankingSnapshotService service = snapshots.getIfAvailable();
        if (service == null) {
            throw new RankingException(RankingException.Error.STORAGE);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").body(service.current());
    }
}
