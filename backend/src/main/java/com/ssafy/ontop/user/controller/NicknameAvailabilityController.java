package com.ssafy.ontop.user.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.user.dto.NicknameAvailabilityResponse;
import com.ssafy.ontop.user.service.NicknameAvailabilityService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
@Tag(name = "User")
public class NicknameAvailabilityController {

    private final NicknameAvailabilityService service;

    public NicknameAvailabilityController(NicknameAvailabilityService service) {
        this.service = service;
    }

    @Operation(summary = "닉네임 사용 가능 여부", description = "Access JWT 또는 온보딩 전용 Bearer 중 하나를 사용합니다. 온보딩 토큰은 소비/연장하지 않습니다. 완성형 한글/영문/숫자 2~8자, 대소문자 무시, 탈퇴 회원 포함. 기존 회원의 현재 닉네임은 true입니다. 조회는 예약이 아니며 실제 가입/변경 시 최종 검증이 필요합니다.",
            security = {@SecurityRequirement(name = "AccessJwt"), @SecurityRequirement(name = "OnboardingBearer")})
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공 (Cache-Control: no-store)",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = NicknameAvailabilityResponse.class))),
        @ApiResponse(responseCode = "400", description = "USER_INVALID_NICKNAME",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "401", description = "AUTH_AUTHENTICATION_REQUIRED / AUTH_INVALID_ACCESS_TOKEN / AUTH_MEMBER_STATE_CHANGED / AUTH_INVALID_ONBOARDING_TOKEN",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED / AUTH_REQUEST_REJECTED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "AUTH_TOKEN_CONFIGURATION_ERROR",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "USER_ONBOARDING_UNAVAILABLE / AUTH_MEMBER_LOOKUP_UNAVAILABLE",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @GetMapping("/nickname-availability")
    public ResponseEntity<NicknameAvailabilityResponse> check(
            @RequestParam(required = false) String nickname, HttpServletRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").body(service.check(request, nickname));
    }
}
