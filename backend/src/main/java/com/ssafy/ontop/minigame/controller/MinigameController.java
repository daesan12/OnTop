package com.ssafy.ontop.minigame.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.auth.dto.AuthErrorResponse;
import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.minigame.dto.BungeoppangV4DeliveryDtos;
import com.ssafy.ontop.minigame.dto.BungeoppangV4Responses;
import com.ssafy.ontop.minigame.dto.MinigameAbandonResponse;
import com.ssafy.ontop.minigame.dto.MinigameCompleteResponse;
import com.ssafy.ontop.minigame.dto.MinigameStartResponse;
import com.ssafy.ontop.minigame.dto.MinigameStatusResponse;
import com.ssafy.ontop.minigame.service.BungeoppangV4DeliveryContract;
import com.ssafy.ontop.minigame.service.BungeoppangV5DeliveryContract;
import com.ssafy.ontop.minigame.service.MinigameException;
import com.ssafy.ontop.minigame.service.MinigameService;
import com.ssafy.ontop.minigame.service.StoredMinigameResponseException;
import com.ssafy.ontop.operation.config.NewActivity;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import java.io.IOException;
import java.security.Principal;
import java.util.Collections;
import java.util.Set;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
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
    @NewActivity
    @Operation(summary = "붕어빵 세션 시작", description = "같은 회원·Idempotency-Key는 최초 세션 생성 응답을 반환합니다.")
    @ApiResponse(responseCode = "201", description = "생성 또는 같은 키의 최초 생성 응답",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = MinigameStartResponse.class)))
    @ApiResponse(responseCode = "409", description = "IDEMPOTENCY_KEY_CONFLICT / RULES_VERSION_MISMATCH")
    @ApiResponse(responseCode = "429", description = "TOO_MANY_STARTS")
    public ResponseEntity<?> start(Principal principal, @RequestBody JsonNode body, HttpServletRequest request) {
        long userId = account(principal);
        if (!body.isObject() || body.size() < 1 || body.size() > 2 || !body.path("minigameType").isTextual()) {
            throw invalid();
        }
        body.fieldNames().forEachRemaining(field -> {
            if (!Set.of("minigameType", "rulesVersion").contains(field)) { throw invalid(); }
        });
        if (!body.path("minigameType").textValue().equals("BUNGEOPPANG")) {
            throw new MinigameException(400, "UNSUPPORTED_MINIGAME", "지원하지 않는 미니게임입니다.");
        }
        String rulesVersion = body.has("rulesVersion") ? body.path("rulesVersion").textValue() : "v2";
        if (rulesVersion == null || rulesVersion.isBlank()) { throw invalid(); }
        requireKnownVersion(rulesVersion);
        var keys = Collections.list(request.getHeaders("Idempotency-Key"));
        if (keys.size() != 1 || !keys.getFirst().matches("[A-Za-z0-9_-]{1,64}")) {
            throw invalid();
        }
        String type = body.path("minigameType").textValue();
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore())
                .body(switch (rulesVersion) {
                    case "v4" -> service().startV4(userId, type, keys.getFirst());
                    case "v5" -> service().startV5(userId, type, keys.getFirst());
                    default -> service().start(userId, type, keys.getFirst());
                });
    }

    @GetMapping("/{sessionId}")
    @Operation(summary = "본인 미니게임 상태 조회")
    @ApiResponse(responseCode = "200", description = "본인 세션",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = MinigameStatusResponse.class)))
    @ApiResponse(responseCode = "404", description = "MINIGAME_NOT_FOUND")
    public ResponseEntity<?> load(Principal principal, @PathVariable String sessionId,
            @RequestParam(required = false) String includeSource,
            @RequestParam(required = false) String includeProgress,
            @RequestParam(required = false) String deliveryKey, HttpServletRequest request) {
        requireOnlyQueries(request, Set.of("includeSource", "includeProgress", "deliveryKey"));
        boolean source = optionalBoolean(includeSource);
        boolean progress = optionalBoolean(includeProgress);
        if (deliveryKey != null && !deliveryKey.matches("[A-Za-z0-9_-]{1,64}")) { throw invalid(); }
        return ok(service().loadSession(account(principal), sessionId(sessionId), source, progress, deliveryKey));
    }

    @PostMapping("/{sessionId}/manual-pause")
    @Operation(summary = "본인 붕어빵 설명서 일시정지 또는 재개")
    @ApiResponse(responseCode = "200", description = "현재 일시정지 상태와 서버 시간",
            content = @Content(mediaType = "application/json",
                    schema = @Schema(implementation = BungeoppangV4Responses.SessionResponse.class)))
    @ApiResponse(responseCode = "404", description = "MINIGAME_NOT_FOUND")
    @ApiResponse(responseCode = "409", description = "MANUAL_PAUSE_CHANGED / GAME_NOT_ACTIVE / RULES_VERSION_MISMATCH")
    public ResponseEntity<?> manualPause(Principal principal, @PathVariable String sessionId,
            @RequestBody JsonNode body) {
        if (!body.isObject() || body.size() != 2 || !body.path("paused").isBoolean()
                || !body.path("expectedPauseRevision").isIntegralNumber()
                || !body.path("expectedPauseRevision").canConvertToLong()
                || body.path("expectedPauseRevision").asLong() < 0
                || body.path("expectedPauseRevision").asLong() > 9007199254740991L) {
            throw invalid();
        }
        return ok(service().manualPause(account(principal), sessionId(sessionId), body.path("paused").asBoolean(),
                body.path("expectedPauseRevision").asLong()));
    }

    @GetMapping
    @Operation(summary = "붕어빵 시작 화면 상태 조회", description = "한국 날짜 기준 오늘 보상·첫 판·확인한 안내를 조회합니다.")
    @ApiResponse(responseCode = "200", description = "오늘 보상과 안내 상태",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = com.ssafy.ontop.minigame.dto.BungeoppangStatusResponse.class)))
    @ApiResponse(responseCode = "409", description = "RULES_VERSION_MISMATCH")
    public ResponseEntity<?> status(Principal principal,
            @RequestParam(required = false) String rulesVersion, HttpServletRequest request) {
        requireOnlyQueries(request, Set.of("rulesVersion"));
        String selected = rulesVersion == null ? "v2" : rulesVersion;
        if (selected.isBlank()) { throw invalid(); }
        requireKnownVersion(selected);
        return ok(switch (selected) {
            case "v4" -> service().statusV4(account(principal));
            case "v5" -> service().statusV5(account(principal));
            default -> service().status(account(principal));
        });
    }

    @PostMapping("/{sessionId}/deliveries")
    @Operation(summary = "붕어빵 v4·v5 납품 승인", description = "승인 prefix·종류별 FIFO 재고·대상 주문을 검증하고 "
            + "영속 영수증과 다음 주문을 원자적으로 저장합니다. v4는 현재 주문 한 건, v5는 활성 주문 3건 중 고른 주문을 "
            + "납품하고 비운 손님 자리에 replacementOrder를 발급합니다. v5 본문은 1 MiB, v4는 256 KiB까지 받습니다.")
    @ApiResponse(responseCode = "200", description = "최초 승인 또는 같은 키·본문의 최초 응답 재생",
            content = @Content(mediaType = "application/json",
                    schema = @Schema(implementation = BungeoppangV4DeliveryDtos.Response.class)))
    @ApiResponse(responseCode = "404", description = "MINIGAME_NOT_FOUND")
    @ApiResponse(responseCode = "409", description = "키·prefix·주문·규칙·상태 충돌")
    @ApiResponse(responseCode = "413", description = "REQUEST_TOO_LARGE")
    @ApiResponse(responseCode = "415", description = "UNSUPPORTED_MEDIA_TYPE")
    @ApiResponse(responseCode = "422", description = "납품 규칙 거부 / TIME_AHEAD",
            content = @Content(mediaType = "application/json",
                    schema = @Schema(implementation = BungeoppangV4DeliveryDtos.ErrorResponse.class)))
    public ResponseEntity<?> deliver(Principal principal, @PathVariable String sessionId,
            HttpServletRequest request) {
        long contentLength = request.getContentLengthLong();
        if (contentLength > BungeoppangV5DeliveryContract.MAX_BODY_BYTES) {
            throw new MinigameException(413, "REQUEST_TOO_LARGE", "납품 요청 본문이 너무 큽니다.");
        }
        String encoding = request.getHeader("Content-Encoding");
        if (encoding != null && !encoding.isBlank() && !encoding.equalsIgnoreCase("identity")) {
            throw new MinigameException(415, "UNSUPPORTED_MEDIA_TYPE", "압축된 납품 요청은 지원하지 않습니다.");
        }
        try {
            if (request.getContentType() == null || !MediaType.APPLICATION_JSON
                    .isCompatibleWith(MediaType.parseMediaType(request.getContentType()))) {
                throw new MinigameException(415, "UNSUPPORTED_MEDIA_TYPE", "JSON 납품 요청만 지원합니다.");
            }
        } catch (org.springframework.http.InvalidMediaTypeException exception) {
            throw new MinigameException(415, "UNSUPPORTED_MEDIA_TYPE", "JSON 납품 요청만 지원합니다.");
        }
        var keys = Collections.list(request.getHeaders("Idempotency-Key"));
        if (keys.size() != 1 || !keys.getFirst().matches("[A-Za-z0-9_-]{1,64}")) { throw invalid(); }
        byte[] bytes;
        try { bytes = request.getInputStream().readNBytes(BungeoppangV5DeliveryContract.MAX_BODY_BYTES + 1); }
        catch (IOException exception) { throw invalid(); }
        if (bytes.length > BungeoppangV5DeliveryContract.MAX_BODY_BYTES) {
            throw new MinigameException(413, "REQUEST_TOO_LARGE", "납품 요청 본문이 너무 큽니다.");
        }
        JsonNode body = limitedJson(bytes, "납품");
        if (isV5(body)) {
            return ok(service().deliverV5(account(principal), sessionId(sessionId), keys.getFirst(),
                    BungeoppangV5DeliveryContract.parse(body)));
        }
        BungeoppangV4DeliveryDtos.Request delivery = BungeoppangV4DeliveryContract.parse(body);
        return ok(service().deliver(account(principal), sessionId(sessionId), keys.getFirst(), delivery));
    }

    @PostMapping("/{sessionId}/complete")
    @Operation(summary = "미니게임 완료·보상 확정", description = "서버 검증 결과만 사용하며 중복 지급하지 않습니다.")
    @ApiResponse(responseCode = "200", description = "완료 또는 기존 완료 결과",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = MinigameCompleteResponse.class)))
    @ApiResponse(responseCode = "404", description = "MINIGAME_NOT_FOUND")
    @ApiResponse(responseCode = "409", description = "RULES_VERSION_MISMATCH / 종료 상태 충돌 / v4 IDEMPOTENCY_KEY_CONFLICT · "
            + "FINAL_RESULT_CONFLICT · PREFIX_MISMATCH · GAME_NOT_ACTIVE(제출 기한 경과)")
    @ApiResponse(responseCode = "413", description = "REQUEST_TOO_LARGE")
    @ApiResponse(responseCode = "415", description = "UNSUPPORTED_MEDIA_TYPE")
    @ApiResponse(responseCode = "422", description = "LOG_INVALID / TOO_EARLY / 마지막 미승인 납품의 저장된 거부 응답")
    public ResponseEntity<?> complete(Principal principal, @PathVariable String sessionId,
            HttpServletRequest request) {
        long userId = account(principal);
        JsonNode body = strictBody(request, "완료");
        if (body == null || !body.isObject()) { throw invalid(); }
        if (!body.has("rulesVersion")) {
            if (!body.has("log")) { throw invalid(); }
            body.fieldNames().forEachRemaining(field -> {
                if (!Set.of("log", "seenTips", "clientScore").contains(field)) { throw invalid(); }
            });
        }
        var keys = Collections.list(request.getHeaders("Idempotency-Key"));
        if (keys.size() > 1 || keys.size() == 1 && !keys.getFirst().matches("[A-Za-z0-9_-]{1,64}")) {
            throw invalid();
        }
        return ok(service().complete(userId, sessionId(sessionId), keys.isEmpty() ? null : keys.getFirst(), body));
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

    /** v5 is known only while explicitly enabled; otherwise it answers exactly like any unsupported version. */
    private void requireKnownVersion(String version) {
        if (version.equals("v2") || version.equals("v4")) { return; }
        if (version.equals("v5")) {
            MinigameService service = services.getIfAvailable();
            if (service != null && service.v5Enabled()) { return; }
        }
        if (!version.matches("v[1-9][0-9]{0,8}")) { throw invalid(); }
        throw new MinigameException(409, "RULES_VERSION_MISMATCH", "지원하지 않는 규칙 버전입니다.");
    }

    private boolean optionalBoolean(String value) {
        if (value == null || value.equals("false")) { return false; }
        if (value.equals("true")) { return true; }
        throw invalid();
    }

    private void requireOnlyQueries(HttpServletRequest request, Set<String> allowed) {
        request.getParameterMap().forEach((name, values) -> {
            if (!allowed.contains(name) || values.length != 1) { throw invalid(); }
        });
    }

    private JsonNode strictBody(HttpServletRequest request, String operation) {
        long contentLength = request.getContentLengthLong();
        if (contentLength > BungeoppangV5DeliveryContract.MAX_BODY_BYTES) {
            throw new MinigameException(413, "REQUEST_TOO_LARGE", operation + " 요청 본문이 너무 큽니다.");
        }
        String encoding = request.getHeader("Content-Encoding");
        if (encoding != null && !encoding.isBlank() && !encoding.equalsIgnoreCase("identity")) {
            throw new MinigameException(415, "UNSUPPORTED_MEDIA_TYPE", "압축된 " + operation + " 요청은 지원하지 않습니다.");
        }
        try {
            if (request.getContentType() == null || !MediaType.APPLICATION_JSON
                    .isCompatibleWith(MediaType.parseMediaType(request.getContentType()))) {
                throw new MinigameException(415, "UNSUPPORTED_MEDIA_TYPE", "JSON " + operation + " 요청만 지원합니다.");
            }
        } catch (org.springframework.http.InvalidMediaTypeException exception) {
            throw new MinigameException(415, "UNSUPPORTED_MEDIA_TYPE", "JSON " + operation + " 요청만 지원합니다.");
        }
        byte[] bytes;
        try { bytes = request.getInputStream().readNBytes(BungeoppangV5DeliveryContract.MAX_BODY_BYTES + 1); }
        catch (IOException exception) { throw invalid(); }
        if (bytes.length > BungeoppangV5DeliveryContract.MAX_BODY_BYTES) {
            throw new MinigameException(413, "REQUEST_TOO_LARGE", operation + " 요청 본문이 너무 큽니다.");
        }
        return limitedJson(bytes, operation);
    }

    /**
     * Only a v5 log may use the 1 MiB body; every other body keeps the v4 256 KiB limit, and an oversized body
     * that is not a v5 request still answers 413 even when it is not valid JSON.
     */
    private JsonNode limitedJson(byte[] bytes, String operation) {
        boolean overV4 = bytes.length > BungeoppangV4DeliveryContract.MAX_BODY_BYTES;
        JsonNode body;
        try { body = BungeoppangV4DeliveryContract.parseJson(bytes); }
        catch (MinigameException exception) {
            if (overV4) { throw tooLarge(operation); }
            throw exception;
        }
        if (overV4 && !isV5(body)) { throw tooLarge(operation); }
        return body;
    }

    private static boolean isV5(JsonNode body) {
        return body != null && "v5".equals(body.path("rulesVersion").textValue());
    }

    private static MinigameException tooLarge(String operation) {
        return new MinigameException(413, "REQUEST_TOO_LARGE", operation + " 요청 본문이 너무 큽니다.");
    }

    private MinigameException invalid() {
        return new MinigameException(400, "INVALID_REQUEST", "요청 필드와 값을 확인하세요.");
    }

    private ResponseEntity<?> ok(Object body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @ExceptionHandler(MinigameException.class)
    ResponseEntity<?> failure(MinigameException exception) {
        if (exception instanceof StoredMinigameResponseException stored) {
            return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore()).body(stored.body());
        }
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
