package com.ssafy.ontop.notification.service;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.feedback.domain.FeedbackMessage;
import com.ssafy.ontop.feedback.domain.FeedbackReply;
import com.ssafy.ontop.feedback.repository.FeedbackRepository;
import com.ssafy.ontop.feedback.service.FeedbackException;
import com.ssafy.ontop.notification.domain.PersonalNotification;
import com.ssafy.ontop.notification.dto.NotificationDetailResponse;
import com.ssafy.ontop.notification.dto.NotificationListResponse;
import com.ssafy.ontop.notification.dto.NotificationRewardResponse;
import com.ssafy.ontop.notification.repository.EventWinnerNotificationRepository;
import com.ssafy.ontop.notification.repository.NotificationRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

public class NotificationService {
    private final FeedbackRepository feedback;
    private final NotificationRepository repository;
    private final EventWinnerNotificationRepository eventWinners;
    private final AdminAccessPolicy administrators;
    private final TransactionTemplate transactions;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public NotificationService(FeedbackRepository feedback, NotificationRepository repository,
            EventWinnerNotificationRepository eventWinners,
            AdminAccessPolicy administrators, PlatformTransactionManager manager,
            ApplicationEventPublisher events, Clock clock) {
        this.feedback = feedback;
        this.repository = repository;
        this.eventWinners = eventWinners;
        this.administrators = administrators;
        this.transactions = new TransactionTemplate(manager);
        // MySQL RR의 잠금 전 스냅샷이 직전 답변 커밋을 가리지 않도록 현재 읽기를 사용한다.
        // 수신 회원/의견 잠금·버전/유일키는 그대로 유지한다. 애플리케이션 전체 격리 수준은 바꾸지 않는다.
        this.transactions.setIsolationLevel(org.springframework.transaction.TransactionDefinition.ISOLATION_READ_COMMITTED);
        this.events = events;
        this.clock = clock;
    }

    public NotificationListResponse list(long userId, long before, int limit) {
        return Objects.requireNonNull(transactions.execute(transaction -> {
            member(userId);
            Instant now = now();
            // New notices belong on the first page; older cursor pages do not need backfill work.
            if (before == Long.MAX_VALUE) {
                eventWinners.connectPublished(userId, now);
            }
            var rows = repository.list(userId, before, limit + 1, now);
            var page = rows.stream().limit(limit).toList();
            var rewards = repository.rewards(page.stream().map(PersonalNotification::id)
                    .collect(java.util.stream.Collectors.toSet()));
            return new NotificationListResponse(page.stream().map(n -> new NotificationListResponse.Entry(
                    n.id().toString(), n.type(), n.title(), n.createdAt(), n.readAt(),
                    rewards.containsKey(n.id()) ? NotificationRewardResponse.of(rewards.get(n.id()), n.expiresAt()) : null,
                    n.eventWeekStartDate())).toList(),
                    rows.size() > limit ? page.getLast().id().toString() : null, repository.unread(userId, now));
        }));
    }

    public NotificationDetailResponse detail(long userId, long id, boolean read) {
        return Objects.requireNonNull(transactions.execute(transaction -> {
            member(userId);
            Instant now = now();
            var notification = repository.owned(userId, id, now).orElseThrow(NotificationService::notFound);
            if (notification.type().equals("EVENT_WINNER")) {
                LocalDate week = notification.eventWeekStartDate();
                if (week == null) { throw notFound(); }
                var awards = eventWinners.publishedAwards(userId, week, now);
                if (awards.isEmpty()) { throw notFound(); }
                var event = eventDetails(week, awards, now);
                if (read) { notification.read(now); }
                String body = event.allPrizesDelivered() ? "경품 지급이 완료되었습니다."
                        : "당첨 내역과 연락처 제출 상태를 확인해 주세요.";
                return new NotificationDetailResponse(notification.id().toString(), notification.type(),
                        notification.title(), notification.createdAt(), notification.readAt(), body,
                        null, null, null, null, event);
            }
            if (notification.type().equals("REWARD")) {
                var reward = repository.reward(id).orElseThrow(NotificationService::notFound);
                if (read) { notification.read(now); }
                return new NotificationDetailResponse(notification.id().toString(), notification.type(),
                        notification.title(), notification.createdAt(), notification.readAt(), reward.body(),
                        null, null, null, NotificationRewardResponse.of(reward, notification.expiresAt()));
            }
            var reply = repository.reply(notification.replyId()).orElseThrow(NotificationService::notFound);
            var message = available(reply.feedbackId(), false, now);
            if (!Objects.equals(message.userId(), userId)) { throw notFound(); }
            if (read) { notification.read(now); }
            return new NotificationDetailResponse(notification.id().toString(), notification.type(),
                    notification.title(), notification.createdAt(), notification.readAt(), reply.body(),
                    message.id().toString(), message.body(), message.status().name());
        }));
    }

    private static NotificationDetailResponse.EventWinnings eventDetails(LocalDate week,
            List<EventWinnerNotificationRepository.Award> awards, Instant now) {
        boolean allDelivered = awards.stream().allMatch(award -> award.deliveredAt() != null);
        boolean submitted = awards.getFirst().contactSubmitted();
        Instant contactExpiry = awards.getFirst().contactExpiresAt();
        String contactStatus = !submitted ? "NOT_SUBMITTED"
                : contactExpiry == null ? "EXPIRED" : "SUBMITTED";
        Instant deadline = awards.stream().map(EventWinnerNotificationRepository.Award::publishedAt)
                .max(Instant::compareTo).orElseThrow().plus(Duration.ofDays(7));
        boolean editable = !allDelivered && now.isBefore(deadline)
                && (!submitted || contactExpiry != null);
        return new NotificationDetailResponse.EventWinnings(week,
                awards.stream().map(award -> new NotificationDetailResponse.Award(award.winnerId(),
                        award.eventType(), award.place(), award.prizeName(),
                        award.deliveredAt() == null ? "PENDING" : "DELIVERED")).toList(),
                contactStatus, awards.getFirst().contactEdited(), deadline, allDelivered,
                editable && !submitted, editable);
    }

    public ReplyResult reply(long administrator, long receiptId, String operationId, String body,
            FeedbackMessage.Status status, long expectedVersion) {
        return Objects.requireNonNull(transactions.execute(transaction -> {
            administrator(administrator);
            Instant now = now();
            var first = available(receiptId, false, now);
            Long recipient = first.userId();
            if (recipient == null) { throw recipientUnavailable(); }
            // 탈퇴 처리와 동일하게 회원 → 의견 순서로 잠근다. 잠금 대기 후 의견을 다시 읽는다.
            if (!feedback.lockActiveMember(recipient)) { throw recipientUnavailable(); }
            var message = available(receiptId, true, now);
            if (!Objects.equals(message.userId(), recipient)) { throw recipientUnavailable(); }
            var existing = repository.reply(operationId);
            if (existing.isPresent()) {
                var prior = existing.orElseThrow();
                if (prior.feedbackId() != receiptId || !Objects.equals(prior.administratorId(), administrator)
                        || !prior.body().equals(body) || !prior.resultingStatus().equals(status.name())) {
                    throw new FeedbackException(409, "IDEMPOTENCY_CONFLICT", "같은 답변 요청의 내용이 다릅니다.");
                }
                var notification = repository.byReply(recipient, operationId).orElseThrow(NotificationService::notFound);
                return result(message, prior, notification);
            }
            version(message, expectedVersion);
            message.changeStatus(status);
            var reply = new FeedbackReply(operationId, receiptId, administrator, body, status, now);
            // 의견 보관 만료 후 답변에서 원문이 복구되지 않도록 같은 만료 경계를 사용한다.
            var notification = new PersonalNotification(recipient, operationId, now,
                    message.createdAt().plus(Duration.ofDays(90)));
            repository.save(reply, notification);
            events.publishEvent(new PersonalNotificationChanged(recipient, notification.id().toString()));
            return result(message, reply, notification);
        }));
    }

    public StatusResult status(long administrator, long receiptId,
            FeedbackMessage.Status status, long expectedVersion) {
        return Objects.requireNonNull(transactions.execute(transaction -> {
            administrator(administrator);
            var message = available(receiptId, true, now());
            version(message, expectedVersion);
            message.changeStatus(status);
            repository.flush();
            return new StatusResult(message.id().toString(), message.status().name(), message.version());
        }));
    }

    private FeedbackMessage available(long id, boolean lock, Instant now) {
        return feedback.find(id, lock).filter(f -> f.createdAt().plus(Duration.ofDays(90)).isAfter(now))
                .orElseThrow(NotificationService::notFound);
    }

    private void member(long id) {
        if (!feedback.lockActiveMember(id)) {
            throw new FeedbackException(401, "UNAUTHENTICATED", "로그인이 필요합니다.");
        }
    }

    private void administrator(long id) {
        if (!administrators.canOperate(id)) {
            throw new FeedbackException(403, "FEEDBACK_OPERATION_REQUIRED", "운영 관리자 권한이 필요합니다.");
        }
        if (!feedback.active(id)) { throw new FeedbackException(401, "UNAUTHENTICATED", "로그인이 필요합니다."); }
    }

    private static void version(FeedbackMessage message, long version) {
        if (message.version() != version) {
            throw new FeedbackException(409, "FEEDBACK_VERSION_CONFLICT", "의견이 변경됐습니다. 새로고침해주세요.");
        }
    }

    private static FeedbackException recipientUnavailable() {
        return new FeedbackException(409, "FEEDBACK_RECIPIENT_UNAVAILABLE", "탈퇴한 작성자에게 답변할 수 없습니다.");
    }

    private static FeedbackException notFound() {
        return new FeedbackException(404, "NOTIFICATION_NOT_FOUND", "의견 또는 알림을 찾을 수 없습니다.");
    }

    private ReplyResult result(FeedbackMessage message, FeedbackReply reply, PersonalNotification notification) {
        return new ReplyResult(reply.id(), message.id().toString(), notification.id().toString(),
                message.status().name(), message.version(), reply.createdAt());
    }

    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MILLIS); }

    public record ReplyResult(String replyId, String receiptId, String notificationId,
            String status, long version, Instant createdAt) { }
    public record StatusResult(String receiptId, String status, long version) { }
}
