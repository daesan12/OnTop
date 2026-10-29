package com.ssafy.ontop.user.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.user.dto.UserNicknameUpdateRequest;
import com.ssafy.ontop.user.dto.UserProfileResponse;
import com.ssafy.ontop.user.service.UserNicknameUpdateService;
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
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
@Tag(name = "User")
public class UserNicknameUpdateController {

    private final UserNicknameUpdateService service;

    public UserNicknameUpdateController(UserNicknameUpdateService service) {
        this.service = service;
    }

    @Operation(summary = "내 닉네임 수정", description = "nickname만 수정합니다. 완성형 한글/영문/숫자 2~8자. 대소문자 무시 UNIQUE(탈퇴 회원 포함), 본인 닉네임은 허용합니다. 동일 이름 요청은 성공하며 대소문자만 변경하면 요청 표기를 저장합니다. 사전 조회와 별도로 트랜잭션에서 최종 중복 검증합니다.",
            security = {@SecurityRequirement(name = "AccessJwt")},
            requestBody = @io.swagger.v3.oas.annotations.parameters.RequestBody(required = true,
                    content = @Content(schema = @Schema(implementation = UserNicknameUpdateRequest.class))))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공 (Cache-Control: no-store)",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = UserProfileResponse.class))),
        @ApiResponse(responseCode = "400", description = "USER_INVALID_NICKNAME_UPDATE_REQUEST / USER_INVALID_NICKNAME",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "401", description = "AUTH_AUTHENTICATION_REQUIRED / AUTH_INVALID_ACCESS_TOKEN / AUTH_MEMBER_STATE_CHANGED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED / AUTH_REQUEST_REJECTED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "409", description = "USER_NICKNAME_ALREADY_EXISTS",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "AUTH_TOKEN_CONFIGURATION_ERROR",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "USER_PROFILE_UPDATE_UNAVAILABLE / AUTH_MEMBER_LOOKUP_UNAVAILABLE",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @PatchMapping("/me")
    public ResponseEntity<UserProfileResponse> update(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody JsonNode body) {
        if (user == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer")
                .body(service.update(user.userId(), UserNicknameUpdateRequest.from(body)));
    }
}
