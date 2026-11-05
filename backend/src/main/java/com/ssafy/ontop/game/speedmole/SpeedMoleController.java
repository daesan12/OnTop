package com.ssafy.ontop.game.speedmole;

import com.ssafy.ontop.auth.security.AuthenticatedUser;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.operation.config.NewActivity;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.responses.ApiResponse;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@RequestMapping("/api/v1/minigames/speed-mole")
@Tag(name = "MINIGAME")
@SecurityRequirement(name = "AccessJwt")
public class SpeedMoleController {
    private final ObjectProvider<SpeedMoleService> services;
    public SpeedMoleController(ObjectProvider<SpeedMoleService> services) { this.services = services; }
    @PostMapping("/rounds") @NewActivity
    @Operation(operationId = "startSpeedMoleRound", summary = "스피드 두더지 서버 판 시작")
    @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
            schema = @Schema(type = "string", minLength = 1, maxLength = 64, pattern = "^[A-Za-z0-9_-]{1,64}$"))
    @ApiResponse(responseCode = "201", description = "새 판 또는 같은 시작 요청 재확인",
            content = @Content(schema = @Schema(implementation = SpeedMoleDtos.Round.class)))
    public ResponseEntity<SpeedMoleDtos.Round> start(@AuthenticationPrincipal AuthenticatedUser user, HttpServletRequest request) {
        long id = user(user);
        var keys = Collections.list(request.getHeaders("Idempotency-Key"));
        if (keys.size() != 1) throw new SpeedMoleException(400, "SPEED_MOLE_INVALID_KEY", "시작 요청 키가 하나 필요해요.");
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service().start(id, keys.getFirst()));
    }
    @PostMapping("/rounds/{roundId}/complete")
    @Operation(operationId = "completeSpeedMoleRound", summary = "타격 재계산 후 스피드 두더지 랭킹 기록 확정 (보상 없음)")
    public ResponseEntity<SpeedMoleDtos.Result> complete(@AuthenticationPrincipal AuthenticatedUser user,
            @PathVariable String roundId, @RequestBody SpeedMoleDtos.Complete body) {
        long uid = user(user), id;
        try { id = Long.parseLong(roundId); } catch (NumberFormatException error) { throw invalid(); }
        if (id < 1 || body == null) throw invalid();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service().complete(uid, id, body.taps()));
    }
    @GetMapping("/rankings")
    @Operation(operationId = "getSpeedMoleRankings", summary = "개인 최고·전체 기간 스피드 두더지 랭킹")
    public ResponseEntity<SpeedMoleDtos.Rankings> rankings(@AuthenticationPrincipal AuthenticatedUser user,
            @RequestParam(defaultValue = "20") int limit, @RequestParam(defaultValue = "0") int offset) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service().rankings(user(user), limit, offset));
    }
    @ExceptionHandler(SpeedMoleException.class)
    ResponseEntity<Error> business(SpeedMoleException e) { return ResponseEntity.status(e.status()).cacheControl(CacheControl.noStore()).body(new Error(e.code(), e.getMessage())); }
    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<Error> unreadable() { return business(invalid()); }
    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    ResponseEntity<Error> unavailable() { return business(new SpeedMoleException(503, "SPEED_MOLE_UNAVAILABLE", "기록 서버를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.")); }
    private SpeedMoleService service() {
        var service = services.getIfAvailable();
        if (service == null) throw new SpeedMoleException(503, "SPEED_MOLE_UNAVAILABLE", "스피드 두더지 기록 서버가 준비되지 않았어요.");
        return service;
    }
    private static long user(AuthenticatedUser u) { if (u == null) throw new SpeedMoleException(401, "UNAUTHENTICATED", "로그인이 필요해요."); return u.userId(); }
    private static SpeedMoleException invalid() { return new SpeedMoleException(400, "SPEED_MOLE_INVALID_REQUEST", "요청 값을 확인해 주세요."); }
    public record Error(String code, String message) { }
}
