package com.ssafy.ontop.raffle.controller;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.raffle.RaffleException;
import com.ssafy.ontop.raffle.dto.CurrentRaffleResponse;
import com.ssafy.ontop.raffle.dto.RafflePurchaseResponse;
import com.ssafy.ontop.raffle.service.RaffleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.security.Principal;
import java.util.Collections;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@Tag(name = "Raffle")
public class RaffleController {
    private final ObjectProvider<RaffleService> services;

    public RaffleController(ObjectProvider<RaffleService> services) {
        this.services = services;
    }

    @Operation(summary = "이번 주 응모권 조회",
            description = "KST 월요일 09:00부터 다음 월요일 00:00까지 판매하는 이번 주 응모권과 지갑 상태를 조회합니다.",
            security = @SecurityRequirement(name = "AccessJwt"))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공",
                content = @Content(schema = @Schema(implementation = CurrentRaffleResponse.class))),
        @ApiResponse(responseCode = "401", description = "UNAUTHENTICATED"),
        @ApiResponse(responseCode = "409", description = "WALLET_NOT_READY"),
        @ApiResponse(responseCode = "503", description = "RAFFLE_NOT_CONFIGURED / RAFFLE_UNAVAILABLE")
    })
    @GetMapping("/api/v1/raffles/current")
    public ResponseEntity<?> current(Principal principal) {
        return ok(service().current(account(principal)));
    }

    @Operation(summary = "응모권 한 장 구매",
            description = "주간 최대 50장까지 미사용 번호 한 개를 배정하고 100냥을 차감합니다. 같은 키는 기존 결과를 반환합니다.",
            security = @SecurityRequirement(name = "AccessJwt"))
    @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
            description = "영문·숫자·밑줄·하이픈 1~64자",
            schema = @Schema(type = "string", pattern = "^[A-Za-z0-9_-]{1,64}$", minLength = 1, maxLength = 64))
    @ApiResponses({
        @ApiResponse(responseCode = "200", description = "성공",
                content = @Content(schema = @Schema(implementation = RafflePurchaseResponse.class))),
        @ApiResponse(responseCode = "400", description = "INVALID_REQUEST"),
        @ApiResponse(responseCode = "401", description = "UNAUTHENTICATED"),
        @ApiResponse(responseCode = "409",
                description = "RAFFLE_SALES_CLOSED / RAFFLE_WEEKLY_LIMIT_REACHED / INSUFFICIENT_BALANCE / "
                        + "WALLET_NOT_READY / RAFFLE_NUMBERS_EXHAUSTED"),
        @ApiResponse(responseCode = "503", description = "RAFFLE_NOT_CONFIGURED / RAFFLE_UNAVAILABLE")
    })
    @PostMapping("/api/v1/raffles/current/tickets")
    public ResponseEntity<?> purchase(Principal principal, HttpServletRequest request) {
        long userId = account(principal);
        var keys = Collections.list(request.getHeaders("Idempotency-Key"));
        if (keys.size() != 1 || !keys.getFirst().matches("[A-Za-z0-9_-]{1,64}")) {
            throw invalid();
        }
        return ok(service().purchase(userId, keys.getFirst()));
    }

    private RaffleService service() {
        RaffleService service = services.getIfAvailable();
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
            long id = Long.parseLong(principal.getName());
            if (id <= 0) {
                throw new NumberFormatException();
            }
            return id;
        } catch (NumberFormatException exception) {
            throw new RaffleException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
    }

    private RaffleException invalid() {
        return new RaffleException(400, "INVALID_REQUEST", "요청 헤더와 값을 확인하세요.");
    }

    private ResponseEntity<?> ok(Object body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @ExceptionHandler(RaffleException.class)
    ResponseEntity<?> raffleError(RaffleException exception) {
        return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore())
                .body(new ErrorResponse(exception.code(), exception.getMessage(), null));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class, IllegalStateException.class})
    ResponseEntity<?> unavailable() {
        return raffleError(new RaffleException(503, "RAFFLE_UNAVAILABLE", "응모권 정보를 확인할 수 없습니다."));
    }

    @Schema(name = "RaffleErrorResponse")
    public record ErrorResponse(String code, String message, Object details) {
    }
}
