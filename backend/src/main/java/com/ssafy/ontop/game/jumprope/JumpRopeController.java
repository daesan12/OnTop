package com.ssafy.ontop.game.jumprope;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.operation.config.NewActivity;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Collections;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@RequestMapping(value = "/api/v1/minigames/jump-rope", produces = MediaType.APPLICATION_JSON_VALUE)
@Tag(name = "MINIGAME")
@SecurityRequirement(name = "AccessJwt")
@ApiResponse(responseCode = "401", description = "로그인 필요", content = @Content(schema = @Schema(implementation = JumpRopeDtos.Error.class)))
@ApiResponse(responseCode = "503", description = "기록 서버 또는 신규 활동 일시 중단", content = @Content(schema = @Schema(implementation = JumpRopeDtos.Error.class)))
public class JumpRopeController {
    private final ObjectProvider<JumpRopeService> services;

    public JumpRopeController(ObjectProvider<JumpRopeService> services) { this.services = services; }

    @PostMapping("/rounds")
    @NewActivity
    @Operation(operationId = "startJumpRopeRound", summary = "줄넘기 서버 판 시작",
            description = "플레이 시작은 서버 기준 3초 뒤이며, 만료는 플레이 시작 95초 뒤입니다. 같은 키로 재시도하면 기존 시각을 반환합니다. "
                    + "rulesVersion은 서버 설정(기본 1)으로 정하며, 2이면 탑골 할아버지 난입과 숙이기 규칙을 적용합니다.")
    @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
            schema = @Schema(type = "string", minLength = 1, maxLength = 64, pattern = "^[A-Za-z0-9_-]{1,64}$"))
    @ApiResponse(responseCode = "201", description = "새 판 또는 동일 키로 조회한 활성 판",
            content = @Content(schema = @Schema(implementation = JumpRopeDtos.Round.class)))
    @ApiResponse(responseCode = "400", description = "시작 요청 키 오류", content = @Content(schema = @Schema(implementation = JumpRopeDtos.Error.class)))
    @ApiResponse(responseCode = "409", description = "이미 완료·만료·대체된 시작 요청", content = @Content(schema = @Schema(implementation = JumpRopeDtos.Error.class)))
    public ResponseEntity<JumpRopeDtos.Round> start(@AuthenticationPrincipal AuthenticatedUser user, HttpServletRequest request) {
        long userId = userId(user);
        var keys = Collections.list(request.getHeaders("Idempotency-Key"));
        if (keys.size() != 1) throw JumpRopeService.invalidKey();
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service().start(userId, keys.getFirst()));
    }

    @PostMapping(value = "/rounds/{roundId}/complete", consumes = MediaType.APPLICATION_JSON_VALUE)
    @Operation(operationId = "completeJumpRopeRound", summary = "점프 입력 재생 및 줄넘기 기록 확정",
            description = "카운트다운·MISS 정지를 제외한 실제 플레이 오프셋만 제출합니다. 판정 규칙은 판 시작 시 저장된 rulesVersion으로 정하며, "
                    + "rulesVersion 2 판은 duckSpansUs를 함께 보내야 합니다. 60초 완주 시 실제 엽전 지급액을 확정하며, 만료 전 동일 입력 재시도에는 같은 결과와 지급액을 반환합니다.")
    @ApiResponse(responseCode = "200", description = "서버가 확정한 점수, 종료 결과 및 실제 지급 엽전",
            content = @Content(schema = @Schema(implementation = JumpRopeDtos.Result.class)))
    @ApiResponse(responseCode = "400", description = "라운드 ID, 점프 또는 숙이기 입력 오류", content = @Content(schema = @Schema(implementation = JumpRopeDtos.Error.class)))
    @ApiResponse(responseCode = "404", description = "본인 라운드를 찾을 수 없음", content = @Content(schema = @Schema(implementation = JumpRopeDtos.Error.class)))
    @ApiResponse(responseCode = "409", description = "종료 전·만료·대체된 판 또는 확정 입력과 불일치", content = @Content(schema = @Schema(implementation = JumpRopeDtos.Error.class)))
    public ResponseEntity<JumpRopeDtos.Result> complete(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable String roundId, @RequestBody JumpRopeDtos.Complete body) {
        long userId = userId(user);
        long id;
        try {
            if (!roundId.matches("[1-9][0-9]{0,18}")) throw invalidRequest();
            id = Long.parseLong(roundId);
        } catch (NumberFormatException e) {
            throw invalidRequest();
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service().complete(userId, id, body.jumpOffsetsUs(), body.duckSpansUs()));
    }

    @GetMapping("/rankings")
    @Operation(operationId = "getJumpRopeRankings", summary = "전체 기간 줄넘기 랭킹 및 내 최고 기록",
            description = "현재 신규 판 규칙 버전(rulesVersion)의 확정 기록만 사용합니다. 다른 버전 기록은 보존하되 이 순위에 넣지 않습니다. "
                    + "사용자별 최고 확정 기록을 점수 내림차순·MISS 오름차순으로 정렬합니다. 두 값이 같으면 공동 순위입니다.")
    @ApiResponse(responseCode = "200", description = "랭킹 페이지와 전체 순위 기준 내 최고 기록",
            content = @Content(schema = @Schema(implementation = JumpRopeDtos.Rankings.class)))
    @ApiResponse(responseCode = "400", description = "페이지 범위 오류", content = @Content(schema = @Schema(implementation = JumpRopeDtos.Error.class)))
    public ResponseEntity<JumpRopeDtos.Rankings> rankings(@AuthenticationPrincipal AuthenticatedUser user,
            @Parameter(schema = @Schema(minimum = "1", maximum = "10")) @RequestParam(defaultValue = "10") int limit,
            @Parameter(schema = @Schema(minimum = "0", maximum = "10000")) @RequestParam(defaultValue = "0") int offset) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service().rankings(userId(user), limit, offset));
    }

    @ExceptionHandler(JumpRopeException.class)
    ResponseEntity<JumpRopeDtos.Error> business(JumpRopeException e) {
        return ResponseEntity.status(e.status()).cacheControl(CacheControl.noStore())
                .body(new JumpRopeDtos.Error(e.code(), e.getMessage()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<JumpRopeDtos.Error> unreadable() { return business(invalidRequest()); }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    ResponseEntity<JumpRopeDtos.Error> invalidPage() {
        return business(new JumpRopeException(400, "JUMP_ROPE_INVALID_PAGE", "페이지 범위를 확인해 주세요."));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    ResponseEntity<JumpRopeDtos.Error> unavailable() { return business(unavailableError()); }

    private JumpRopeService service() {
        var service = services.getIfAvailable();
        if (service == null) throw unavailableError();
        return service;
    }

    private static long userId(AuthenticatedUser user) {
        if (user == null) throw JumpRopeService.unauthenticated();
        return user.userId();
    }

    private static JumpRopeException invalidRequest() {
        return new JumpRopeException(400, "JUMP_ROPE_INVALID_REQUEST", "요청 값을 확인해 주세요.");
    }

    private static JumpRopeException unavailableError() {
        return new JumpRopeException(503, "JUMP_ROPE_UNAVAILABLE", "기록 서버를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.");
    }
}
