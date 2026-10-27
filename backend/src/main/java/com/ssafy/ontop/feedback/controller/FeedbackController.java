package com.ssafy.ontop.feedback.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.feedback.domain.FeedbackText;
import com.ssafy.ontop.feedback.dto.FeedbackListResponse;
import com.ssafy.ontop.feedback.dto.FeedbackReceiptResponse;
import com.ssafy.ontop.feedback.service.FeedbackException;
import com.ssafy.ontop.feedback.service.FeedbackService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.ExampleObject;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.security.Principal;
import java.time.Instant;
import java.util.Set;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnProperty(name = "ontop.feedback.enabled", havingValue = "true")
@Tag(name = "FEEDBACK")
@SecurityRequirement(name = "AccessJwt")
@ApiResponses({
    @ApiResponse(responseCode = "400", description = "INVALID_REQUEST / FEEDBACK_TEXT_INVALID",
            content = @Content(schema = @Schema(implementation = FeedbackController.ErrorResponse.class))),
    @ApiResponse(responseCode = "401", description = "활성 회원 인증 필요",
            content = @Content(schema = @Schema(implementation = FeedbackController.ErrorResponse.class))),
    @ApiResponse(responseCode = "403", description = "FEEDBACK_OUT_OF_RANGE / FEEDBACK_ADMIN_REQUIRED",
            content = @Content(schema = @Schema(implementation = FeedbackController.ErrorResponse.class))),
    @ApiResponse(responseCode = "503", description = "FEEDBACK_NOT_CONFIGURED / FEEDBACK_UNAVAILABLE",
            content = @Content(schema = @Schema(implementation = FeedbackController.ErrorResponse.class)))
})
public class FeedbackController {
    private final ObjectProvider<FeedbackService> services;

    public FeedbackController(ObjectProvider<FeedbackService> services) {
        this.services = services;
    }

    @PostMapping("/api/v1/feedback")
    @Operation(summary = "소리함 비공개 의견 접수", description = "회원·operationId별 중복 접수 방지. 본문 공개 방송 없음.")
    @io.swagger.v3.oas.annotations.parameters.RequestBody(content = @Content(
            mediaType = "application/json", schema = @Schema(implementation = SubmissionRequest.class),
            examples = @ExampleObject(value = "{\"operationId\":\"feedback-1\",\"channelId\":\"channel-1\",\"text\":\"공원을 개선해주세요\"}")))
    @ApiResponse(responseCode = "201", description = "접수 또는 동일 요청의 기존 영수증",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = FeedbackReceiptResponse.class)))
    @ApiResponse(responseCode = "409", description = "IDEMPOTENCY_CONFLICT / NOT_IN_CHANNEL / FEEDBACK_ACTIVITY_CONFLICT",
            content = @Content(schema = @Schema(implementation = FeedbackController.ErrorResponse.class)))
    @ApiResponse(responseCode = "429", description = "FEEDBACK_COOLDOWN, nextAllowedAt 포함",
            content = @Content(schema = @Schema(implementation = FeedbackController.ErrorResponse.class)))
    public ResponseEntity<FeedbackReceiptResponse> submit(Principal principal, @RequestBody JsonNode body) {
        long userId = account(principal);
        if (!body.isObject() || body.size() != 3 || !body.hasNonNull("operationId")
                || !body.hasNonNull("channelId") || !body.hasNonNull("text")) {
            throw invalid();
        }
        for (String field : Set.of("operationId", "channelId", "text")) {
            if (!body.get(field).isTextual()) {
                throw invalid();
            }
        }
        String key = body.get("operationId").textValue();
        String channel = body.get("channelId").textValue();
        if (!key.matches("[A-Za-z0-9_-]{1,64}") || channel.isBlank() || channel.length() > 64) {
            throw invalid();
        }
        FeedbackText text;
        try {
            text = new FeedbackText(body.get("text").textValue());
        } catch (IllegalArgumentException exception) {
            throw new FeedbackException(400, "FEEDBACK_TEXT_INVALID", "의견은 5~600자로 작성해주세요.");
        }
        var response = service().submit(userId, key, channel, text);
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(response);
    }

    @GetMapping("/api/v1/admin/feedback")
    @Operation(summary = "관리자 소리함 조회", description = "서버 관리자 회원 ID 목록에 등록된 활성 회원만 조회합니다.")
    @ApiResponse(responseCode = "200", description = "접수 목록. 마지막 페이지의 nextCursor는 null",
            content = @Content(mediaType = "application/json", schema = @Schema(implementation = FeedbackListResponse.class)))
    public ResponseEntity<FeedbackListResponse> list(Principal principal,
            @RequestParam(defaultValue = "") String cursor, @RequestParam(defaultValue = "20") String limit) {
        long userId = account(principal);
        long before = Long.MAX_VALUE;
        int size;
        try {
            if (!cursor.isEmpty()) {
                if (!cursor.matches("[1-9][0-9]{0,18}")) {
                    throw invalid();
                }
                before = Long.parseLong(cursor);
            }
            if (!limit.matches("[1-9][0-9]?")) {
                throw invalid();
            }
            size = Integer.parseInt(limit);
            if (size > 50) {
                throw invalid();
            }
        } catch (NumberFormatException exception) {
            throw invalid();
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service().list(userId, before, size));
    }

    private FeedbackService service() {
        var service = services.getIfAvailable();
        if (service == null) {
            throw new FeedbackException(503, "FEEDBACK_NOT_CONFIGURED", "소리함 DB 설정이 필요합니다.");
        }
        return service;
    }

    private long account(Principal principal) {
        try {
            long user = principal == null ? 0 : Long.parseLong(principal.getName());
            if (user > 0) {
                return user;
            }
        } catch (NumberFormatException exception) {
            throw new FeedbackException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
        throw new FeedbackException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
    }

    private FeedbackException invalid() {
        return new FeedbackException(400, "INVALID_REQUEST", "요청 필드와 값을 확인해주세요.");
    }

    @ExceptionHandler(FeedbackException.class)
    ResponseEntity<ErrorResponse> failure(FeedbackException exception) {
        return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore())
                .body(new ErrorResponse(exception.code(), exception.getMessage(), exception.nextAllowedAt()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ErrorResponse> malformed() {
        return failure(invalid());
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    ResponseEntity<ErrorResponse> unavailable() {
        return failure(new FeedbackException(503, "FEEDBACK_UNAVAILABLE", "의견을 처리하지 못했습니다. 같은 키로 재시도해주세요."));
    }

    @Schema(name = "FeedbackErrorResponse")
    public record ErrorResponse(String code, String message, Instant nextAllowedAt) {
    }

    public record SubmissionRequest(String operationId, String channelId, String text) {
        @Override
        public String toString() { return "FeedbackSubmission[redacted]"; }
    }
}
