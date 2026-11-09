package com.ssafy.ontop.event.contact;

import com.ssafy.ontop.config.RuntimeProfiles;
import com.ssafy.ontop.event.contact.WinnerContactService.AdminListResponse;
import com.ssafy.ontop.event.contact.WinnerContactService.ContactResponse;
import com.ssafy.ontop.event.contact.WinnerContactService.DeliveryResponse;
import com.ssafy.ontop.event.contact.WinnerContactService.RevealedContact;
import com.ssafy.ontop.event.contact.WinnerContactService.WinningResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.security.Principal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.TransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
@Tag(name = "Event Winner Contacts")
public class WinnerContactController {
    private final ObjectProvider<WinnerContactService> services;

    public WinnerContactController(ObjectProvider<WinnerContactService> services) {
        this.services = services;
    }

    @GetMapping("/api/v1/events/winnings/me")
    @Operation(summary = "본인의 발표된 당첨 내역·연락처 제출 상태",
            security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<List<WinningResponse>> ownWinnings(Principal principal,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate weekStart,
            @RequestParam(defaultValue = "100") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        return ok(service().ownWinnings(account(principal), weekStart, limit, offset));
    }

    @PutMapping("/api/v1/events/winnings/weeks/{weekStart}/contact")
    @Operation(summary = "발표된 당첨자 본인의 연락처 제출·기한 내 수정",
            security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<ContactResponse> submitContact(Principal principal,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate weekStart,
            @RequestBody ContactRequest request) {
        return ok(service().submit(account(principal), weekStart,
                request == null ? null : request.phone()));
    }

    @GetMapping("/api/v1/admin/events/winners")
    @Operation(summary = "관리자 당첨자·연락처 제출 상태 목록",
            security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<AdminListResponse> adminWinners(Principal principal,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
            LocalDate weekStart,
            @RequestParam(required = false) String type,
            @RequestParam(required = false) String contactStatus,
            @RequestParam(defaultValue = "50") int limit,
            @RequestParam(defaultValue = "0") int offset) {
        return ok(service().adminWinners(account(principal), weekStart, type,
                contactStatus, limit, offset));
    }

    @GetMapping("/api/v1/admin/events/winners/{winnerId}/contact")
    @Operation(summary = "권한 있는 관리자만 연락처 원문 조회·접근 기록",
            security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<RevealedContact> reveal(Principal principal, @PathVariable long winnerId) {
        return ok(service().reveal(account(principal), winnerId));
    }

    @PutMapping("/api/v1/admin/events/winners/{winnerId}/delivery")
    @Operation(summary = "관리자가 실제 경품 전달 후 당첨 건별 지급 완료 기록",
            security = @SecurityRequirement(name = "AccessJwt"))
    public ResponseEntity<DeliveryResponse> confirmDelivery(Principal principal,
            @PathVariable long winnerId, @RequestBody DeliveryRequest request) {
        return ok(service().confirmDelivery(account(principal), winnerId,
                request == null ? null : request.expectedUserId()));
    }

    private WinnerContactService service() {
        WinnerContactService service = services.getIfAvailable();
        if (service == null) {
            throw new WinnerContactException(503, "EVENT_CONTACT_NOT_CONFIGURED",
                    "당첨자 연락처 기능이 설정되지 않았습니다.");
        }
        return service;
    }

    private long account(Principal principal) {
        if (principal != null) {
            try {
                long userId = Long.parseLong(principal.getName());
                if (userId > 0) {
                    return userId;
                }
            } catch (NumberFormatException ignored) {
                // Authentication subject must be a positive internal member ID.
            }
        }
        throw new WinnerContactException(401, "EVENT_CONTACT_UNAUTHENTICATED", "로그인이 필요합니다.");
    }

    private <T> ResponseEntity<T> ok(T body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
    }

    @ExceptionHandler(WinnerContactException.class)
    ResponseEntity<ErrorResponse> contactError(WinnerContactException exception) {
        return ResponseEntity.status(exception.status()).cacheControl(CacheControl.noStore())
                .body(new ErrorResponse(exception.code(), exception.getMessage()));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ErrorResponse> badBody() {
        return contactError(new WinnerContactException(400, "EVENT_CONTACT_BAD_REQUEST",
                "요청 형식이 올바르지 않습니다."));
    }

    @ExceptionHandler({DataAccessException.class, TransactionException.class, IllegalStateException.class})
    ResponseEntity<ErrorResponse> unavailable() {
        return contactError(new WinnerContactException(503, "EVENT_CONTACT_UNAVAILABLE",
                "당첨자 연락처를 확인할 수 없습니다."));
    }

    public record ContactRequest(String phone) {
        @Override
        public String toString() {
            return "ContactRequest[redacted]";
        }
    }

    public record DeliveryRequest(
            @Schema(requiredMode = Schema.RequiredMode.REQUIRED) Long expectedUserId) {}

    public record ErrorResponse(String code, String message) {}
}
