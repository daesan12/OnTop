package com.ssafy.ontop.ranking.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.ranking.dto.RankingResponse;
import com.ssafy.ontop.ranking.exception.RankingException;
import com.ssafy.ontop.ranking.service.RankingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "Ranking", description = "보유 엽전 랭킹")
public class RankingController {
    private final RankingService service;

    public RankingController(RankingService service) {
        this.service = service;
    }

    @Operation(summary = "보유 엽전 랭킹", security = @SecurityRequirement(name = "AccessJwt"),
            description = "활성 회원의 전체 balance(예약 포함) 내림차순. 동점 순위는 1,1,3이며 표시 순서는 "
                    + "userId 오름차순입니다. 상위 limit명과 인증된 본인 순위를 같은 DB 조회로 반환합니다. "
                    + "탈퇴 회원·지갑 없는 회원은 제외하고 본인 지갑이 없으면 myRank=null입니다. "
                    + "updatedAt은 조회 시각입니다. 지갑 생성·지급·차감·예약을 수행하지 않습니다.")
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공 (Cache-Control: no-store)"),
        @ApiResponse(responseCode = "400", description = "INVALID_LIMIT",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "401", description = "기존 Access JWT·활성 회원·sid 검증 실패",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "기존 Origin·권한 정책에 따른 거부",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "RANKING_UNAVAILABLE 또는 인증 DB 조회 불가",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @GetMapping("/api/v1/rankings")
    public ResponseEntity<RankingResponse> rankings(
            @Parameter(hidden = true) @AuthenticationPrincipal AuthenticatedUser user,
            @Parameter(description = "기본 20, 1~100",
                    schema = @Schema(type = "integer", defaultValue = "20", minimum = "1", maximum = "100"))
            @RequestParam(required = false) String limit) {
        if (user == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
        int size = 20;
        if (limit != null) {
            if (!limit.matches("[0-9]{1,3}")) {
                throw new RankingException(RankingException.Error.INVALID_LIMIT);
            }
            size = Integer.parseInt(limit);
            if (size < 1 || size > 100) {
                throw new RankingException(RankingException.Error.INVALID_LIMIT);
            }
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").body(service.findRankings(user.userId(), size));
    }
}
