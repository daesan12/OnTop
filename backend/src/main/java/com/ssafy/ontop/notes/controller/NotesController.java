package com.ssafy.ontop.notes.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.notes.domain.NoteText;
import com.ssafy.ontop.notes.dto.NoteListResponse;
import com.ssafy.ontop.notes.dto.NoteReceiptResponse;
import com.ssafy.ontop.notes.service.NoteException;
import com.ssafy.ontop.notes.service.NotesService;
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
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile("(local | dev) & !prod & !production")
@ConditionalOnProperty(name = "ontop.notes.enabled", havingValue = "true")
@Tag(name = "NOTES")
@SecurityRequirement(name = "AccessJwt")
@ApiResponses({
    @ApiResponse(responseCode = "400", description = "INVALID_REQUEST / NOTES_TEXT_INVALID",
            content = @Content(schema = @Schema(implementation = NotesController.ErrorResponse.class))),
    @ApiResponse(responseCode = "401", description = "활성 회원 인증 필요",
            content = @Content(schema = @Schema(implementation = NotesController.ErrorResponse.class))),
    @ApiResponse(responseCode = "403", description = "NOTES_OUT_OF_RANGE",
            content = @Content(schema = @Schema(implementation = NotesController.ErrorResponse.class))),
    @ApiResponse(responseCode = "503", description = "NOTES_NOT_CONFIGURED / NOTES_UNAVAILABLE",
            content = @Content(schema = @Schema(implementation = NotesController.ErrorResponse.class)))
})
public class NotesController {
    private final ObjectProvider<NotesService> services;

    public NotesController(ObjectProvider<NotesService> services) {
        this.services = services;
    }

    @PostMapping("/api/v1/notes")
    @Operation(summary = "전망대 익명 메모 작성", description = "전 채널 공용 최신120장. operationId=발급시각ms_임의키, 24시간 재확인.")
    @io.swagger.v3.oas.annotations.parameters.RequestBody(content = @Content(
            mediaType = "application/json", schema = @Schema(implementation = NoteSubmissionRequest.class),
            examples = @ExampleObject(value = "{\"operationId\":\"1761436800000_0123456789abcdef\",\"channelId\":\"channel-1\",\"text\":\"공원을 개선해주세요\"}")))
    @ApiResponse(responseCode = "201", description = "저장된 메모 또는 동일 요청의 기존 결과",
            content = @Content(schema = @Schema(implementation = NoteReceiptResponse.class)))
    @ApiResponse(responseCode = "409", description = "IDEMPOTENCY_CONFLICT / NOT_IN_CHANNEL / NOTES_ACTIVITY_CONFLICT",
            content = @Content(schema = @Schema(implementation = NotesController.ErrorResponse.class)))
    @ApiResponse(responseCode = "429", description = "NOTES_WRITE_COOLDOWN / NOTES_READ_COOLDOWN, nextAllowedAt 포함",
            content = @Content(schema = @Schema(implementation = NotesController.ErrorResponse.class)))
    @ApiResponse(responseCode = "410", description = "NOTE_REMOVED / NOTES_REQUEST_EXPIRED, 자동 재게시 금지",
            content = @Content(schema = @Schema(implementation = NotesController.ErrorResponse.class)))
    public ResponseEntity<NoteReceiptResponse> submit(Principal principal, @RequestBody JsonNode body) {
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
        if (!key.matches("[0-9]{13}_[A-Za-z0-9_-]{16,64}") || channel.isBlank() || channel.length() > 64) {
            throw invalid();
        }
        NoteText text;
        try {
            text = new NoteText(body.get("text").textValue());
        } catch (IllegalArgumentException exception) {
            throw new NoteException(400, "NOTES_TEXT_INVALID", "메모는 1~300자로 작성해주세요.");
        }
        var response = service().submit(userId, key, channel, text);
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(response);
    }

    @GetMapping("/api/v1/notes")
    @Operation(summary = "전망대 익명 메모 조회", description = "인증·서버 근접/활동 검사. 창을 연 동안2초마다 재조회하고 이탈·단절 시 중지.")
    @ApiResponse(responseCode = "409", description = "NOT_IN_CHANNEL / NOTES_ACTIVITY_CONFLICT",
            content = @Content(schema = @Schema(implementation = NotesController.ErrorResponse.class)))
    @ApiResponse(responseCode = "429", description = "NOTES_READ_COOLDOWN, nextAllowedAt 포함",
            content = @Content(schema = @Schema(implementation = NotesController.ErrorResponse.class)))
    public ResponseEntity<NoteListResponse> list(Principal principal, @RequestParam String channelId) {
        long userId = account(principal);
        if (channelId.isBlank() || channelId.length() > 64) {
            throw invalid();
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service().list(userId, channelId));
    }

    private NotesService service() {
        var service = services.getIfAvailable();
        if (service == null) {
            throw new NoteException(503, "NOTES_NOT_CONFIGURED", "익명 메모 DB 설정이 필요합니다.");
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
            throw new NoteException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
        throw new NoteException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
    }

    private NoteException invalid() {
        return new NoteException(400, "INVALID_REQUEST", "요청 필드와 값을 확인해주세요.");
    }

    @ExceptionHandler(NoteException.class)
    ResponseEntity<ErrorResponse> failure(NoteException exception) {
        return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore())
                .body(new ErrorResponse(exception.code(), exception.getMessage(), exception.nextAllowedAt()));
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MissingServletRequestParameterException.class})
    ResponseEntity<ErrorResponse> malformed() {
        return failure(invalid());
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class})
    ResponseEntity<ErrorResponse> unavailable() {
        return failure(new NoteException(503, "NOTES_UNAVAILABLE", "메모를 처리하지 못했습니다. 같은 키로 재시도해주세요."));
    }

    @Schema(name = "NotesErrorResponse")
    public record ErrorResponse(String code, String message, Instant nextAllowedAt) {
    }

    public record NoteSubmissionRequest(String operationId, String channelId, String text) {
        @Override
        public String toString() { return "NoteSubmission[redacted]"; }
    }
}
