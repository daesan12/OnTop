package com.ssafy.ontop.admin.walletgrant.controller;

import com.ssafy.ontop.admin.walletgrant.AdminWalletGrantException;
import com.ssafy.ontop.admin.walletgrant.dto.AdminWalletGrantExecuteRequest;
import com.ssafy.ontop.admin.walletgrant.dto.AdminWalletGrantExecuteResponse;
import com.ssafy.ontop.admin.walletgrant.dto.AdminWalletGrantPreviewRequest;
import com.ssafy.ontop.admin.walletgrant.dto.AdminWalletGrantPreviewResponse;
import com.ssafy.ontop.admin.walletgrant.service.AdminWalletGrantService;
import com.ssafy.ontop.config.RuntimeProfiles;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.security.Principal;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@RequestMapping("/api/v1/admin/wallet-grants")
@Tag(name = "ADMIN")
public class AdminWalletGrantController {
    private final ObjectProvider<AdminWalletGrantService> services;

    public AdminWalletGrantController(ObjectProvider<AdminWalletGrantService> services) {
        this.services = services;
    }

    @PostMapping("/preview")
    @Operation(summary = "전 회원 엽전 지급 미리보기", security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "대상 인원과 총 지급액 반환",
                content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                        schema = @Schema(implementation = AdminWalletGrantPreviewResponse.class))),
        @ApiResponse(responseCode = "400", description = "INVALID_REQUEST"),
        @ApiResponse(responseCode = "401", description = "AUTH_AUTHENTICATION_REQUIRED"),
        @ApiResponse(responseCode = "403", description = "AUTH_ACCESS_DENIED"),
        @ApiResponse(responseCode = "503", description = "ADMIN_WALLET_GRANT_UNAVAILABLE")
    })
    public ResponseEntity<?> preview(Principal principal, @RequestBody AdminWalletGrantPreviewRequest request) {
        return ok(service().preview(account(principal), request));
    }

    @PostMapping
    @Operation(summary = "전 회원 엽전 일괄 지급", security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "일괄 지급 완료 또는 멱등 재요청 결과",
                content = @Content(mediaType = MediaType.APPLICATION_JSON_VALUE,
                        schema = @Schema(implementation = AdminWalletGrantExecuteResponse.class))),
        @ApiResponse(responseCode = "400", description = "INVALID_REQUEST"),
        @ApiResponse(responseCode = "401", description = "AUTH_AUTHENTICATION_REQUIRED"),
        @ApiResponse(responseCode = "403", description = "AUTH_ACCESS_DENIED"),
        @ApiResponse(responseCode = "409", description = "대상 변경 / 지갑 미준비 / 요청 ID 충돌"),
        @ApiResponse(responseCode = "503", description = "ADMIN_WALLET_GRANT_UNAVAILABLE")
    })
    public ResponseEntity<?> execute(Principal principal, @RequestBody AdminWalletGrantExecuteRequest request) {
        return ok(service().execute(account(principal), request));
    }

    private AdminWalletGrantService service() {
        AdminWalletGrantService service = services.getIfAvailable();
        if (service == null) {
            throw new AdminWalletGrantException(503, "ADMIN_WALLET_GRANT_UNAVAILABLE",
                    "엽전 지급 DB 연결 설정이 필요합니다.");
        }
        return service;
    }

    private long account(Principal principal) {
        if (principal == null) {
            throw new AdminWalletGrantException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
        try {
            long id = Long.parseLong(principal.getName());
            if (id <= 0) {
                throw new NumberFormatException();
            }
            return id;
        } catch (NumberFormatException exception) {
            throw new AdminWalletGrantException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
    }

    private ResponseEntity<?> ok(Object body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @ExceptionHandler(AdminWalletGrantException.class)
    ResponseEntity<?> grantError(AdminWalletGrantException exception) {
        return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore())
                .body(new ErrorResponse(exception.code(), exception.getMessage()));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class, IllegalStateException.class})
    ResponseEntity<?> unavailable() {
        return grantError(new AdminWalletGrantException(503, "ADMIN_WALLET_GRANT_UNAVAILABLE",
                "엽전 지급을 처리할 수 없습니다."));
    }

    public record ErrorResponse(String code, String message) {
    }
}
