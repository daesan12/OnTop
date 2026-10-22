package com.ssafy.ontop.auth.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.service.AuthAuthorizeService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Auth")
public class AuthController {

    private final AuthAuthorizeService authorizeService;

    public AuthController(AuthAuthorizeService authorizeService) {
        this.authorizeService = authorizeService;
    }

    @Operation(summary = "소셜 로그인 시작", description = "ssafy/naver만 지원합니다. 신뢰된 설정의 callback URI와 서버 발급 state로 302 이동합니다. client_secret은 인가 URL에 포함하지 않습니다. 브라우저 탐색으로 시작하고 OAuth 세션 쿠키를 유지하세요.")
    @ApiResponses({
        @ApiResponse(responseCode = "302", description = "설정에 따른 리다이렉트", content = @Content),
        @ApiResponse(responseCode = "400", description = "AUTH_UNSUPPORTED_PROVIDER",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "AUTH_CONFIGURATION_ERROR",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @GetMapping("/{provider}/authorize")
    public ResponseEntity<Void> authorize(@PathVariable String provider, HttpServletRequest request) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(authorizeService.authorize(provider, request))
                .cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer")
                .build();
    }
}
