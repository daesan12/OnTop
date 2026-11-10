package com.ssafy.ontop.event.contact;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.event.contact.WinnerContactRepository.AwardRow;
import com.ssafy.ontop.event.contact.WinnerContactRepository.Contact;
import com.ssafy.ontop.event.contact.WinnerContactRepository.DeliveryTarget;
import com.ssafy.ontop.event.contact.WinnerContactRepository.Receipt;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public final class WinnerContactService {
    private static final Duration SUBMISSION_WINDOW = Duration.ofDays(7);
    private static final Duration RETENTION = Duration.ofDays(14);
    private final WinnerContactRepository repository;
    private final WinnerContactCrypto crypto;
    private final AdminAccessPolicy administrators;
    private final TransactionTemplate writes;
    private final TransactionTemplate reads;
    private final Clock clock;

    public WinnerContactService(WinnerContactRepository repository, WinnerContactCrypto crypto,
            AdminAccessPolicy administrators, PlatformTransactionManager manager, Clock clock) {
        this.repository = repository;
        this.crypto = crypto;
        this.administrators = administrators;
        this.clock = clock;
        this.writes = new TransactionTemplate(manager);
        this.writes.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.reads = new TransactionTemplate(manager);
        this.reads.setReadOnly(true);
    }

    public List<WinningResponse> ownWinnings(long userId, LocalDate week, int limit, int offset) {
        requireAccount(userId);
        validateWeek(week);
        validatePage(limit, offset);
        return Objects.requireNonNull(reads.execute(status -> {
            Instant now = now();
            Map<LocalDate, Boolean> deliveryByWeek = repository.publishedDeliveryByWeek(userId, now);
            return repository.ownAwards(userId, week, now, limit, offset).stream()
                    .map(row -> response(row, Boolean.TRUE.equals(deliveryByWeek.get(row.week())), now))
                    .toList();
        }));
    }

    public ContactResponse submit(long userId, LocalDate week, String suppliedPhone) {
        requireAccount(userId);
        requireWeek(week);
        String phone = normalizePhone(suppliedPhone);
        return Objects.requireNonNull(writes.execute(status -> {
            Instant now = now();
            if (!repository.lockActiveUser(userId)) {
                throw error(401, "EVENT_CONTACT_UNAUTHENTICATED", "로그인이 필요합니다.");
            }
            Instant announcedAt = repository.latestAnnouncement(userId, week, now).orElseThrow(
                    () -> error(403, "EVENT_CONTACT_NOT_WINNER", "발표된 당첨 내역이 없습니다."));
            if (Boolean.TRUE.equals(repository.publishedDeliveryByWeek(userId, now).get(week))) {
                throw error(409, "EVENT_CONTACT_ALREADY_DELIVERED", "모든 경품의 지급이 완료되었습니다.");
            }
            Instant deadline = announcedAt.plus(SUBMISSION_WINDOW);
            if (!now.isBefore(deadline)) {
                throw error(409, "EVENT_CONTACT_SUBMISSION_CLOSED", "연락처 제출 기한이 지났습니다.");
            }
            Receipt receipt = repository.receipt(userId, week).orElse(null);
            if (receipt != null && !now.isBefore(receipt.expiresAt())) {
                throw error(409, "EVENT_CONTACT_EXPIRED", "연락처 보관 기간이 지났습니다.");
            }
            Contact existing = repository.contact(userId, week).orElse(null);
            if (existing != null && now.isBefore(existing.expiresAt())
                    && crypto.decrypt(userId, week, existing.keyId(), existing.encrypted()).equals(phone)) {
                // A retry does not alter the phone, first submission, expiry, or last actual update.
                return new ContactResponse(week, "SUBMITTED", mask(existing.lastFour()),
                        existing.expiresAt(), deadline);
            }
            if (receipt != null && existing == null) {
                throw error(503, "EVENT_CONTACT_INCONSISTENT", "연락처 상태를 확인할 수 없습니다.");
            }
            Instant firstSubmittedAt = receipt == null ? now : receipt.firstSubmittedAt();
            Instant expiresAt = receipt == null ? now.plus(RETENTION) : receipt.expiresAt();
            if (receipt == null) {
                repository.insertReceipt(userId, week, now, expiresAt);
            } else {
                repository.touchReceipt(userId, week, now);
            }
            String lastFour = phone.substring(phone.length() - 4);
            repository.saveContact(userId, week, crypto.encrypt(userId, week, phone),
                    crypto.activeKeyId(), lastFour, firstSubmittedAt, expiresAt);
            return new ContactResponse(week, "SUBMITTED", mask(lastFour), expiresAt, deadline);
        }));
    }

    public AdminListResponse adminWinners(long administratorId, LocalDate week, String type,
            String contactStatus, int limit, int offset) {
        requireReader(administratorId);
        validateWeek(week);
        String checkedType = optionalType(type);
        String checkedStatus = optionalStatus(contactStatus);
        validatePage(limit, offset);
        if (offset > 100_000) {
            throw error(400, "EVENT_CONTACT_BAD_PAGE", "조회 범위가 올바르지 않습니다.");
        }
        return Objects.requireNonNull(reads.execute(status -> {
            Instant now = now();
            List<AdminWinnerResponse> rows = repository.adminAwards(week, checkedType, checkedStatus,
                    now, limit + 1, offset).stream().map(this::adminResponse).toList();
            boolean hasMore = rows.size() > limit;
            return new AdminListResponse(hasMore ? rows.subList(0, limit) : rows,
                    limit, offset, hasMore);
        }));
    }

    public RevealedContact reveal(long administratorId, long winnerId) {
        if (!administrators.canViewContacts(administratorId)) {
            throw error(403, "EVENT_CONTACT_ADMIN_FORBIDDEN", "연락처 조회 권한이 없습니다.");
        }
        if (winnerId <= 0) {
            throw error(400, "EVENT_CONTACT_BAD_WINNER", "당첨자 ID가 올바르지 않습니다.");
        }
        return Objects.requireNonNull(writes.execute(status -> {
            Instant now = now();
            var contact = repository.awardContact(winnerId, now).orElseThrow(
                    () -> error(404, "EVENT_CONTACT_NOT_FOUND", "조회할 연락처가 없습니다."));
            if (contact.encrypted() == null || contact.keyId() == null || contact.expiresAt() == null) {
                throw error(404, "EVENT_CONTACT_NOT_FOUND", "조회할 연락처가 없습니다.");
            }
            String phone = crypto.decrypt(contact.userId(), contact.week(),
                    contact.keyId(), contact.encrypted());
            repository.auditReveal(administratorId, contact, now);
            return new RevealedContact(contact.winnerId(), phone, contact.expiresAt());
        }));
    }

    public DeliveryResponse confirmDelivery(long administratorId, long winnerId,
            Long expectedUserId) {
        if (!administrators.canOperate(administratorId)) {
            throw error(403, "EVENT_DELIVERY_ADMIN_FORBIDDEN", "경품 지급 권한이 없습니다.");
        }
        if (winnerId <= 0 || expectedUserId == null || expectedUserId <= 0) {
            throw error(400, "EVENT_DELIVERY_BAD_REQUEST", "당첨자와 회원을 확인해 주세요.");
        }
        return Objects.requireNonNull(writes.execute(status -> {
            // Serialize with member contact submission before checking the final delivery state.
            repository.lockActiveUser(expectedUserId);
            DeliveryTarget target = repository.deliveryTarget(winnerId, true).orElseThrow(
                    () -> error(404, "EVENT_DELIVERY_NOT_FOUND", "당첨 건이 없습니다."));
            if (target.userId() != expectedUserId) {
                throw error(409, "EVENT_DELIVERY_TARGET_CHANGED", "당첨자를 다시 확인해 주세요.");
            }
            if (!target.finalized()) {
                throw error(409, "EVENT_DELIVERY_NOT_FINALIZED", "확정 전 당첨 건은 지급할 수 없습니다.");
            }
            if (target.deliveredAt() != null) {
                return new DeliveryResponse(winnerId, expectedUserId, "DELIVERED",
                        target.deliveredByUserId(), target.deliveredAt(), true);
            }
            Instant deliveredAt = now();
            repository.insertDelivery(winnerId, administratorId, deliveredAt);
            return new DeliveryResponse(winnerId, expectedUserId, "DELIVERED",
                    administratorId, deliveredAt, false);
        }));
    }

    public int deleteExpired() {
        return Objects.requireNonNull(writes.execute(status -> repository.deleteExpired(now())));
    }

    private WinningResponse response(AwardRow row, boolean allDelivered, Instant now) {
        Instant deadline = publishedAt(row).plus(SUBMISSION_WINDOW);
        String status = contactStatus(row);
        boolean editable = !allDelivered && now.isBefore(deadline) && !status.equals("EXPIRED");
        return new WinningResponse(row.winnerId(), row.week(), row.eventType(), row.place(),
                row.prizeName(), publishedAt(row), deadline,
                status, row.lastFour() == null ? null : mask(row.lastFour()),
                row.contactExpiresAt(), row.deliveredAt() == null ? "PENDING" : "DELIVERED",
                row.deliveredAt(), allDelivered, editable && status.equals("NOT_SUBMITTED"), editable);
    }

    private AdminWinnerResponse adminResponse(AwardRow row) {
        return new AdminWinnerResponse(row.winnerId(), row.userId(), row.nickname(), row.week(),
                row.eventType(), row.place(), row.prizeName(), contactStatus(row),
                row.lastFour() == null ? null : mask(row.lastFour()), row.contactExpiresAt(),
                row.deliveredAt() == null ? "PENDING" : "DELIVERED",
                row.deliveredByUserId(), row.deliveredAt());
    }

    private String contactStatus(AwardRow row) {
        if (row.firstSubmittedAt() == null) {
            return "NOT_SUBMITTED";
        }
        return row.lastFour() == null ? "EXPIRED" : "SUBMITTED";
    }

    private Instant publishedAt(AwardRow row) {
        return row.announcesAt().isAfter(row.finalizedAt()) ? row.announcesAt() : row.finalizedAt();
    }

    private String optionalType(String type) {
        if (type == null || type.isBlank()) {
            return null;
        }
        if (List.of("RAFFLE", "BUNGEOPPANG", "JUMPMAP", "ASSET_VALUE").contains(type)) {
            return type;
        }
        throw error(400, "EVENT_CONTACT_BAD_TYPE", "행사 부문이 올바르지 않습니다.");
    }

    private String optionalStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        if (List.of("NOT_SUBMITTED", "SUBMITTED", "EXPIRED").contains(status)) {
            return status;
        }
        throw error(400, "EVENT_CONTACT_BAD_STATUS", "연락처 상태가 올바르지 않습니다.");
    }

    private String normalizePhone(String phone) {
        if (phone == null) {
            throw error(400, "EVENT_CONTACT_BAD_PHONE", "휴대전화 번호를 확인해 주세요.");
        }
        String normalized = phone.replace("-", "").replace(" ", "");
        if (!normalized.matches("(?:010[0-9]{8}|01[16789][0-9]{7,8})")) {
            throw error(400, "EVENT_CONTACT_BAD_PHONE", "휴대전화 번호를 확인해 주세요.");
        }
        return normalized;
    }

    private String mask(String lastFour) {
        return "***-****-" + lastFour;
    }

    private void requireReader(long userId) {
        if (!administrators.canRead(userId)) {
            throw error(403, "EVENT_CONTACT_ADMIN_FORBIDDEN", "이벤트 조회 권한이 없습니다.");
        }
    }

    private void requireAccount(long userId) {
        if (userId <= 0) {
            throw error(401, "EVENT_CONTACT_UNAUTHENTICATED", "로그인이 필요합니다.");
        }
    }

    private void requireWeek(LocalDate week) {
        if (week == null || week.getDayOfWeek() != DayOfWeek.MONDAY) {
            throw error(400, "EVENT_CONTACT_BAD_WEEK", "행사 주차는 월요일 날짜여야 합니다.");
        }
    }

    private void validatePage(int limit, int offset) {
        if (limit < 1 || limit > 100 || offset < 0) {
            throw error(400, "EVENT_CONTACT_BAD_PAGE", "조회 범위가 올바르지 않습니다.");
        }
    }

    private void validateWeek(LocalDate week) {
        if (week != null) {
            requireWeek(week);
        }
    }

    private Instant now() {
        return clock.instant().truncatedTo(ChronoUnit.MILLIS);
    }

    private WinnerContactException error(int status, String code, String message) {
        return new WinnerContactException(status, code, message);
    }

    public record WinningResponse(long winnerId, LocalDate weekStart, String eventType,
            int place, String prizeName, Instant announcedAt, Instant submissionDeadline,
            String contactStatus, String maskedPhone, Instant contactExpiresAt,
            String deliveryStatus, Instant deliveredAt, boolean allPrizesDelivered,
            boolean contactActionRequired, boolean contactEditable) {}

    public record ContactResponse(LocalDate weekStart, String status, String maskedPhone,
            Instant expiresAt, Instant submissionDeadline) {}

    public record AdminWinnerResponse(long winnerId, long userId, String nickname, LocalDate weekStart,
            String eventType, int place, String prizeName, String contactStatus,
            String maskedPhone, Instant contactExpiresAt, String deliveryStatus,
            Long deliveredByUserId, Instant deliveredAt) {}

    public record DeliveryResponse(long winnerId, long userId, String deliveryStatus,
            long deliveredByUserId, Instant deliveredAt, boolean alreadyDelivered) {}

    public record AdminListResponse(List<AdminWinnerResponse> winners, int limit, int offset,
            boolean hasMore) {}

    public record RevealedContact(long winnerId, String phone, Instant expiresAt) {
        @Override
        public String toString() {
            return "RevealedContact[redacted]";
        }
    }
}
