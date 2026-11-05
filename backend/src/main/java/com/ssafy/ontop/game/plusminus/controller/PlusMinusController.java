package com.ssafy.ontop.game.plusminus.controller;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.plusminus.dto.PlusMinusStateResponse;
import com.ssafy.ontop.game.plusminus.service.PlusMinusException;
import com.ssafy.ontop.game.plusminus.service.PlusMinusService;
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
import java.util.Collections;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@RequestMapping("/api/v1/minigames/plus-minus")
@Tag(name = "MINIGAME")
@SecurityRequirement(name = "AccessJwt")
@ApiResponses({
    @ApiResponse(responseCode = "400", description = "PLUS_MINUS_INVALID_REQUEST"),
    @ApiResponse(responseCode = "401", description = "인증된 활성 회원 필요"),
    @ApiResponse(responseCode = "403", description = "허용되지 않은 출처 또는 권한"),
    @ApiResponse(responseCode = "409", description = "WALLET_NOT_READY / INSUFFICIENT_COINS / PLUS_MINUS_DAILY_LIMIT"),
    @ApiResponse(responseCode = "503", description = "PLUS_MINUS_UNAVAILABLE")
})
public class PlusMinusController {
    private static final String REQUEST_KEY = "[A-Za-z0-9_-]{1,64}";

    private final ObjectProvider<PlusMinusService> services;

    public PlusMinusController(ObjectProvider<PlusMinusService> services) {
        this.services = services;
    }

    @GetMapping("/status")
    @Operation(operationId = "getPlusMinusStatus", summary = "더하기 빼기 아케이드 상태 조회",
            description = "오늘 판 수, 사용 가능 잔액, 릴 구성과 가장 최근 판을 반환합니다.")
    @ApiResponse(responseCode = "200", description = "현재 상태",
            content = @Content(schema = @Schema(implementation = PlusMinusStateResponse.class)))
    public ResponseEntity<PlusMinusStateResponse> status(@AuthenticationPrincipal AuthenticatedUser user) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service().status(userId(user)));
    }

    @PostMapping("/rounds")
    @Operation(operationId = "startPlusMinusRound", summary = "더하기 빼기 아케이드 START",
            description = "참가비 30냥과 하루 판 수를 차감하고 세 릴의 칸을 정해 지급까지 한 번에 정산합니다. "
                    + "정지 버튼은 화면 연출이며 결과를 바꾸지 않습니다. "
                    + "Idempotency-Key를 재사용하면 같은 판을 반환하며 다시 차감하지 않습니다.")
    @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
            schema = @Schema(type = "string", minLength = 1, maxLength = 64, pattern = "^[A-Za-z0-9_-]{1,64}$"))
    @ApiResponse(responseCode = "201", description = "정산된 판 또는 같은 요청 재확인",
            content = @Content(schema = @Schema(implementation = PlusMinusStateResponse.class)))
    public ResponseEntity<PlusMinusStateResponse> start(@AuthenticationPrincipal AuthenticatedUser user,
            HttpServletRequest request) {
        long userId = userId(user);
        var keys = Collections.list(request.getHeaders("Idempotency-Key"));
        if (keys.size() != 1 || !keys.getFirst().matches(REQUEST_KEY)) {
            throw new PlusMinusException(400, "PLUS_MINUS_INVALID_REQUEST", "중복 방지 키를 확인해 주세요.");
        }
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore())
                .body(service().start(userId, keys.getFirst()));
    }

    @ExceptionHandler(PlusMinusException.class)
    ResponseEntity<PlusMinusErrorResponse> business(PlusMinusException error) {
        return ResponseEntity.status(error.status()).cacheControl(CacheControl.noStore())
                .body(new PlusMinusErrorResponse(error.code(), error.getMessage()));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    ResponseEntity<PlusMinusErrorResponse> unavailable(RuntimeException error) {
        return ResponseEntity.status(503).cacheControl(CacheControl.noStore()).body(new PlusMinusErrorResponse(
                "PLUS_MINUS_UNAVAILABLE", "판 확인 중 문제가 생겼어요. 같은 요청으로 다시 시도해 주세요."));
    }

    private PlusMinusService service() {
        var service = services.getIfAvailable();
        if (service == null) {
            throw new PlusMinusException(503, "PLUS_MINUS_UNAVAILABLE", "더하기 빼기 아케이드 서버 연결을 확인해 주세요.");
        }
        return service;
    }

    private static long userId(AuthenticatedUser user) {
        if (user == null) {
            throw new PlusMinusException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
        return user.userId();
    }

    public record PlusMinusErrorResponse(String code, String message) {
    }
}
