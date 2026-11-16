package com.ssafy.ontop.raffle.controller;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.raffle.RaffleException;
import com.ssafy.ontop.raffle.dto.RaffleDrawResponse;
import com.ssafy.ontop.raffle.dto.RaffleMemberResultResponse;
import com.ssafy.ontop.raffle.dto.RaffleReviewResponse;
import com.ssafy.ontop.raffle.service.RaffleDrawingService;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
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
            description = "공개 추첨 행사 회차와 행사에 포함된 회차는 409 RAFFLE_LIVE_EVENT_LOCKED로 거부한다. "
                    + "행사 회차는 행사를 마칠 때 서버 내부 경로로만 확정된다.",
            security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<RaffleDrawResponse> finalizeRound(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart,
            @RequestBody ConfirmRequest request) {
        return ok(service().confirmReview(weekStart, account(principal), request.drawId()));
    }

    @PostMapping("/api/v1/admin/raffles/rounds/{weekStart}/draws")
    @Operation(summary = "응모권 추첨 결과를 검토용으로 저장",
            description = "공개 추첨 행사 회차는 연결된 모든 회차의 응모권으로 추첨한다. 행사에 포함된 회차는 "
                    + "409 RAFFLE_LIVE_EVENT_SOURCE_ROUND, 회차 연결이 끝나지 않은 행사 회차는 "
                    + "409 RAFFLE_LIVE_EVENT_INCOMPLETE로 거부한다.",
            security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<RaffleReviewResponse> createReview(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart) {
        return ok(service().createReview(weekStart, account(principal)));
    }

    @GetMapping("/api/v1/admin/raffles/rounds/{weekStart}/draws/current")
    @Operation(summary = "현재 검토 중인 응모권 추첨 결과 조회",
            security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "현재 검토 중인 추첨 결과",
                content = @Content(mediaType = "application/json",
                        schema = @Schema(implementation = RaffleReviewResponse.class))),
        @ApiResponse(responseCode = "404",
                description = "RAFFLE_ROUND_NOT_FOUND / RAFFLE_REVIEW_NOT_FOUND",
                content = @Content(mediaType = "application/json",
                        schema = @Schema(implementation = RaffleErrorResponse.class))),
        @ApiResponse(responseCode = "409", description = "RAFFLE_ALREADY_FINALIZED",
                content = @Content(mediaType = "application/json",
                        schema = @Schema(implementation = RaffleErrorResponse.class)))
    })
    public ResponseEntity<RaffleReviewResponse> currentReview(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart) {
        return ok(service().currentReview(weekStart, account(principal)));
    }

    @PostMapping("/api/v1/admin/raffles/rounds/{weekStart}/draws/reroll")
    @Operation(summary = "현재 검토 시도를 대체하고 사유를 남겨 재추첨",
            description = "공개 추첨 행사 회차는 연결된 모든 회차의 응모권으로 재추첨한다. 행사에 포함된 회차는 "
                    + "409 RAFFLE_LIVE_EVENT_SOURCE_ROUND, 회차 연결이 끝나지 않은 행사 회차는 "
                    + "409 RAFFLE_LIVE_EVENT_INCOMPLETE로 거부한다.",
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
                .body(new RaffleErrorResponse(exception.code(), exception.getMessage()));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class, IllegalStateException.class})
    ResponseEntity<?> unavailable() {
        return raffleError(new RaffleException(503, "RAFFLE_UNAVAILABLE", "응모권 추첨 정보를 확인할 수 없습니다."));
    }

    public record RaffleErrorResponse(String code, String message) {}

    public record RerollRequest(long expectedDrawId, String reason) {}

    public record ConfirmRequest(long drawId) {}
}
