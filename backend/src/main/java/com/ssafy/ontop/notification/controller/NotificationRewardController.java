package com.ssafy.ontop.notification.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.feedback.service.FeedbackException;
import com.ssafy.ontop.notification.domain.NotificationReward;
import com.ssafy.ontop.notification.service.NotificationRewardService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.security.Principal;
import java.text.Normalizer;
import java.time.Instant;
import java.util.Set;
import java.util.UUID;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Tag(name = "NOTIFICATION")
@SecurityRequirement(name = "AccessJwt")
public class NotificationRewardController {
    private final ObjectProvider<NotificationRewardService> services;

    public NotificationRewardController(ObjectProvider<NotificationRewardService> services) { this.services = services; }

    @PostMapping("/api/v1/admin/wallet-grants/rewards")
    @Operation(operationId = "grantPersonalNotificationReward", summary = "지급 관리자 · 한 회원에게 수령형 보상 발송")
    public ResponseEntity<NotificationRewardService.GrantResponse> grant(Principal principal,
            @io.swagger.v3.oas.annotations.parameters.RequestBody(content = @io.swagger.v3.oas.annotations.media.Content(
                    schema = @io.swagger.v3.oas.annotations.media.Schema(implementation = RewardGrantInput.class)))
            @RequestBody JsonNode body) {
        long administrator = account(principal);
        var fields = Set.of("operationId", "userId", "kind", "amount", "title", "text", "expiresAt");
        if (body == null || !body.isObject() || body.size() != fields.size()
                || fields.stream().anyMatch(field -> !body.hasNonNull(field))) { throw invalid(); }
        String key = string(body, "operationId");
        try { if (!UUID.fromString(key).toString().equals(key)) { throw invalid(); } }
        catch (IllegalArgumentException exception) { throw invalid(); }
        NotificationReward.Kind kind;
        Instant expires;
        try {
            kind = NotificationReward.Kind.valueOf(string(body, "kind"));
            expires = Instant.parse(string(body, "expiresAt"));
            // MySQL TIMESTAMP 지원 범위를 벗어난 기한을 저장 직전 500으로 바꾸지 않는다.
            if (expires.getNano() % 1_000_000 != 0 || expires.isAfter(Instant.parse("2038-01-19T03:14:07Z"))) {
                throw invalid();
            }
        } catch (IllegalArgumentException | java.time.DateTimeException exception) { throw invalid(); }
        JsonNode amount = body.get("amount");
        if (!amount.isIntegralNumber() || !amount.canConvertToLong() || amount.longValue() <= 0
                || amount.longValue() > 9_007_199_254_740_991L) { throw invalid(); }
        return ok(service().grant(administrator, new NotificationRewardService.GrantRequest(key,
                id(string(body, "userId")), kind, amount.longValue(), text(body, "title", 100),
                text(body, "text", 1000), expires)));
    }

    @PostMapping("/api/v1/notifications/{notificationId}/claim")
    @Operation(operationId = "claimPersonalNotificationReward", summary = "본인 보상 한 번 수령 · 재요청 시 확정 영수증")
    public ResponseEntity<NotificationRewardService.ClaimResponse> claim(Principal principal,
            @PathVariable String notificationId, @RequestBody(required = false) JsonNode body) {
        long user = account(principal);
        if (body != null && (!body.isObject() || !body.isEmpty())) { throw invalid(); }
        return ok(service().claim(user, id(notificationId)));
    }

    private NotificationRewardService service() {
        var service = services.getIfAvailable();
        if (service == null) {
            throw new FeedbackException(503, "NOTIFICATION_NOT_CONFIGURED", "보상 저장소가 준비되지 않았습니다.");
        }
        return service;
    }

    private static String string(JsonNode body, String field) {
        if (!body.path(field).isTextual()) { throw invalid(); }
        return body.get(field).textValue();
    }

    private static String text(JsonNode body, String field, int limit) {
        String value = string(body, field);
        if (value.length() > limit) { throw invalid(); }
        value = Normalizer.normalize(value, Normalizer.Form.NFC)
                .replaceAll("[\\p{Cc}&&[^\\n\\t]]|\\p{Cf}", "").strip();
        if (value.isBlank() || value.length() > limit) { throw invalid(); }
        return value;
    }

    private static long id(String value) {
        if (value == null || !value.matches("[1-9][0-9]{0,18}")) { throw invalid(); }
        try { return Long.parseLong(value); }
        catch (NumberFormatException exception) { throw invalid(); }
    }

    private static long account(Principal principal) {
        if (principal == null) { throw new FeedbackException(401, "UNAUTHENTICATED", "로그인이 필요합니다."); }
        return id(principal.getName());
    }

    private static FeedbackException invalid() {
        return new FeedbackException(400, "INVALID_REQUEST", "보상 종류·수량·회원·수령 기한을 확인해주세요.");
    }

    private static <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @ExceptionHandler(FeedbackException.class)
    ResponseEntity<RewardErrorResponse> failure(FeedbackException exception) {
        return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore())
                .body(new RewardErrorResponse(exception.code(), exception.getMessage()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<RewardErrorResponse> malformed() { return failure(invalid()); }

    @ExceptionHandler({org.springframework.dao.DataAccessException.class,
            org.springframework.transaction.TransactionException.class, jakarta.persistence.PersistenceException.class})
    ResponseEntity<RewardErrorResponse> unavailable() {
        return failure(new FeedbackException(503, "REWARD_UNAVAILABLE", "지급 여부를 확인하지 못했습니다. 같은 보상으로 다시 확인해주세요."));
    }

    public record RewardErrorResponse(String code, String message) { }
    @io.swagger.v3.oas.annotations.media.Schema(additionalProperties = io.swagger.v3.oas.annotations.media.Schema.AdditionalPropertiesValue.FALSE,
            requiredProperties = {"operationId", "userId", "kind", "amount", "title", "text", "expiresAt"})
    public record RewardGrantInput(String operationId, String userId, NotificationReward.Kind kind, long amount,
            String title, String text, Instant expiresAt) { }
}
