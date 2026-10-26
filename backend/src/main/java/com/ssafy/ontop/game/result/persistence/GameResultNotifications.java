package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameResultCommitted;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

@Component
class GameResultNotifications {
    private static final Logger log = LoggerFactory.getLogger(GameResultNotifications.class);
    private final ApplicationEventPublisher events;

    GameResultNotifications(ApplicationEventPublisher events) { this.events = events; }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void committed(GameResultsReady event) {
        for (var result : event.results()) {
            try { events.publishEvent(new GameResultCommitted(result)); }
            catch (RuntimeException exception) {
                // 알림 I/O 실패를 이미 커밋된 정산 실패로 보고하거나 재지급하지 않는다.
                log.warn("경기 결과 커밋 알림 실패 category={}", exception.getClass().getSimpleName());
            }
        }
    }
}
