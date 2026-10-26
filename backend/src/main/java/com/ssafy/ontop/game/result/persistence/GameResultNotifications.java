package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.StoredGameRoundEnded;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class GameResultNotifications {
    private static final Logger log = LoggerFactory.getLogger(GameResultNotifications.class);
    private final ApplicationEventPublisher events;
    private final GameResultOutbox outbox;

    public GameResultNotifications(GameResultOutbox outbox, ApplicationEventPublisher events) {
        this.outbox = outbox;
        this.events = events;
    }

    /** 적어도 한 번 전달한다. 정산 서비스나 Wallet에 접근하지 않는다. */
    public int dispatchOnce(int limit) {
        int delivered = 0;
        for (long id : outbox.due(limit)) {
            var candidate = outbox.claim(id);
            if (candidate.isEmpty()) {
                continue;
            }
            var claim = candidate.get();
            try {
                var payload = outbox.decode(claim);
                publish(payload);
                outbox.delivered(claim);
                delivered++;
            } catch (RuntimeException exception) {
                // ACK 실패도 재전달한다. 이미 전달된 결과의 version은 수신자가 중복 억제한다.
                try {
                    outbox.failed(claim, exception);
                } catch (RuntimeException persistenceFailure) {
                    // DB 장애 시 lease 만료 후 다른 전달기가 재시도한다.
                    log.warn("경기 알림 재시도 기록 실패 outboxId={} exceptionType={}", id,
                            persistenceFailure.getClass().getName());
                }
                log.warn("경기 알림 전달 실패 outboxId={} exceptionType={}", id, exception.getClass().getName());
            }
        }
        return delivered;
    }

    void publish(GameResultOutboxPayload payload) {
        events.publishEvent(new StoredGameRoundEnded(payload.tableId(), payload.results().getFirst().view()));
        RuntimeException failure = null;
        for (var result : payload.results()) {
            try {
                events.publishEvent(new GameResultCommitted(result.view()));
            } catch (RuntimeException exception) {
                failure = exception;
            }
        }
        if (failure != null) { throw failure; }
    }
}
