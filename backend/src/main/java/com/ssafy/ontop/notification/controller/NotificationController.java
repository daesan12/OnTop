package com.ssafy.ontop.notification.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.feedback.domain.FeedbackMessage;
import com.ssafy.ontop.feedback.service.FeedbackException;
import com.ssafy.ontop.notification.dto.NotificationDetailResponse;
import com.ssafy.ontop.notification.dto.NotificationListResponse;
import com.ssafy.ontop.notification.service.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.security.Principal;
import java.text.Normalizer;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "NOTIFICATION")
@SecurityRequirement(name = "AccessJwt")
public class NotificationController {
    private final ObjectProvider<NotificationService> services;

    public NotificationController(ObjectProvider<NotificationService> services) { this.services = services; }

    @GetMapping("/api/v1/notifications")
    @Operation(operationId = "listPersonalNotifications", summary = "본인 알림 목록·미읽음 개수")
    public ResponseEntity<NotificationListResponse> list(Principal principal,
            @RequestParam(defaultValue = "") String cursor, @RequestParam(defaultValue = "20") String limit) {
        long user = account(principal);
        long before = cursor.isEmpty() ? Long.MAX_VALUE : id(cursor);
        if (!limit.matches("[1-9][0-9]?")) { throw invalid(); }
        int size = Integer.parseInt(limit);
        if (size > 50) { throw invalid(); }
        return response(service().list(user, before, size));
    }

    @GetMapping("/api/v1/notifications/{notificationId}")
    @Operation(operationId = "getPersonalNotification", summary = "본인 알림 상세·관련 소리함 의견")
    public ResponseEntity<NotificationDetailResponse> detail(Principal principal, @PathVariable String notificationId) {
        return response(service().detail(account(principal), id(notificationId), false));
    }

    @PatchMapping("/api/v1/notifications/{notificationId}/read")
    @Operation(operationId = "readPersonalNotification", summary = "본인 알림 읽음 처리·동일 요청 재확인")
    public ResponseEntity<NotificationDetailResponse> read(Principal principal, @PathVariable String notificationId) {
        return response(service().detail(account(principal), id(notificationId), true));
    }

    // 기존 ADMIN_OPERATION 접근 제어를 그대로 사용해 인증 담당 코드는 변경하지 않는다.
    @PostMapping("/api/v1/admin/operations/feedback/{receiptId}/replies")
    @Operation(operationId = "replyToFeedback", summary = "운영진 답변·작성자 개인 알림 저장")
    public ResponseEntity<NotificationService.ReplyResult> reply(Principal principal, @PathVariable String receiptId,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(content = @io.swagger.v3.oas.annotations.media.Content(
                    schema = @io.swagger.v3.oas.annotations.media.Schema(implementation = FeedbackReplyInput.class)))
            @RequestBody JsonNode body) {
        long administrator = account(principal);
        fields(body, Set.of("operationId", "text", "status", "expectedVersion"));
        if (!body.path("operationId").isTextual() || !body.path("text").isTextual()) { throw invalid(); }
        String key = body.get("operationId").textValue();
        try {
            if (!UUID.fromString(key).toString().equals(key)) { throw invalid(); }
        } catch (IllegalArgumentException exception) { throw invalid(); }
        String text = body.get("text").textValue();
        if (text.length() > 2000) { throw invalid(); }
        text = Normalizer.normalize(text, Normalizer.Form.NFC)
                .replaceAll("[\\p{Cc}&&[^\\n\\t]]|\\p{Cf}", "").strip();
        if (text.isBlank() || text.length() > 2000) { throw invalid(); }
        return response(service().reply(administrator, id(receiptId), key, text, status(body), version(body)));
    }

    @PatchMapping("/api/v1/admin/operations/feedback/{receiptId}/status")
    @Operation(operationId = "updateFeedbackStatus", summary = "소리함 처리 상태 변경·버전 충돌 차단")
    public ResponseEntity<NotificationService.StatusResult> status(Principal principal, @PathVariable String receiptId,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(content = @io.swagger.v3.oas.annotations.media.Content(
                    schema = @io.swagger.v3.oas.annotations.media.Schema(implementation = FeedbackStatusInput.class)))
            @RequestBody JsonNode body) {
        fields(body, Set.of("status", "expectedVersion"));
        return response(service().status(account(principal), id(receiptId), status(body), version(body)));
    }

    private NotificationService service() {
        var service = services.getIfAvailable();
        if (service == null) {
            throw new FeedbackException(503, "NOTIFICATION_NOT_CONFIGURED", "알림함 저장소가 준비되지 않았습니다.");
        }
        return service;
    }

    private static void fields(JsonNode body, Set<String> fields) {
        if (body == null || !body.isObject() || body.size() != fields.size()
                || fields.stream().anyMatch(field -> !body.hasNonNull(field))) { throw invalid(); }
    }

    private static FeedbackMessage.Status status(JsonNode body) {
        if (!body.path("status").isTextual()) { throw invalid(); }
        try { return FeedbackMessage.Status.valueOf(body.get("status").textValue()); }
        catch (IllegalArgumentException exception) { throw invalid(); }
    }

    private static long version(JsonNode body) {
        JsonNode value = body.path("expectedVersion");
        if (!value.isIntegralNumber() || !value.canConvertToLong() || value.longValue() < 0) { throw invalid(); }
        return value.longValue();
    }

    private static long id(String value) {
        if (!value.matches("[1-9][0-9]{0,18}")) { throw invalid(); }
        try { return Long.parseLong(value); }
        catch (NumberFormatException exception) { throw invalid(); }
    }

    private static long account(Principal principal) {
        if (principal == null) { throw new FeedbackException(401, "UNAUTHENTICATED", "로그인이 필요합니다."); }
        return id(principal.getName());
    }

    private static FeedbackException invalid() {
        return new FeedbackException(400, "INVALID_REQUEST", "요청 필드와 값을 확인해주세요.");
    }

    private static <T> ResponseEntity<T> response(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @ExceptionHandler(FeedbackException.class)
    ResponseEntity<ErrorResponse> failure(FeedbackException exception) {
        return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore())
                .body(new ErrorResponse(exception.code(), exception.getMessage()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ErrorResponse> malformed() { return failure(invalid()); }

    @ExceptionHandler({org.springframework.dao.DataAccessException.class,
            org.springframework.transaction.TransactionException.class, jakarta.persistence.PersistenceException.class})
    ResponseEntity<ErrorResponse> unavailable() {
        return failure(new FeedbackException(503, "NOTIFICATION_UNAVAILABLE", "처리하지 못했습니다. 같은 요청으로 다시 확인해주세요."));
    }

    public record ErrorResponse(String code, String message) { }

    @io.swagger.v3.oas.annotations.media.Schema(additionalProperties = io.swagger.v3.oas.annotations.media.Schema.AdditionalPropertiesValue.FALSE,
            requiredProperties = {"operationId", "text", "status", "expectedVersion"})
    public record FeedbackReplyInput(String operationId, String text, FeedbackMessage.Status status, long expectedVersion) { }

    @io.swagger.v3.oas.annotations.media.Schema(additionalProperties = io.swagger.v3.oas.annotations.media.Schema.AdditionalPropertiesValue.FALSE,
            requiredProperties = {"status", "expectedVersion"})
    public record FeedbackStatusInput(FeedbackMessage.Status status, long expectedVersion) { }
}
