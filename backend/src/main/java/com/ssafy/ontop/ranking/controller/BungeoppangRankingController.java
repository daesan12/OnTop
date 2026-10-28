package com.ssafy.ontop.ranking.controller;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.ranking.dto.BungeoppangRankingPage;
import com.ssafy.ontop.ranking.service.BungeoppangRankingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Bungeoppang Ranking", description = "붕어빵 버전별 개인 최고 기록")
public class BungeoppangRankingController {
    private final BungeoppangRankingService service;
    public BungeoppangRankingController(BungeoppangRankingService service) { this.service = service; }
    @Operation(summary = "붕어빵 버전별 개인 최고 전체 랭킹", security = @SecurityRequirement(name = "AccessJwt"),
            description = "v4/v5의 확정 완료·정산 기록을 분리합니다. 완성 내림차순·실수 오름차순, 동점1,1,3. "
                    + "커서 없는 조회는 최신 DB를 읽고 후속 페이지는 최대2분의 동일 스냅샷을 읽습니다.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "동일 스냅샷 페이지 (no-store)",
                content = @Content(schema = @Schema(implementation = BungeoppangRankingPage.class))),
        @ApiResponse(responseCode = "400", description = "INVALID_LIMIT / INVALID_CURSOR / RANKING_INVALID_PERIOD / RANKING_INVALID_RULES_VERSION",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "401", description = "회원 인증 필요",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "Origin·권한 거부",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "409", description = "RANKING_SNAPSHOT_EXPIRED — 처음부터 재조회",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "RANKING_UNAVAILABLE / RANKING_TOO_LARGE",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @GetMapping("/api/v1/minigames/bungeoppang/rankings")
    public ResponseEntity<BungeoppangRankingPage> rankings(
            @Parameter(hidden = true) @AuthenticationPrincipal AuthenticatedUser user,
            @Parameter(schema = @Schema(allowableValues = {"ALL_TIME"}, defaultValue = "ALL_TIME"))
            @RequestParam(defaultValue = "ALL_TIME") String period,
            @Parameter(schema = @Schema(allowableValues = {"v4", "v5"}, defaultValue = "v5"))
            @RequestParam(defaultValue = "v5") String rulesVersion,
            @Parameter(schema = @Schema(type = "integer", minimum = "1", maximum = "20", defaultValue = "20"))
            @RequestParam(defaultValue = "20") String limit,
            @RequestParam(required = false) String cursor) {
        if (user == null) { throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED); }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer")
                .body(service.find(user.userId(), period, rulesVersion, limit, cursor));
    }
}
