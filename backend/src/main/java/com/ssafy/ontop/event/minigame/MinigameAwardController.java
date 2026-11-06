package com.ssafy.ontop.event.minigame;

import com.ssafy.ontop.config.RuntimeProfiles;
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
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@Tag(name = "Event Awards")
public class MinigameAwardController {
    private final ObjectProvider<MinigameAwardService> services;

    public MinigameAwardController(ObjectProvider<MinigameAwardService> services) {
        this.services = services;
    }

    @GetMapping("/api/v1/events/minigames/{type}/rounds/{weekStart}/result")
    @Operation(summary = "본인의 미니게임 행사 결과", security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<MinigameMemberAwardResponse> memberResult(Principal principal,
            @PathVariable String type,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart) {
        return ok(service().memberResult(MinigameAwardType.fromPath(type), weekStart, account(principal)));
    }

    @GetMapping("/api/v1/admin/events/minigames/{type}/rounds/{weekStart}")
    @Operation(summary = "관리자 미니게임 행사 결과 조회", security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<MinigameAwardResponse> adminResult(Principal principal,
            @PathVariable String type,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart) {
        return ok(service().adminResult(MinigameAwardType.fromPath(type), weekStart, account(principal)));
    }

    @PostMapping("/api/v1/admin/events/minigames/{type}/rounds/{weekStart}/finalize")
    @Operation(summary = "관리자 미니게임 행사 결과 확정·재시도", security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<MinigameAwardResponse> finalizeRound(Principal principal,
            @PathVariable String type,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart) {
        return ok(service().finalizeRound(MinigameAwardType.fromPath(type), weekStart, account(principal)));
    }

    private MinigameAwardService service() {
        MinigameAwardService service = services.getIfAvailable();
        if (service == null) {
            throw new MinigameAwardException(503, "EVENT_NOT_CONFIGURED", "미니게임 행사 설정이 필요합니다.");
        }
        return service;
    }

    private long account(Principal principal) {
        if (principal != null) {
            try {
                long userId = Long.parseLong(principal.getName());
                if (userId > 0) {
                    return userId;
                }
            } catch (NumberFormatException ignored) {
                // Reject malformed subjects below.
            }
        }
        throw new MinigameAwardException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
    }

    private <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @ExceptionHandler(MinigameAwardException.class)
    ResponseEntity<ErrorResponse> awardError(MinigameAwardException exception) {
        return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore())
                .body(new ErrorResponse(exception.code(), exception.getMessage()));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class, IllegalStateException.class})
    ResponseEntity<ErrorResponse> unavailable() {
        return awardError(new MinigameAwardException(503, "EVENT_UNAVAILABLE", "행사 결과를 확인할 수 없습니다."));
    }

    public record ErrorResponse(String code, String message) {}
}
