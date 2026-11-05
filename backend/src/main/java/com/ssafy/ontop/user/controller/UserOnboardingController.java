package com.ssafy.ontop.user.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.user.dto.UserOnboardingRequest;
import com.ssafy.ontop.user.dto.UserOnboardingResponse;
import com.ssafy.ontop.user.service.UserOnboardingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
@Tag(name = "User")
public class UserOnboardingController {

    private final UserOnboardingService service;

    public UserOnboardingController(UserOnboardingService service) {
        this.service = service;
    }

    @Operation(summary = "신규 회원 온보딩", description = "온보딩 전용 Bearer만 허용하며 JSESSIONID가 필요 없습니다. nickname/characterGender만 입력합니다. 닉네임은 중복 조회·닉네임 수정과 같은 규칙(완성형 한글/영문/숫자 2~8자, GM 접두어 금지, 욕설·비속어 금지)으로 최종 검증합니다. 회원·지갑·최초 100코인 SIGNUP_BONUS 원장·Refresh 저장은 원자적입니다. 201 성공 후 토큰 소비; 확인된 닉네임 충돌+롤백(409 USER_NICKNAME_ALREADY_EXISTS)만 같은 토큰으로 재시도하며 최초 만료는 연장하지 않습니다. 중복 소셜 계정/기타 실패/커밋 불명은 새 OAuth가 필요합니다.",
            security = {@SecurityRequirement(name = "OnboardingBearer")},
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
                    content = @Content(schema = @Schema(implementation = UserOnboardingRequest.class))))
    @ApiResponses({
        @ApiResponse(responseCode = "201", description = "회원 생성 및 인증 발급 성공 (Cache-Control: no-store)",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = UserOnboardingResponse.class))),
        @ApiResponse(responseCode = "400", description = "USER_INVALID_ONBOARDING_REQUEST / USER_INVALID_NICKNAME / USER_RESERVED_NICKNAME / USER_INAPPROPRIATE_NICKNAME / USER_INVALID_CHARACTER_GENDER",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "401", description = "AUTH_INVALID_ONBOARDING_TOKEN",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED / AUTH_REQUEST_REJECTED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "409", description = "USER_NICKNAME_ALREADY_EXISTS (확인된 롤백 시 재시도) / USER_ALREADY_REGISTERED (새 OAuth 필요)",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "AUTH_TOKEN_CONFIGURATION_ERROR",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "USER_ONBOARDING_UNAVAILABLE",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @PostMapping("/onboarding")
    public ResponseEntity<UserOnboardingResponse> onboard(@RequestBody JsonNode body, HttpServletRequest request) {
        UserOnboardingService.Result result = service.onboard(request, UserOnboardingRequest.from(body));
        return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").header(HttpHeaders.SET_COOKIE, result.refreshCookie())
                .body(result.body());
    }
}
