package com.ssafy.ontop.game.result.persistence;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration(proxyBeanMethods = false)
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class GameTerminalRetryConfiguration {
    private static final Logger log = LoggerFactory.getLogger(GameTerminalRetryConfiguration.class);

    /** 실행 중 경기의 유실 판정과 분리한다. DB 종결이 확정된 경기만 자동 재시도한다. */
    @Bean(destroyMethod = "shutdownNow")
    @ConditionalOnProperty(name = {"ontop.game-recovery.retry-enabled", "ontop.game-recovery.background-enabled"},
            havingValue = "true", matchIfMissing = true)
    ScheduledExecutorService gameTerminalRetryTimer(GameTerminalRetryService retries, GameTableRecovery rounds) {
        var cursor = new AtomicLong();
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("game-terminal-retry").factory());
        timer.scheduleWithFixedDelay(() -> {
            try {
                cursor.set(retries.retryPending(cursor.get(), 50).nextAfterId());
            } catch (RuntimeException exception) {
                log.warn("경기 재시도 조회 실패 exceptionType={}", exception.getClass().getName());
            }
            rounds.reconcile();
        }, 5, 5, TimeUnit.SECONDS);
        return timer;
    }

    @Bean(destroyMethod = "shutdownNow")
    @ConditionalOnProperty(name = "ontop.game-recovery.background-enabled", havingValue = "true", matchIfMissing = true)
    ScheduledExecutorService gameResultOutboxTimer(GameResultNotifications notifications) {
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(
                Thread.ofPlatform().daemon(true).name("game-result-outbox").factory());
        timer.scheduleWithFixedDelay(() -> {
            try {
                notifications.dispatchOnce(50);
            } catch (RuntimeException exception) {
                log.warn("경기 결과 outbox 조회 실패 exceptionType={}", exception.getClass().getName());
            }
        }, 500, 500, TimeUnit.MILLISECONDS);
        return timer;
    }
}
