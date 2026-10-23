package com.ssafy.ontop.auth.controller;

import com.ssafy.ontop.auth.dto.AuthCallbackResponse;
import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.service.AuthCallbackService;
import com.ssafy.ontop.auth.service.OAuthExchangeStore;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.MultiValueMap;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@Tag(name = "Auth")
public class AuthCallbackController {

    private final AuthCallbackService callbacks;

    public AuthCallbackController(AuthCallbackService callbacks) {
        this.callbacks = callbacks;
    }

    @Operation(summary = "소셜 로그인 콜백", description = "공급자 전용 수신점. 동일 OAuth 세션·provider·state를 일회 검증한 뒤 토큰/프로필을 조회합니다. 신규 users 행을 만들지 않습니다. 탈퇴 7일 이내 복구, 초과 시 AUTH_REJOIN_PENDING(409)입니다. AUTH_FRONTEND_CALLBACK_URI 설정 시 fragment의 exchange_code로 302; 미설정 200 JSON은 로컬 수동 검증용 계약입니다. OAuth 토큰/JWT를 반환하지 않습니다.",
            security = {@SecurityRequirement(name = "OAuthSession")})
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공 (Cache-Control: no-store)",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthCallbackResponse.class))),
        @ApiResponse(responseCode = "302", description = "설정에 따른 리다이렉트", content = @Content),
        @ApiResponse(responseCode = "400", description = "AUTH_UNSUPPORTED_PROVIDER / AUTH_INVALID_STATE / AUTH_INVALID_CALLBACK",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "401", description = "AUTH_PROVIDER_DENIED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "409", description = "AUTH_REJOIN_PENDING (7일 경과, 재가입 미구현)",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "AUTH_CONFIGURATION_ERROR",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "502", description = "외부 공급자 토큰 교환 또는 프로필 조회 실패",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "AUTH_DATABASE_UNAVAILABLE / AUTH_EXCHANGE_CAPACITY_EXCEEDED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @GetMapping("/{provider}/callback")
    public ResponseEntity<AuthCallbackResponse> callback(@PathVariable String provider,
HttpServletRequest request, @io.swagger.v3.oas.annotations.Parameter(hidden = true)
            @RequestParam MultiValueMap<String, String> params) {
        AuthCallbackService.Completion completion = callbacks.callback(provider, request, params);
        if (completion.redirect() != null) {
            return ResponseEntity.status(HttpStatus.FOUND).location(completion.redirect())
                    .cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer").build();
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer")
                .body(new AuthCallbackResponse(completion.exchangeCode(), OAuthExchangeStore.LIFETIME_SECONDS));
    }
}
