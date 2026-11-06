package com.ssafy.ontop.game.mole.controller;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.game.mole.dto.MoleDtos;
import com.ssafy.ontop.game.mole.service.MoleException;
import com.ssafy.ontop.game.mole.service.MoleService;
import com.ssafy.ontop.operation.config.NewActivity;
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
@RequestMapping("/api/v1/minigames/whack-a-mole")
@Tag(name = "MINIGAME")
@SecurityRequirement(name = "AccessJwt")
@ApiResponses({
    @ApiResponse(responseCode = "400", description = "MOLE_INVALID_REQUEST"),
    @ApiResponse(responseCode = "401", description = "인증된 활성 회원 필요"),
    @ApiResponse(responseCode = "403", description = "허용되지 않은 출처 또는 권한"),
    @ApiResponse(responseCode = "404", description = "MOLE_ROUND_NOT_FOUND"),
    @ApiResponse(responseCode = "409", description = "WALLET_NOT_READY / MOLE_ROUND_NOT_FINISHED / MOLE_ROUND_EXPIRED"),
    @ApiResponse(responseCode = "503", description = "MOLE_UNAVAILABLE")
})
public class MoleController {
    private static final String REQUEST_KEY = "[A-Za-z0-9_-]{1,64}";

    private final ObjectProvider<MoleService> services;

    public MoleController(ObjectProvider<MoleService> services) {
        this.services = services;
    }

    @GetMapping("/status")
    @Operation(operationId = "getWhackAMoleStatus", summary = "두더지 잡기 상태 조회",
            description = "오늘 받은 미니게임 보상 합계, 하루 상한, 최고 점수, 규칙과 가장 최근 정산 판을 반환합니다.")
    @ApiResponse(responseCode = "200", description = "현재 상태",
            content = @Content(schema = @Schema(implementation = MoleDtos.State.class)))
    public ResponseEntity<MoleDtos.State> status(@AuthenticationPrincipal AuthenticatedUser user) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service().status(userId(user)));
    }

    @PostMapping("/rounds")
    @NewActivity
    @Operation(operationId = "startWhackAMoleRound", summary = "두더지 잡기 시작",
            description = "참가비 없이 새 판을 열고 90초 출현표를 반환합니다. 끝내지 않은 이전 판은 보상 없이 닫습니다. "
                    + "Idempotency-Key를 재사용하면 같은 판을 반환합니다.")
    @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
            schema = @Schema(type = "string", minLength = 1, maxLength = 64, pattern = "^[A-Za-z0-9_-]{1,64}$"))
    @ApiResponse(responseCode = "201", description = "새 판 또는 같은 요청 재확인",
            content = @Content(schema = @Schema(implementation = MoleDtos.Round.class)))
    public ResponseEntity<MoleDtos.Round> start(@AuthenticationPrincipal AuthenticatedUser user,
            HttpServletRequest request) {
        long userId = userId(user);
        var keys = Collections.list(request.getHeaders("Idempotency-Key"));
        if (keys.size() != 1 || !keys.getFirst().matches(REQUEST_KEY)) {
            throw new MoleException(400, "MOLE_INVALID_REQUEST", "중복 방지 키를 확인해 주세요.");
        }
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore())
                .body(service().start(userId, keys.getFirst()));
    }

    @PostMapping("/rounds/{roundId}/complete")
    @Operation(operationId = "completeWhackAMoleRound", summary = "두더지 잡기 완료",
            description = "타격 기록(구멍 0~5, 판 시작 기준 ms)으로 서버가 점수를 다시 계산하고 40점당 1냥을 "
                    + "미니게임 공통 하루 상한 안에서 지급합니다. 이미 정산한 판은 같은 결과를 반환합니다.")
    @ApiResponse(responseCode = "200", description = "정산 결과",
            content = @Content(schema = @Schema(implementation = MoleDtos.Settlement.class)))
    public ResponseEntity<MoleDtos.Settlement> complete(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable String roundId, @RequestBody(required = false) MoleDtos.CompleteRequest body) {
        long userId = userId(user);
        if (!roundId.matches("[1-9][0-9]{0,18}")) {
            throw new MoleException(400, "MOLE_INVALID_REQUEST", "판 번호를 확인해 주세요.");
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service().complete(userId, Long.parseLong(roundId), body == null ? null : body.hits()));
    }

    @ExceptionHandler(MoleException.class)
    ResponseEntity<MoleErrorResponse> business(MoleException error) {
        return ResponseEntity.status(error.status()).cacheControl(CacheControl.noStore())
                .body(new MoleErrorResponse(error.code(), error.getMessage()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<MoleErrorResponse> unreadable(HttpMessageNotReadableException error) {
        return business(new MoleException(400, "MOLE_INVALID_REQUEST", "타격 기록을 확인해 주세요."));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    ResponseEntity<MoleErrorResponse> unavailable(RuntimeException error) {
        return ResponseEntity.status(503).cacheControl(CacheControl.noStore()).body(new MoleErrorResponse(
                "MOLE_UNAVAILABLE", "판 확인 중 문제가 생겼어요. 같은 요청으로 다시 시도해 주세요."));
    }

    private MoleService service() {
        var service = services.getIfAvailable();
        if (service == null) {
            throw new MoleException(503, "MOLE_UNAVAILABLE", "두더지 잡기 서버 연결을 확인해 주세요.");
        }
        return service;
    }

    private static long userId(AuthenticatedUser user) {
        if (user == null) {
            throw new MoleException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
        return user.userId();
    }

    public record MoleErrorResponse(String code, String message) {
    }
}
