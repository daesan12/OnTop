package com.ssafy.ontop.notification.service;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.feedback.service.FeedbackException;
import com.ssafy.ontop.notification.domain.NotificationReward;
import com.ssafy.ontop.notification.domain.PersonalNotification;
import com.ssafy.ontop.notification.repository.NotificationRewardRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Objects;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public class NotificationRewardService {
    private final NotificationRewardRepository repository;
    private final AdminAccessPolicy administrators;
    private final TransactionTemplate transactions;
    private final ApplicationEventPublisher events;
    private final Clock clock;

    public NotificationRewardService(NotificationRewardRepository repository, AdminAccessPolicy administrators,
            PlatformTransactionManager manager, ApplicationEventPublisher events, Clock clock) {
        this.repository = repository;
        this.administrators = administrators;
        this.events = events;
        this.clock = clock;
        transactions = new TransactionTemplate(manager);
        transactions.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    }

    public GrantResponse grant(long administrator, GrantRequest input) {
        return Objects.requireNonNull(transactions.execute(transaction -> {
            if (!administrators.canGrant(administrator)) {
                throw new FeedbackException(403, "REWARD_GRANT_REQUIRED", "재화 지급 권한이 필요합니다.");
            }
            if (!repository.member(administrator)) { throw unauthenticated(); }
            if (!repository.member(input.userId())) {
                throw new FeedbackException(409, "REWARD_RECIPIENT_UNAVAILABLE", "활성 회원에게만 보상을 보낼 수 있습니다.");
            }
            // 기존 상점·뽑기와 같은 회원 공유 잠금 → 지갑 배타 잠금 순서로 직렬화한다.
            repository.wallet(input.userId()).orElseThrow(NotificationRewardService::walletUnavailable);
            var previous = repository.operation(input.operationId());
            if (previous.isPresent()) {
                var reward = previous.orElseThrow();
                PersonalNotification notification;
                try { notification = repository.notification(reward.notificationId(), input.userId()); }
                catch (FeedbackException exception) {
                    throw new FeedbackException(409, "IDEMPOTENCY_CONFLICT", "같은 발급 요청의 수신자가 다릅니다.");
                }
                if (!Objects.equals(reward.administratorId(), administrator) || reward.kind() != input.kind()
                        || reward.amount() != input.amount() || !reward.body().equals(input.text())
                        || !notification.title().equals(input.title()) || !notification.expiresAt().equals(input.expiresAt())) {
                    throw new FeedbackException(409, "IDEMPOTENCY_CONFLICT", "같은 발급 요청의 내용이 다릅니다.");
                }
                return new GrantResponse(reward.id(), Long.toString(notification.id()), notification.createdAt());
            }
            Instant now = now();
            if (!input.expiresAt().isAfter(now)) {
                throw new FeedbackException(400, "INVALID_REQUEST", "수령 기한은 현재보다 미래여야 합니다.");
            }
            if (input.kind() == NotificationReward.Kind.GACHA_TICKET) { repository.requireTicketStorage(); }
            var notification = PersonalNotification.reward(input.userId(), input.title(), now, input.expiresAt());
            repository.notification(notification);
            repository.reward(new NotificationReward(input.operationId(), notification.id(), administrator,
                    input.kind(), input.amount(), input.text()));
            events.publishEvent(new PersonalNotificationChanged(input.userId(), notification.id().toString()));
            return new GrantResponse(input.operationId(), notification.id().toString(), now);
        }));
    }

    public ClaimResponse claim(long userId, long notificationId) {
        return Objects.requireNonNull(transactions.execute(transaction -> {
            if (!repository.member(userId)) { throw unauthenticated(); }
            var wallet = repository.wallet(userId).orElseThrow(NotificationRewardService::walletUnavailable);
            if (wallet.reserved() < 0 || wallet.balance() < wallet.reserved()) { throw walletUnavailable(); }
            var notification = repository.notification(notificationId, userId);
            var reward = repository.reward(notificationId);
            // 응답 유실 뒤의 재시도는 기한이 지났어도 이미 확정한 영수증을 돌려준다.
            if (reward.claimedAt() != null) { return receipt(reward); }
            Instant now = now();
            if (!notification.expiresAt().isAfter(now)) {
                throw new FeedbackException(410, "REWARD_EXPIRED", "수령 기한이 지난 보상입니다.");
            }
            try {
                if (reward.kind() == NotificationReward.Kind.COIN) {
                    wallet.creditAdminGrant(reward.amount(), now);
                    capacity(wallet.balance());
                    repository.coinLedger(wallet.id(), reward, now);
                    reward.claim(now, wallet.balance(), null);
                } else {
                    long tickets = repository.tickets(userId, reward.amount());
                    capacity(tickets);
                    reward.claim(now, null, tickets);
                }
            } catch (ArithmeticException exception) {
                throw new FeedbackException(409, "REWARD_CAPACITY_EXCEEDED", "보유 가능한 수량을 초과합니다.");
            }
            notification.read(now);
            repository.flush();
            events.publishEvent(new PersonalNotificationChanged(userId, notification.id().toString()));
            return receipt(reward);
        }));
    }

    private static ClaimResponse receipt(NotificationReward value) {
        return new ClaimResponse(Long.toString(value.notificationId()), value.kind(), value.amount(),
                value.claimedAt(), value.balanceAfter(), value.ticketsAfter());
    }

    private Instant now() { return clock.instant().truncatedTo(ChronoUnit.MILLIS); }
    private static void capacity(long value) {
        if (value > 9_007_199_254_740_991L) { throw new ArithmeticException("화면에 안전하게 표시할 수 있는 수량 초과"); }
    }
    private static FeedbackException unauthenticated() {
        return new FeedbackException(401, "UNAUTHENTICATED", "활성 회원 로그인이 필요합니다.");
    }
    private static FeedbackException walletUnavailable() {
        return new FeedbackException(409, "WALLET_NOT_READY", "회원 지갑 초기화가 필요합니다.");
    }

    public record GrantRequest(String operationId, long userId, NotificationReward.Kind kind, long amount,
            String title, String text, Instant expiresAt) { }
    public record GrantResponse(String operationId, String notificationId, Instant createdAt) { }
    public record ClaimResponse(String notificationId, NotificationReward.Kind kind, long amount,
            Instant claimedAt,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) Long balanceAfter,
            @io.swagger.v3.oas.annotations.media.Schema(nullable = true) Long ticketsAfter) { }
}
