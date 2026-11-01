package com.ssafy.ontop.game.rpsroulette.controller;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.rpsroulette.dto.RpsRouletteActionRequest;
import com.ssafy.ontop.game.rpsroulette.dto.RpsRouletteStartRequest;
import com.ssafy.ontop.game.rpsroulette.dto.RpsRouletteStateResponse;
import com.ssafy.ontop.game.rpsroulette.service.RpsRouletteException;
import com.ssafy.ontop.game.rpsroulette.service.RpsRouletteService;
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
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@RequestMapping("/api/v1/minigames/rps-roulette")
@Tag(name = "MINIGAME")
@SecurityRequirement(name = "AccessJwt")
@ApiResponses({
    @ApiResponse(responseCode = "400", description = "RPS_INVALID_REQUEST"),
    @ApiResponse(responseCode = "401", description = "인증된 활성 회원 필요"),
    @ApiResponse(responseCode = "403", description = "허용되지 않은 출처 또는 권한"),
    @ApiResponse(responseCode = "409", description = "WALLET_NOT_READY / INSUFFICIENT_COINS / RPS_DAILY_LIMIT / "
            + "RPS_ROUND_IN_PROGRESS / RPS_INVALID_PHASE / IDEMPOTENCY_KEY_CONFLICT"),
    @ApiResponse(responseCode = "503", description = "RPS_UNAVAILABLE")
})
public class RpsRouletteController {
    private static final String REQUEST_KEY = "[A-Za-z0-9_-]{1,64}";

    private final ObjectProvider<RpsRouletteService> services;

    public RpsRouletteController(ObjectProvider<RpsRouletteService> services) {
        this.services = services;
    }

    @GetMapping("/status")
    @Operation(operationId = "getRpsRouletteStatus", summary = "가위바위보 룰렛 상태 조회",
            description = "오늘 판 수, 사용 가능 잔액, 규칙과 가장 최근 판을 반환합니다. 마감이 지난 진행 중 판은 먼저 서버가 끝냅니다.")
    @ApiResponse(responseCode = "200", description = "현재 상태",
            content = @Content(schema = @Schema(implementation = RpsRouletteStateResponse.class)))
    public ResponseEntity<RpsRouletteStateResponse> status(@AuthenticationPrincipal AuthenticatedUser user) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service().status(userId(user)));
    }

    @PostMapping("/rounds")
    @Operation(operationId = "startRpsRouletteRound", summary = "가위바위보 룰렛 START",
            description = "참가비(10/20/30냥)와 하루 판 수를 차감하고 첫 대결의 기계 손 커밋을 발급합니다. "
                    + "Idempotency-Key를 재사용하면 같은 판을 반환하며 다시 차감하지 않습니다.")
    @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
            schema = @Schema(type = "string", minLength = 1, maxLength = 64, pattern = "^[A-Za-z0-9_-]{1,64}$"))
    @ApiResponse(responseCode = "201", description = "판 시작 또는 같은 요청 재확인",
            content = @Content(schema = @Schema(implementation = RpsRouletteStateResponse.class)))
    public ResponseEntity<RpsRouletteStateResponse> start(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestBody(required = false) RpsRouletteStartRequest body, HttpServletRequest request) {
        long userId = userId(user);
        var keys = Collections.list(request.getHeaders("Idempotency-Key"));
        if (keys.size() != 1 || !keys.getFirst().matches(REQUEST_KEY) || body == null) {
            throw new RpsRouletteException(400, "RPS_INVALID_REQUEST", "참가비와 중복 방지 키를 확인해 주세요.");
        }
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore())
                .body(service().start(userId, keys.getFirst(), body.fee()));
    }

    @PostMapping("/rounds/{roundId}/hands")
    @Operation(operationId = "playRpsRouletteHand", summary = "가위바위보 손 내기",
            description = "현재 순번(seq)의 대결에 손을 냅니다. 지난 순번은 다시 적용하지 않고 현재 상태를 반환합니다.")
    @ApiResponse(responseCode = "200", description = "공개된 결과와 현재 상태",
            content = @Content(schema = @Schema(implementation = RpsRouletteStateResponse.class)))
    public ResponseEntity<RpsRouletteStateResponse> hand(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable long roundId, @RequestBody(required = false) RpsRouletteActionRequest body) {
        long userId = userId(user);
        RpsRouletteActionRequest action = require(body);
        return ok(service().hand(userId, roundId, action.seq(), action.hand()));
    }

    @PostMapping("/rounds/{roundId}/challenge")
    @Operation(operationId = "challengeRpsRouletteRound", summary = "도전하기",
            description = "이긴 뒤 한 번 더 대결합니다. 1차 성공 ×1.5, 2차 성공 ×2.0, 실패하면 꽝입니다.")
    @ApiResponse(responseCode = "200", description = "다음 대결의 커밋과 현재 상태",
            content = @Content(schema = @Schema(implementation = RpsRouletteStateResponse.class)))
    public ResponseEntity<RpsRouletteStateResponse> challenge(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable long roundId, @RequestBody(required = false) RpsRouletteActionRequest body) {
        long userId = userId(user);
        return ok(service().challenge(userId, roundId, require(body).seq()));
    }

    @PostMapping("/rounds/{roundId}/stop")
    @Operation(operationId = "stopRpsRouletteRound", summary = "멈추고 룰렛 돌리기",
            description = "현재 배수로 룰렛 칸을 정하고 참가비 × 칸 × 배수를 지급합니다.")
    @ApiResponse(responseCode = "200", description = "룰렛 결과와 현재 상태",
            content = @Content(schema = @Schema(implementation = RpsRouletteStateResponse.class)))
    public ResponseEntity<RpsRouletteStateResponse> stop(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable long roundId, @RequestBody(required = false) RpsRouletteActionRequest body) {
        long userId = userId(user);
        return ok(service().stop(userId, roundId, require(body).seq()));
    }

    @ExceptionHandler(RpsRouletteException.class)
    ResponseEntity<RpsRouletteErrorResponse> business(RpsRouletteException error) {
        return ResponseEntity.status(error.status()).cacheControl(CacheControl.noStore())
                .body(new RpsRouletteErrorResponse(error.code(), error.getMessage()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<RpsRouletteErrorResponse> unreadable(HttpMessageNotReadableException error) {
        return ResponseEntity.status(400).cacheControl(CacheControl.noStore())
                .body(new RpsRouletteErrorResponse("RPS_INVALID_REQUEST", "요청 형식을 확인해 주세요."));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    ResponseEntity<RpsRouletteErrorResponse> unavailable(RuntimeException error) {
        return ResponseEntity.status(503).cacheControl(CacheControl.noStore()).body(new RpsRouletteErrorResponse(
                "RPS_UNAVAILABLE", "판 확인 중 문제가 생겼어요. 같은 요청으로 다시 시도해 주세요."));
    }

    private RpsRouletteService service() {
        var service = services.getIfAvailable();
        if (service == null) {
            throw new RpsRouletteException(503, "RPS_UNAVAILABLE", "가위바위보 룰렛 서버 연결을 확인해 주세요.");
        }
        return service;
    }

    private static long userId(AuthenticatedUser user) {
        if (user == null) {
            throw new RpsRouletteException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
        return user.userId();
    }

    private static RpsRouletteActionRequest require(RpsRouletteActionRequest body) {
        if (body == null) {
            throw new RpsRouletteException(400, "RPS_INVALID_REQUEST", "판 순번을 확인해 주세요.");
        }
        return body;
    }

    private static ResponseEntity<RpsRouletteStateResponse> ok(RpsRouletteStateResponse body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    public record RpsRouletteErrorResponse(String code, String message) {
    }
}
