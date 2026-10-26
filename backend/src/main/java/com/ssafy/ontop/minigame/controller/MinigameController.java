package com.ssafy.ontop.minigame.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.minigame.dto.MinigameAbandonResponse;
import com.ssafy.ontop.minigame.dto.MinigameCompleteResponse;
import com.ssafy.ontop.minigame.dto.MinigameStartResponse;
import com.ssafy.ontop.minigame.dto.MinigameStatusResponse;
import com.ssafy.ontop.minigame.service.MinigameException;
import com.ssafy.ontop.minigame.service.MinigameService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.security.Principal;
import java.util.Collections;
import java.util.Set;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("(local | dev) & !prod & !production")
@RequestMapping("/api/v1/minigames/sessions")
@Tag(name = "MINIGAME")
@SecurityRequirement(name = "AccessJwt")
@ApiResponses({
    @ApiResponse(responseCode = "400", description = "INVALID_REQUEST / UNSUPPORTED_MINIGAME",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = MinigameController.ErrorResponse.class))),
    @ApiResponse(responseCode = "401", description = "인증된 활성 회원 필요",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = AuthErrorResponse.class))),
    @ApiResponse(responseCode = "503", description = "MINIGAME_NOT_CONFIGURED / MINIGAME_UNAVAILABLE 또는 인증 DB 장애",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = MinigameController.ErrorResponse.class)))
})
public class MinigameController {
    private final ObjectProvider<MinigameService> services;

    public MinigameController(ObjectProvider<MinigameService> services) {
        this.services = services;
    }

    @PostMapping
    @Operation(summary = "붕어빵 세션 시작", description = "같은 회원·Idempotency-Key는 최초 세션 생성 응답을 반환합니다.")
    @ApiResponse(responseCode = "201", description = "생성 또는 같은 키의 최초 생성 응답",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = MinigameStartResponse.class)))
    @ApiResponse(responseCode = "429", description = "TOO_MANY_STARTS")
    public ResponseEntity<?> start(Principal principal, @RequestBody JsonNode body, HttpServletRequest request) {
        long userId = account(principal);
        if (!body.isObject() || body.size() != 1 || !body.path("minigameType").isTextual()) {
            throw invalid();
        }
        if (!body.path("minigameType").textValue().equals("BUNGEOPPANG")) {
            throw new MinigameException(400, "UNSUPPORTED_MINIGAME", "지원하지 않는 미니게임입니다.");
        }
        var keys = Collections.list(request.getHeaders("Idempotency-Key"));
        if (keys.size() != 1 || !keys.getFirst().matches("[A-Za-z0-9_-]{1,64}")) {
            throw invalid();
        }
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore())
                .body(service().start(userId, body.path("minigameType").textValue(), keys.getFirst()));
    }

    @GetMapping("/{sessionId}")
    @Operation(summary = "본인 미니게임 상태 조회")
    @ApiResponse(responseCode = "200", description = "본인 세션",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = MinigameStatusResponse.class)))
    @ApiResponse(responseCode = "404", description = "MINIGAME_NOT_FOUND")
    public ResponseEntity<?> load(Principal principal, @PathVariable String sessionId) {
        return ok(service().load(account(principal), sessionId(sessionId)));
    }

    @GetMapping
    @Operation(summary = "붕어빵 시작 화면 상태 조회", description = "한국 날짜 기준 오늘 보상·첫 판·확인한 안내를 조회합니다.")
    @ApiResponse(responseCode = "200", description = "오늘 보상과 안내 상태",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = com.ssafy.ontop.minigame.dto.BungeoppangStatusResponse.class)))
    public ResponseEntity<?> status(Principal principal) {
        return ok(service().status(account(principal)));
    }

    @PostMapping("/{sessionId}/complete")
    @Operation(summary = "미니게임 완료·보상 확정", description = "서버 검증 결과만 사용하며 중복 지급하지 않습니다.")
    @ApiResponse(responseCode = "200", description = "완료 또는 기존 완료 결과",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = MinigameCompleteResponse.class)))
    @ApiResponse(responseCode = "404", description = "MINIGAME_NOT_FOUND")
    @ApiResponse(responseCode = "409", description = "RULES_VERSION_MISMATCH / 종료 상태 충돌")
    @ApiResponse(responseCode = "422", description = "LOG_INVALID / TOO_EARLY")
    public ResponseEntity<?> complete(Principal principal, @PathVariable String sessionId, @RequestBody JsonNode body) {
        long userId = account(principal);
        if (!body.isObject() || !body.has("log")) { throw invalid(); }
        body.fieldNames().forEachRemaining(field -> {
            if (!Set.of("log", "seenTips", "clientScore").contains(field)) { throw invalid(); }
        });
        if (body.has("seenTips") && (!body.path("seenTips").isArray() || body.path("seenTips").size() > 5)) {
            throw invalid();
        }
        if (body.has("clientScore") && (!body.path("clientScore").isIntegralNumber()
                || !body.path("clientScore").canConvertToInt() || body.path("clientScore").intValue() < 0)) {
            throw invalid();
        }
        return ok(service().complete(userId, sessionId(sessionId), body));
    }

    @PostMapping("/{sessionId}/abandon")
    @Operation(summary = "미니게임 포기", description = "지급 없이 포기하며 같은 포기 요청은 기존 결과를 반환합니다.")
    @ApiResponse(responseCode = "200", description = "포기 또는 기존 포기 결과",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = MinigameAbandonResponse.class)))
    @ApiResponse(responseCode = "404", description = "MINIGAME_NOT_FOUND")
    @ApiResponse(responseCode = "409", description = "MINIGAME_ALREADY_COMPLETED / 종료 상태 충돌")
    public ResponseEntity<?> abandon(Principal principal, @PathVariable String sessionId, @RequestBody JsonNode body) {
        long userId = account(principal);
        empty(body);
        return ok(service().abandon(userId, sessionId(sessionId)));
    }

    private MinigameService service() {
        var service = services.getIfAvailable();
        if (service == null) {
            throw new MinigameException(503, "MINIGAME_NOT_CONFIGURED", "미니게임 DB 연결 설정이 필요합니다.");
        }
        return service;
    }

    private long account(Principal principal) {
        if (principal == null) {
            throw new MinigameException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
        try {
            long userId = Long.parseLong(principal.getName());
            if (userId <= 0) {
                throw new NumberFormatException();
            }
            return userId;
        } catch (NumberFormatException exception) {
            throw new MinigameException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
    }

    private long sessionId(String value) {
        if (!value.matches("[1-9][0-9]{0,18}")) {
            throw invalid();
        }
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException exception) {
            throw invalid();
        }
    }

    private void empty(JsonNode body) {
        if (!body.isObject() || !body.isEmpty()) {
            throw invalid();
        }
    }

    private MinigameException invalid() {
        return new MinigameException(400, "INVALID_REQUEST", "요청 필드와 값을 확인하세요.");
    }

    private ResponseEntity<?> ok(Object body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @ExceptionHandler(MinigameException.class)
    ResponseEntity<?> failure(MinigameException exception) {
        return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore())
                .body(new ErrorResponse(exception.code(), exception.getMessage(), null, exception.detail(), exception.index()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<?> malformed() {
        return failure(invalid());
    }

    @ExceptionHandler({DataAccessException.class, IllegalArgumentException.class, ArithmeticException.class})
    ResponseEntity<?> unavailable() {
        return failure(new MinigameException(503, "MINIGAME_UNAVAILABLE", "미니게임을 처리할 수 없습니다."));
    }

    @Schema(name = "MinigameErrorResponse")
    public record ErrorResponse(String code, String message, Object details, String detail, Integer index) {
    }
}
