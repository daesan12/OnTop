package com.ssafy.ontop.auth.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.dto.AuthExchangeResponse;
import com.ssafy.ontop.auth.exception.AuthExchangeException;
import com.ssafy.ontop.auth.service.AuthExchangeService;
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
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Auth")
public class AuthExchangeController {

    private final AuthExchangeService service;

    public AuthExchangeController(AuthExchangeService service) {
        this.service = service;
    }

    @Operation(summary = "일회용 코드 교환", description = "60초 교환 코드와 OAuth와 동일한 HttpSession이 필요합니다. Origin 허용 목록을 검증합니다. 코드 일회 소비 후 실패하면 새 로그인이 필요합니다. 기존/복구 회원은 Access JWT(1800초)와 HttpOnly Refresh 쿠키(7일), 신규는 온보딩 전용 Bearer(600초)만 받습니다. 성공 시 세션 ID가 회전합니다.",
            security = {@SecurityRequirement(name = "OAuthSession")})
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공 (Cache-Control: no-store)",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthExchangeResponse.class))),
        @ApiResponse(responseCode = "400", description = "AUTH_INVALID_EXCHANGE_REQUEST",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "401", description = "AUTH_INVALID_EXCHANGE_CODE / AUTH_MEMBER_STATE_CHANGED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED / AUTH_REQUEST_REJECTED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "AUTH_TOKEN_CONFIGURATION_ERROR",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "AUTH_EXCHANGE_STORAGE_UNAVAILABLE / AUTH_ONBOARDING_CAPACITY_EXCEEDED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @PostMapping("/exchange")
    public ResponseEntity<AuthExchangeResponse> exchange(@RequestBody JsonNode body, HttpServletRequest request) {
        if (body == null || !body.isObject() || body.size() != 1 || !body.path("exchangeCode").isTextual()
                || !body.path("exchangeCode").asText().matches("[A-Za-z0-9_-]{43}")) {
            throw new AuthExchangeException(AuthExchangeException.Error.INVALID_REQUEST);
        }
        AuthExchangeService.Result result = service.exchange(request, body.path("exchangeCode").asText());
        ResponseEntity.BodyBuilder response = ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer");
        if (result.refreshCookie() != null) {
            response.header(HttpHeaders.SET_COOKIE, result.refreshCookie());
        }
        return response.body(result.body());
    }
}
