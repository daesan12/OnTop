package com.ssafy.ontop.user.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.user.dto.UserProfileResponse;
import com.ssafy.ontop.user.service.UserProfileService;
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
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
@Tag(name = "User")
public class UserProfileController {

    private final UserProfileService service;

    public UserProfileController(UserProfileService service) {
        this.service = service;
    }

    @Operation(summary = "내 정보 조회", description = "검증된 Principal의 내부 userId로 조회합니다. 요청으로 userId를 받지 않으며 소셜 식별자/인증 정보는 반환하지 않습니다. 활성 회원과 유효한 sid가 필요합니다.",
            security = {@SecurityRequirement(name = "AccessJwt")})
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공 (Cache-Control: no-store)",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = UserProfileResponse.class))),
        @ApiResponse(responseCode = "401", description = "AUTH_AUTHENTICATION_REQUIRED / AUTH_INVALID_ACCESS_TOKEN / AUTH_MEMBER_STATE_CHANGED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED / AUTH_REQUEST_REJECTED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "AUTH_TOKEN_CONFIGURATION_ERROR",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "AUTH_MEMBER_LOOKUP_UNAVAILABLE",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @GetMapping("/me")
    public ResponseEntity<UserProfileResponse> me(@AuthenticationPrincipal AuthenticatedUser user) {
        if (user == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").body(service.findProfile(user.userId()));
    }
}
