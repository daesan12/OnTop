package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.start.GameIdCodec;
import com.ssafy.ontop.game.start.GameRuntimeIdentity;
import com.ssafy.ontop.table.service.TableHub;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/** 전달된 outbox라도 현재 boot의 대기 중인 라운드에는 DB 종결 스냅샷을 다시 반영한다. */
@Component
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class GameTableRecovery {
    private static final Logger log = LoggerFactory.getLogger(GameTableRecovery.class);
    private final Optional<TableHub> tables;
    private final GameRuntimeIdentity identity;
    private final GameStoredRoundQuery results;
    private final GameResultNotifications notifications;

    public GameTableRecovery(Optional<TableHub> tables, GameRuntimeIdentity identity,
            GameStoredRoundQuery results, GameResultNotifications notifications) {
        this.tables = tables;
        this.identity = identity;
        this.results = results;
        this.notifications = notifications;
    }

    public int reconcile() {
        if (tables.isEmpty()) { return 0; }
        int recovered = 0;
        // Hub 잠금을 해제한 뒤 DB를 읽는다. 대기 라운드만 조회하여 과거 결과 전체를 재방송하지 않는다.
        for (var round : tables.get().pendingResultRounds().entrySet()) {
            try {
                var result = results.currentRound(GameIdCodec.parse(round.getValue()), identity);
                if (result.isPresent() && result.get().tableId().equals(round.getKey())) {
                    notifications.publish(result.get());
                    recovered++;
                }
            } catch (RuntimeException exception) {
                log.warn("대기 라운드 종결 복구 실패 exceptionType={}", exception.getClass().getName());
            }
        }
        return recovered;
    }
}
