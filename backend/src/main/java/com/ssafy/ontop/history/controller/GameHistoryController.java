package com.ssafy.ontop.history.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.history.dto.GameHistoryPageRequest;
import com.ssafy.ontop.history.dto.GameHistoryPageResponse;
import com.ssafy.ontop.history.dto.GameStatsResponse;
import com.ssafy.ontop.history.service.GameHistoryService;
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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users/me")
@Tag(name = "HISTORY", description = "인증된 본인의 종료 경기 내역과 게임별 전적")
@SecurityRequirement(name = "AccessJwt")
@ApiResponses({
    @ApiResponse(responseCode = "401", description = "AUTH_AUTHENTICATION_REQUIRED / AUTH_INVALID_ACCESS_TOKEN / AUTH_MEMBER_STATE_CHANGED",
            content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
    @ApiResponse(responseCode = "403", description = "Origin·회원 권한 거부",
            content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
    @ApiResponse(responseCode = "503", description = "HISTORY_UNAVAILABLE / AUTH_MEMBER_LOOKUP_UNAVAILABLE",
            content = @Content(schema = @Schema(implementation = AuthErrorResponse.class)))
})
public class GameHistoryController {
    private final GameHistoryService service;

    public GameHistoryController(GameHistoryService service) {
        this.service = service;
    }

    @Operation(summary = "내 경기 내역", description = "본인 참가 종료·무효 경기의 DB ID 내림차순. "
            + "cursor 미만을 size+1건 조회하며 정산 대기도 표시합니다. 진행 중 경기는 제외합니다.")
    @ApiResponse(responseCode = "200", description = "본인 경기 내역 (no-store)",
            content = @Content(mediaType = "application/json",
                    schema = @Schema(implementation = GameHistoryPageResponse.class)))
    @ApiResponse(responseCode = "400", description = "INVALID_CURSOR / INVALID_SIZE / UNSUPPORTED_GAME",
            content = @Content(schema = @Schema(implementation = AuthErrorResponse.class)))
    @GetMapping("/games")
    public ResponseEntity<GameHistoryPageResponse> games(
            @Parameter(hidden = true) @AuthenticationPrincipal AuthenticatedUser user,
            @Parameter(description = "마지막 경기 DB ID. 다음 페이지는 이 ID 미만", schema = @Schema(type = "string"))
            @RequestParam(required = false) String cursor,
            @Parameter(schema = @Schema(type = "integer", minimum = "1", maximum = "100", defaultValue = "20"))
            @RequestParam(required = false) String size,
            @Parameter(schema = @Schema(allowableValues = {"OMOK", "DICE", "ONE_CARD", "LIAR_BRIDGE", "DICE_LEDGER", "HALLI_GALLI", "ALKKAGI", "QUORIDOR"}))
            @RequestParam(required = false) String gameCode) {
        requireUser(user);
        return response(service.findHistory(user.userId(), GameHistoryPageRequest.parse(cursor, size, gameCode)));
    }

    @Operation(summary = "내 게임별 전적", description = "FINISHED의 확정 결과만 집계합니다. INVALID·진행 중은 제외, "
            + "기권은 losses에 중복 포함하지 않습니다. 기록이 있는 게임만 코드순으로 반환합니다.")
    @ApiResponse(responseCode = "200", description = "본인 게임별 전적 (no-store)",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = GameStatsResponse.class)))
    @GetMapping("/game-stats")
    public ResponseEntity<GameStatsResponse> stats(
            @Parameter(hidden = true) @AuthenticationPrincipal AuthenticatedUser user) {
        requireUser(user);
        return response(service.findStats(user.userId()));
    }

    private static void requireUser(AuthenticatedUser user) {
        if (user == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
    }

    private static <T> ResponseEntity<T> response(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").body(body);
    }
}
