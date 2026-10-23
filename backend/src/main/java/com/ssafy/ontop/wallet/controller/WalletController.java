package com.ssafy.ontop.wallet.controller;

import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.auth.security.RestAuthenticationException;
import com.ssafy.ontop.wallet.dto.WalletBalanceResponse;
import com.ssafy.ontop.wallet.dto.WalletTransactionPageRequest;
import com.ssafy.ontop.wallet.dto.WalletTransactionPageResponse;
import com.ssafy.ontop.wallet.service.WalletQueryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/wallets")
@Tag(name = "WALLET", description = "인증된 본인의 지갑 조회")
public class WalletController {

    private final WalletQueryService service;

    public WalletController(WalletQueryService service) {
        this.service = service;
    }

    @Operation(summary = "본인 지갑 잔액 조회", description = "활성 회원과 유효한 sid의 Access JWT가 필요합니다. "
            + "전체 잔액에 예약 잔액이 포함되며 사용 가능 잔액은 balance - reservedBalance입니다. "
            + "회원 ID를 입력받지 않으며 지갑 생성·보너스 지급·원장 기록을 하지 않습니다.",
            security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공 (Cache-Control: no-store)",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = WalletBalanceResponse.class))),
        @ApiResponse(responseCode = "401", description = "AUTH_AUTHENTICATION_REQUIRED / AUTH_INVALID_ACCESS_TOKEN / AUTH_MEMBER_STATE_CHANGED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED / AUTH_REQUEST_REJECTED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "409", description = "WALLET_NOT_READY: 회원 지갑이 아직 생성되지 않음",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "AUTH_TOKEN_CONFIGURATION_ERROR",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "WALLET_UNAVAILABLE / AUTH_MEMBER_LOOKUP_UNAVAILABLE",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @GetMapping("/me")
    public ResponseEntity<WalletBalanceResponse> me(
            @Parameter(hidden = true) @AuthenticationPrincipal AuthenticatedUser user) {
        if (user == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .header("Referrer-Policy", "no-referrer").body(service.findBalance(user.userId()));
    }

    @Operation(summary = "본인 코인 거래 내역 조회", description = "활성 회원과 유효한 sid의 Access JWT가 필요합니다. "
            + "거래 ID 내림차순이며 cursor가 있으면 ID < cursor인 본인 지갑 원장만 반환합니다. "
            + "size보다 한 건 더 조회해 hasNext를 판단합니다. nextCursor는 다음 페이지가 있을 때만 "
            + "마지막 반환 거래 ID이며, 없으면 null입니다. 조회는 예약·지급·차감을 수행하지 않습니다.",
            security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공 (Cache-Control: no-store)",
                content = @Content(mediaType = "application/json",
                        schema = @Schema(implementation = WalletTransactionPageResponse.class))),
        @ApiResponse(responseCode = "400", description = "WALLET_INVALID_PAGE_REQUEST: cursor는 양수, size는 1~100",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "401", description = "AUTH_AUTHENTICATION_REQUIRED / AUTH_INVALID_ACCESS_TOKEN / AUTH_MEMBER_STATE_CHANGED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "403", description = "AUTH_ORIGIN_NOT_ALLOWED / AUTH_ACCESS_DENIED / AUTH_REQUEST_REJECTED",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "409", description = "WALLET_NOT_READY: 회원 지갑이 아직 생성되지 않음",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "500", description = "AUTH_TOKEN_CONFIGURATION_ERROR",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
        @ApiResponse(responseCode = "503", description = "WALLET_UNAVAILABLE / AUTH_MEMBER_LOOKUP_UNAVAILABLE",
                content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class)))
    })
    @GetMapping("/me/transactions")
    public ResponseEntity<WalletTransactionPageResponse> transactions(
            @Parameter(hidden = true) @AuthenticationPrincipal AuthenticatedUser user,
            @Parameter(description = "이 ID 미만의 거래 조회. 생략 시 최신부터", schema = @Schema(
                    type = "integer", format = "int64", minimum = "1")) @RequestParam(required = false) String cursor,
            @Parameter(description = "페이지 크기 (기본 20, 최대 100)", schema = @Schema(
                    type = "integer", minimum = "1", maximum = "100", defaultValue = "20"))
            @RequestParam(required = false) String size) {
        if (user == null) {
            throw new RestAuthenticationException(RestAuthenticationException.Error.REQUIRED);
        }
        var request = WalletTransactionPageRequest.parse(cursor, size);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).header("Referrer-Policy", "no-referrer")
                .body(service.findTransactions(user.userId(), request));
    }
}
