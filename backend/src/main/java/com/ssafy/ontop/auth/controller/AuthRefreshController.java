package com.ssafy.ontop.auth.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.dto.AuthRefreshResponse;
import com.ssafy.ontop.auth.exception.AuthRefreshException;
import com.ssafy.ontop.auth.service.AuthRefreshService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Auth")
public class AuthRefreshController {

    private final AuthRefreshService service;

    public AuthRefreshController(AuthRefreshService service) {
        this.service = service;
    }

    @Operation(summary = "Access/Refresh 재발급", description = "본문과 Authorization 헤더가 필요하지 않습니다. ONTOP_REFRESH 쿠키와 허용된 Origin을 사용합니다. 매번 Rotation하며 동일 sid로 7일 슬라이딩 만료합니다. 이미 회전한 토큰은 401; 회전 후 5초 이내 중복 요청은 추가 폐기 없이 거절하고, 그 이후 재사용 탐지 시 해당 sid를 폐기합니다.",
            security = {@SecurityRequirement(name = "RefreshCookie")})
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공 (Cache-Control: no-store)",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthRefreshResponse.class))),
        @ApiResponse(responseCode = "400", description = "AUTH_INVALID_REFRESH_REQUEST",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "401", description = "AUTH_INVALID_REFRESH_TOKEN / AUTH_REFRESH_ALREADY_ROTATED / AUTH_REFRESH_REUSE_DETECTED / AUTH_MEMBER_STATE_CHANGED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED / AUTH_REQUEST_REJECTED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "AUTH_TOKEN_CONFIGURATION_ERROR",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "AUTH_REFRESH_STORAGE_UNAVAILABLE",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @PostMapping("/refresh")
    public ResponseEntity<AuthRefreshResponse> refresh(HttpServletRequest request) throws IOException {
        if (request.getInputStream().read() != -1) {
            throw new AuthRefreshException(AuthRefreshException.Error.INVALID_REQUEST);
        }
        AuthRefreshService.Result result = service.refresh(request);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer")
                .header(HttpHeaders.SET_COOKIE, result.refreshCookie()).body(result.body());
    }
}
