package com.ssafy.ontop.admin.controller;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
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
@RequestMapping("/api/v1/admin")
@Tag(name = "ADMIN")
public class AdminAccessController {
    private final AdminAccessPolicy access;

    public AdminAccessController(AdminAccessPolicy access) {
        this.access = access;
    }

    @GetMapping("/me")
    @Operation(summary = "현재 관리자 권한 조회", security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "조회 권한 및 지급 권한 반환"),
        @ApiResponse(responseCode = "401", description = "활성 회원 Access JWT 필요",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "관리자 조회 권한 없음",
                content = @Content(schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    public ResponseEntity<AdminAccessResponse> me(@AuthenticationPrincipal AuthenticatedUser user) {
        if (user == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(new AdminAccessResponse(access.canRead(user.userId()), access.canGrant(user.userId()),
                        access.canOperate(user.userId())));
    }

    public record AdminAccessResponse(boolean canRead, boolean canGrant, boolean canOperate) {
    }
}
