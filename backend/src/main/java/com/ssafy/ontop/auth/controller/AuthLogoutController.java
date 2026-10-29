package com.ssafy.ontop.auth.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.exception.AuthLogoutException;
import com.ssafy.ontop.auth.service.AuthLogoutService;
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
public class AuthLogoutController {

    private final AuthLogoutService service;

    public AuthLogoutController(AuthLogoutService service) {
        this.service = service;
    }

    @Operation(summary = "현재 로그인 세션 로그아웃", description = "본문/Access JWT/JSESSIONID 없이 Refresh 쿠키와 허용된 Origin을 사용합니다. 쿠키 누락/만료/위조도 멱등 204입니다. 식별된 sid 전체를 폐기하고 커밋 후 해당 WebSocket을 4401로 종료합니다. 기존 Access JWT와 미사용 접속권도 즉시 거절됩니다. 다른 로그인 계열은 유지합니다. 발급과 같은 속성의 Max-Age=0 쿠키를 반환합니다.",
            security = {@SecurityRequirement(name = "RefreshCookie")})
    @ApiResponses({
        @ApiResponse(responseCode = "204", description = "성공. 응답 본문 없음", content = @Content),
        @ApiResponse(responseCode = "400", description = "AUTH_INVALID_LOGOUT_REQUEST",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED / AUTH_REQUEST_REJECTED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "AUTH_TOKEN_CONFIGURATION_ERROR",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "AUTH_LOGOUT_STORAGE_UNAVAILABLE",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(HttpServletRequest request) throws IOException {
        if (request.getContentLengthLong() > 0 || request.getInputStream().read() != -1) {
            throw new AuthLogoutException(AuthLogoutException.Error.INVALID_REQUEST);
        }
        String clearCookie = service.logout(request);
        return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer")
                .header(HttpHeaders.SET_COOKIE, clearCookie).build();
    }
}
