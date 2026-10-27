package com.ssafy.ontop.user.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.user.service.UserWithdrawalService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
@Tag(name = "User")
public class UserWithdrawalController {

    private final UserWithdrawalService service;

    public UserWithdrawalController(UserWithdrawalService service) {
        this.service = service;
    }

    @Operation(summary = "회원 탈퇴", description = "회원 행을 잠그고 deleted_at 기록 및 모든 Refresh 계열 폐기를 한 DB 트랜잭션에서 수행합니다. 커밋 후 모든 WebSocket을 4403으로 종료합니다. 게임 연결부가 등록돼 있으면 MEMBER_DEACTIVATED로 즉시 이탈을 요청하며, 경기 전체 종료·지갑 정산 완료와는 구분합니다. 회원/관련 기록을 영구 삭제하지 않습니다. 기존 OAuth는 7일 이내 복구하며 7일 초과 재가입은 보류합니다. 이미 탈퇴한 회원의 JWT는 401입니다.",
            security = {@SecurityRequirement(name = "AccessJwt")})
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "성공. 응답 본문 없음", content = @Content),
        @ApiResponse(responseCode = "401", description = "AUTH_AUTHENTICATION_REQUIRED / AUTH_INVALID_ACCESS_TOKEN / AUTH_MEMBER_STATE_CHANGED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED / AUTH_REQUEST_REJECTED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "AUTH_TOKEN_CONFIGURATION_ERROR",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "USER_WITHDRAWAL_UNAVAILABLE / AUTH_MEMBER_LOOKUP_UNAVAILABLE",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @DeleteMapping("/me")
    public ResponseEntity<Void> withdraw(@AuthenticationPrincipal AuthenticatedUser user) {
        if (user == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
        service.withdraw(user.userId());
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").build();
    }
}
