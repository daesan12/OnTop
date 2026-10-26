package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameParticipantLeft;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.Clock;
import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** 엔진 스레드는 불변 이벤트만 인계한다. DB 수신 커밋을 ACK하고 미수신 이벤트를 보존한다. */
@Component
@Profile("db")
@ConditionalOnProperty(name = "ontop.game-start.enabled", havingValue = "true")
public class GameEventDelivery {
    private static final Logger log = LoggerFactory.getLogger(GameEventDelivery.class);
    private final GameFinishedPersistenceListener finishes;
    private final GameParticipantLeftPersistenceService departures;
    private final Clock clock;
    private final boolean background;
    private final Map<String, Pending> pending = new LinkedHashMap<>();
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon(true).name("game-event-delivery").factory());
    private boolean stopped;

    public GameEventDelivery(GameFinishedPersistenceListener finishes, GameParticipantLeftPersistenceService departures,
            @Qualifier("oauthClock") Clock clock,
            @Value("${ontop.game-recovery.background-enabled:true}") boolean background) {
        this.finishes = finishes;
        this.departures = departures;
        this.clock = clock;
        this.background = background;
    }

    @PostConstruct
    public void start() {
        if (background) {
            worker.scheduleWithFixedDelay(() -> drain(50), 0, 200, TimeUnit.MILLISECONDS);
        }
    }

    @EventListener
    @Order(Ordered.HIGHEST_PRECEDENCE)
    public void finished(GameFinished event) {
        submit(event);
    }

    @EventListener
    @Order(Ordered.HIGHEST_PRECEDENCE)
    public void left(GameParticipantLeft event) {
        submit(event);
    }

    public CompletionStage<Acknowledgement> submit(GameFinished event) {
        VerifiedGameFinish.validate(event);
        return retain(event.eventId(), event, VerifiedGameFinish.hash(event));
    }

    public CompletionStage<Acknowledgement> submit(GameParticipantLeft event) {
        return retain(event.eventId(), event, VerifiedGameDeparture.hash(event));
    }

    private synchronized CompletionStage<Acknowledgement> retain(String key, Object event, byte[] hash) {
        if (stopped) {
            throw new IllegalStateException("경기 이벤트 전달기가 종료되었습니다.");
        }
        var previous = pending.get(key);
        if (previous != null && !Arrays.equals(previous.hash, hash)) {
            throw new IllegalArgumentException("대기 중인 경기 이벤트와 다릅니다.");
        }
        var entry = pending.computeIfAbsent(key, ignored -> new Pending(key, event, hash, clock.instant()));
        return entry.ack.minimalCompletionStage();
    }

    /** 테스트·운영 작업자는 동일 경로를 사용한다. 진행 중인 항목은 다른 작업자가 선점하지 않는다. */
    public int drain(int limit) {
        if (limit < 1 || limit > 100) {
            throw new IllegalArgumentException("이벤트 처리 범위를 확인하세요.");
        }
        int accepted = 0;
        for (int index = 0; index < limit; index++) {
            Pending entry;
            synchronized (this) {
                entry = pending.values().stream().filter(item -> !item.running && !item.next.isAfter(clock.instant()))
                        .findFirst().orElse(null);
                if (entry == null || stopped) {
                    break;
                }
                entry.running = true;
            }
            try {
                Long gameId = null;
                if (entry.event instanceof GameFinished finish) {
                    gameId = finishes.accept(finish);
                } else {
                    departures.accept((GameParticipantLeft) entry.event);
                }
                synchronized (this) {
                    pending.remove(entry.key, entry);
                    entry.ack.complete(new Acknowledgement(entry.key, clock.instant()));
                }
                accepted++;
                if (gameId != null) {
                    try {
                        finishes.settle((GameFinished) entry.event, gameId);
                    } catch (RuntimeException exception) {
                        // 판정 ACK는 유지한다. 이미 DB에 보관된 PENDING은 종결 재시도 작업자가 처리한다.
                        log.warn("수신 완료 경기 정산 재시도 대기 gameId={} exceptionType={}", gameId,
                                exception.getClass().getName());
                    }
                }
            } catch (RuntimeException exception) {
                synchronized (this) {
                    if (exception instanceof IllegalArgumentException || exception instanceof IllegalStateException) {
                        pending.remove(entry.key, entry);
                        entry.ack.completeExceptionally(exception);
                    } else {
                        entry.failures = Math.min(30, entry.failures + 1);
                        entry.next = clock.instant().plusMillis(Math.min(30_000, 250L << Math.min(7, entry.failures)));
                        entry.running = false;
                    }
                }
                // 식별자·payload와 예외 메시지는 출력하지 않는다. FINISHED의 단계별 로그는 수신 서비스가 담당한다.
                log.warn("경기 이벤트 수신 미완료 eventType={} exceptionType={}",
                        entry.event.getClass().getSimpleName(), exception.getClass().getName());
            }
        }
        return accepted;
    }

    public synchronized int pendingCount() {
        return pending.size();
    }

    @PreDestroy
    public synchronized void stop() {
        stopped = true;
        worker.shutdownNow();
    }

    public record Acknowledgement(String eventId, Instant committedAt) { }

    private static final class Pending {
        private final String key;
        private final Object event;
        private final byte[] hash;
        private final CompletableFuture<Acknowledgement> ack = new CompletableFuture<>();
        private Instant next;
        private int failures;
        private boolean running;

        private Pending(String key, Object event, byte[] hash, Instant now) {
            this.key = key;
            this.event = event;
            this.hash = hash.clone();
            this.next = now;
        }
    }
}
