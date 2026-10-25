package com.ssafy.ontop.behavior.config;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** 기본값은 docs/behavior-log.md 5장 "유실과 큐 초과"를 따른다. */
@ConfigurationProperties("ontop.behavior-log")
public record BehaviorLogProperties(boolean enabled, Integer queueCapacity, Integer batchSize,
        Duration flushInterval, Duration shutdownTimeout) {

    private static final int DEFAULT_QUEUE_CAPACITY = 20_000;
    private static final int DEFAULT_BATCH_SIZE = 500;
    private static final Duration DEFAULT_FLUSH_INTERVAL = Duration.ofSeconds(1);
    private static final Duration DEFAULT_SHUTDOWN_TIMEOUT = Duration.ofSeconds(5);

    public BehaviorLogProperties {
        queueCapacity = queueCapacity == null ? DEFAULT_QUEUE_CAPACITY : queueCapacity;
        batchSize = batchSize == null ? DEFAULT_BATCH_SIZE : batchSize;
        flushInterval = flushInterval == null ? DEFAULT_FLUSH_INTERVAL : flushInterval;
        shutdownTimeout = shutdownTimeout == null ? DEFAULT_SHUTDOWN_TIMEOUT : shutdownTimeout;
        if (queueCapacity < 1 || batchSize < 1 || batchSize > queueCapacity) {
            throw new IllegalArgumentException("행동 로그 큐 크기와 묶음 크기를 확인하세요.");
        }
        if (flushInterval.isNegative() || flushInterval.isZero()
                || shutdownTimeout.isNegative() || shutdownTimeout.isZero()) {
            throw new IllegalArgumentException("행동 로그 저장 간격과 종료 대기 시간은 0보다 커야 합니다.");
        }
    }
}
