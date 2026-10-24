package com.ssafy.ontop.feedback.service;

import com.ssafy.ontop.auth.service.AuthenticationRevocations;
import com.ssafy.ontop.feedback.repository.FeedbackRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.transaction.TransactionException;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

public class FeedbackLifecycle {
    private static final Logger log = LoggerFactory.getLogger(FeedbackLifecycle.class);
    private final FeedbackRepository repository;
    private final FeedbackService service;

    public FeedbackLifecycle(FeedbackRepository repository, FeedbackService service) {
        this.repository = repository;
        this.service = service;
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void revoked(AuthenticationRevocations.Revoked event) {
        if (event.reason() == AuthenticationRevocations.Reason.MEMBER_DEACTIVATED) {
            // 탈퇴와 같은 트랜잭션으로 ID·중복 요청 키 연결을 제거한다. 본문은 보관 기한까지 유지한다.
            repository.detachAuthor(event.userId());
        }
    }

    @Scheduled(fixedDelay = 600000, initialDelay = 600000)
    public void removeExpired() {
        try {
            service.deleteExpired();
        } catch (DataAccessException | TransactionException exception) {
            // 본문이나 사용자 정보를 기록하지 않고 다음 실행에서 재시도한다.
            log.error("소리함 보관 기한 정리에 실패했습니다.", exception);
        }
    }
}
