package com.ssafy.ontop.raffle.controller;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.raffle.RaffleException;
import com.ssafy.ontop.raffle.dto.RaffleDrawResponse;
import com.ssafy.ontop.raffle.dto.RaffleMemberResultResponse;
import com.ssafy.ontop.raffle.dto.RaffleReviewResponse;
import com.ssafy.ontop.raffle.service.RaffleDrawingService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.security.Principal;
import java.time.LocalDate;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@Tag(name = "Raffle")
public class RaffleDrawingController {
    private final ObjectProvider<RaffleDrawingService> services;

    public RaffleDrawingController(ObjectProvider<RaffleDrawingService> services) {
        this.services = services;
    }

    @GetMapping("/api/v1/raffles/rounds/{weekStart}/result")
    @Operation(summary = "본인의 주간 응모권 추첨 결과", security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<RaffleMemberResultResponse> memberResult(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart) {
        return ok(service().memberResult(weekStart, account(principal)));
    }

    @GetMapping("/api/v1/admin/raffles/rounds/{weekStart}")
    @Operation(summary = "관리자 응모권 추첨 결과 조회", security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<RaffleDrawResponse> adminResult(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart) {
        return ok(service().adminResult(weekStart, account(principal)));
    }

    @PostMapping("/api/v1/admin/raffles/rounds/{weekStart}/finalize")
    @Operation(summary = "관리자가 검토한 응모권 추첨 시도 최종 확정",
            security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<RaffleDrawResponse> finalizeRound(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart,
            @RequestBody ConfirmRequest request) {
        return ok(service().confirmReview(weekStart, account(principal), request.drawId()));
    }

    @PostMapping("/api/v1/admin/raffles/rounds/{weekStart}/draws")
    @Operation(summary = "응모권 추첨 결과를 검토용으로 저장",
            security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<RaffleReviewResponse> createReview(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart) {
        return ok(service().createReview(weekStart, account(principal)));
    }

    @GetMapping("/api/v1/admin/raffles/rounds/{weekStart}/draws/current")
    @Operation(summary = "현재 검토 중인 응모권 추첨 결과 조회",
            security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<RaffleReviewResponse> currentReview(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart) {
        return ok(service().currentReview(weekStart, account(principal)));
    }

    @PostMapping("/api/v1/admin/raffles/rounds/{weekStart}/draws/reroll")
    @Operation(summary = "현재 검토 시도를 대체하고 사유를 남겨 재추첨",
            security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<RaffleReviewResponse> reroll(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart,
            @RequestBody RerollRequest request) {
        return ok(service().reroll(weekStart, account(principal),
                request.expectedDrawId(), request.reason()));
    }

    private RaffleDrawingService service() {
        RaffleDrawingService service = services.getIfAvailable();
        if (service == null) {
            throw new RaffleException(503, "RAFFLE_NOT_CONFIGURED", "응모권 DB 연결 설정이 필요합니다.");
        }
        return service;
    }

    private long account(Principal principal) {
        if (principal == null) {
            throw new RaffleException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
        try {
            long userId = Long.parseLong(principal.getName());
            if (userId > 0) {
                return userId;
            }
        } catch (NumberFormatException ignored) {
            // Reject malformed subjects below.
        }
        throw new RaffleException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
    }

    private <T> ResponseEntity<T> ok(T response) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(response);
    }

    @ExceptionHandler(RaffleException.class)
    ResponseEntity<?> raffleError(RaffleException exception) {
        return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore())
                .body(new ErrorResponse(exception.code(), exception.getMessage()));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class, IllegalStateException.class})
    ResponseEntity<?> unavailable() {
        return raffleError(new RaffleException(503, "RAFFLE_UNAVAILABLE", "응모권 추첨 정보를 확인할 수 없습니다."));
    }

    public record ErrorResponse(String code, String message) {}

    public record RerollRequest(long expectedDrawId, String reason) {}

    public record ConfirmRequest(long drawId) {}
}
