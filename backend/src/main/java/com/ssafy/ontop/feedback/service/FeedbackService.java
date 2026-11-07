package com.ssafy.ontop.feedback.service;

import com.ssafy.ontop.feedback.config.FeedbackProperties;
import com.ssafy.ontop.feedback.domain.FeedbackMessage;
import com.ssafy.ontop.feedback.domain.FeedbackText;
import com.ssafy.ontop.feedback.dto.FeedbackListResponse;
import com.ssafy.ontop.feedback.dto.FeedbackReceiptResponse;
import com.ssafy.ontop.feedback.repository.FeedbackRepository;
import com.ssafy.ontop.table.service.TableHub;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

public class FeedbackService {
    private final FeedbackRepository repository;
    private final TransactionTemplate transactions;
    private final TableHub hub;
    private final FeedbackProperties properties;
    private final Clock clock;
    private com.ssafy.ontop.notification.repository.NotificationRepository notifications;

    public FeedbackService(FeedbackRepository repository, PlatformTransactionManager manager,
            TableHub hub, FeedbackProperties properties, Clock clock) {
        this.repository = repository;
        this.transactions = new TransactionTemplate(manager);
        this.hub = hub;
        this.properties = properties;
        this.clock = clock;
    }

    public void configureReplies(com.ssafy.ontop.notification.repository.NotificationRepository notifications) {
        this.notifications = notifications;
    }

    public FeedbackReceiptResponse submit(long userId, String key, String channelId, FeedbackText text) {
        return Objects.requireNonNull(transactions.execute(transaction -> {
            requireMember(userId);
            Instant now = clock.instant().truncatedTo(ChronoUnit.MILLIS);
            Instant cutoff = now.minus(Duration.ofDays(90));
            repository.deleteExpiredForMember(userId, cutoff);
            var existing = repository.request(userId, key, cutoff);
            // 타임아웃 재시도는 이동·작성 간격 검사보다 먼저 같은 영수증으로 복구한다.
            if (existing.isPresent()) {
                var message = existing.orElseThrow();
                if (!message.body().equals(text.value()) || !message.channelId().equals(channelId)) {
                    throw new FeedbackException(409, "IDEMPOTENCY_CONFLICT", "같은 요청 키의 내용이 다릅니다.");
                }
                return receipt(message);
            }
            hub.requireFeedbackAccess(userId, channelId, properties.x(), properties.y(), properties.z());
            repository.latest(userId).ifPresent(previous -> {
                Instant next = previous.plusSeconds(15);
                if (now.isBefore(next)) {
                    throw new FeedbackException(429, "FEEDBACK_COOLDOWN", "잠시 후 다시 작성해주세요.", next);
                }
            });
            var message = new FeedbackMessage(userId, key, channelId, text, now);
            repository.save(message);
            return receipt(message);
        }));
    }

    public FeedbackListResponse list(long userId, long beforeId, int limit) {
        if (!properties.administratorIds().contains(userId)) {
            throw new FeedbackException(403, "FEEDBACK_ADMIN_REQUIRED", "관리자만 조회할 수 있습니다.");
        }
        return Objects.requireNonNull(transactions.execute(transaction -> {
            requireMember(userId);
            var rows = repository.list(beforeId, limit + 1, clock.instant().minus(Duration.ofDays(90)));
            var page = rows.stream().limit(limit).toList();
            String next = rows.size() > limit ? page.getLast().id().toString() : null;
            var names = repository.nicknames(page.stream().map(FeedbackMessage::userId)
                    .filter(Objects::nonNull).collect(java.util.stream.Collectors.toSet()));
            var replies = notifications == null ? java.util.Map.<Long, com.ssafy.ontop.feedback.domain.FeedbackReply>of()
                    : notifications.latestReplies(page.stream().map(FeedbackMessage::id)
                            .collect(java.util.stream.Collectors.toSet()));
            return new FeedbackListResponse(page.stream().map(message -> new FeedbackListResponse.Entry(
                    message.id().toString(), message.userId(), message.channelId(), message.body(),
                    message.createdAt(), message.userId() == null ? null : names.get(message.userId()),
                    message.status().name(), message.version(), replies.containsKey(message.id())
                            ? new FeedbackListResponse.Reply(replies.get(message.id()).id(),
                                    replies.get(message.id()).body(), replies.get(message.id()).createdAt()) : null))
                    .toList(), next);
        }));
    }

    public int deleteExpired() {
        return Objects.requireNonNull(transactions.execute(transaction ->
                repository.deleteExpired(clock.instant().minus(Duration.ofDays(90)))));
    }

    private void requireMember(long userId) {
        // 탈퇴·인증 갱신과 같은 회원 잠금 순서를 사용해 탈퇴 직후 작성자 연결이 다시 생기는 것을 막는다.
        if (!repository.lockActiveMember(userId)) {
            throw new FeedbackException(401, "UNAUTHENTICATED", "활성 회원 로그인이 필요합니다.");
        }
    }

    private FeedbackReceiptResponse receipt(FeedbackMessage message) {
        return new FeedbackReceiptResponse(message.id().toString(), message.createdAt(),
                message.createdAt().plusSeconds(15));
    }
}
