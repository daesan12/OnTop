package com.ssafy.ontop.event.minigame;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.event.minigame.WeeklyMinigameAwardService.Configuration;
import com.ssafy.ontop.event.minigame.WeeklyMinigameAwardService.FinalizeRequest;
import com.ssafy.ontop.event.minigame.WeeklyMinigameAwardService.Game;
import com.ssafy.ontop.event.minigame.WeeklyMinigameAwardService.MemberResult;
import com.ssafy.ontop.event.minigame.WeeklyMinigameAwardService.Ranking;
import com.ssafy.ontop.event.minigame.WeeklyMinigameAwardService.SupportedGame;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.security.Principal;
import java.time.LocalDate;
import java.util.List;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@Tag(name = "Event Awards")
public class WeeklyMinigameAwardController {
    private final ObjectProvider<WeeklyMinigameAwardService> services;

    public WeeklyMinigameAwardController(ObjectProvider<WeeklyMinigameAwardService> services) {
        this.services = services;
    }

    @GetMapping("/api/v1/admin/events/minigames/supported-games")
    @Operation(summary = "서버 검증 랭킹이 준비된 미니게임 목록", security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<List<SupportedGame>> supportedGames(Principal principal) {
        return ok(service().supportedGames(account(principal)));
    }

    @PostMapping("/api/v1/admin/events/minigames/backfills/{eventWeek}/prepare")
    @Operation(summary = "종료된 11월 미니게임상 회차를 고정 기간으로 준비",
            security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<List<Game>> prepareBackfill(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate eventWeek) {
        return ok(service().prepareBackfill(eventWeek, account(principal)));
    }

    @GetMapping("/api/v1/admin/events/minigames/rounds/{weekStart}/games")
    @Operation(summary = "주차별 활성 미니게임 목록", security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<List<Game>> games(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart) {
        return ok(service().games(weekStart, account(principal)));
    }

    @PutMapping("/api/v1/admin/events/minigames/rounds/{weekStart}/games/{gameCode}")
    @Operation(summary = "주차별 검증 미니게임 기간·상품 설정", security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<Game> configure(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart,
            @PathVariable String gameCode, @RequestBody Configuration body) {
        return ok(service().configure(weekStart, gameCode, body, account(principal)));
    }

    @GetMapping("/api/v1/admin/events/minigames/rounds/{weekStart}/games/{gameCode}/ranking")
    @Operation(summary = "서버 검증 기록 기반 게임상 순위와 근거", security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<Ranking> ranking(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart,
            @PathVariable String gameCode) {
        return ok(service().ranking(weekStart, gameCode, account(principal)));
    }

    @PostMapping("/api/v1/admin/events/minigames/rounds/{weekStart}/games/{gameCode}/finalize")
    @Operation(summary = "미니게임 1위 검토 후 수동 확정", security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<Ranking> finalizeRound(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart,
            @PathVariable String gameCode, @RequestBody FinalizeRequest body) {
        return ok(service().finalizeRound(weekStart, gameCode, body, account(principal)));
    }

    @GetMapping("/api/v1/events/minigames/rounds/{weekStart}/games/{gameCode}/result")
    @Operation(summary = "주차별 본인 미니게임상 결과", security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<MemberResult> memberResult(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart,
            @PathVariable String gameCode) {
        return ok(service().memberResult(weekStart, gameCode, account(principal)));
    }

    private WeeklyMinigameAwardService service() {
        WeeklyMinigameAwardService service = services.getIfAvailable();
        if (service == null) {
            throw new MinigameAwardException(503, "EVENT_NOT_CONFIGURED", "미니게임 행사 설정이 필요합니다.");
        }
        return service;
    }

    private long account(Principal principal) {
        if (principal != null) {
            try {
                long id = Long.parseLong(principal.getName());
                if (id > 0) return id;
            } catch (NumberFormatException ignored) {
                // Reject malformed authentication subjects below.
            }
        }
        throw new MinigameAwardException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
    }

    private <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @ExceptionHandler(MinigameAwardException.class)
    ResponseEntity<WeeklyMinigameErrorResponse> awardError(MinigameAwardException exception) {
        return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore())
                .body(new WeeklyMinigameErrorResponse(exception.code(), exception.getMessage()));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class, IllegalStateException.class})
    ResponseEntity<WeeklyMinigameErrorResponse> unavailable() {
        return awardError(new MinigameAwardException(503, "EVENT_UNAVAILABLE", "행사 결과를 확인할 수 없습니다."));
    }

    public record WeeklyMinigameErrorResponse(String code, String message) {}
}
