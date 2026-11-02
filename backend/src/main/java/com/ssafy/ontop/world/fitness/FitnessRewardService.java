package com.ssafy.ontop.world.fitness;

import com.ssafy.ontop.world.service.WorldClock;
import com.ssafy.ontop.world.service.WorldFacilityService.Lease;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;
import java.util.function.LongSupplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

/** 시설 잠금에서는 시작/종료만 기록한다. DB 지급은 별도 스레드에서 처리해 공원 tick을 막지 않는다. */
@Service
public final class FitnessRewardService {
    private static final Logger log = LoggerFactory.getLogger(FitnessRewardService.class);
    private final Optional<FitnessRewardStore> store;
    private final WorldClock clock;
    private final LongSupplier nanos;
    private final Map<String, Visit> visits = new HashMap<>();
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor(
            Thread.ofPlatform().daemon(true).name("fitness-reward").factory());
    private volatile BiConsumer<String, String> sink = (user, receipt) -> { };

    private static final class Visit {
        private final String userId;
        private final long accountId;
        private final long started;
        private final long intervalNanos;
        private Long ended;
        private long granted;

        private Visit(String userId, long accountId, long started, long intervalNanos) {
            this.userId = userId;
            this.accountId = accountId;
            this.started = started;
            this.intervalNanos = intervalNanos;
        }
    }

    @Autowired
    public FitnessRewardService(Optional<FitnessRewardStore> store, WorldClock clock) {
        this(store, clock, System::nanoTime);
    }

    FitnessRewardService(Optional<FitnessRewardStore> store, WorldClock clock, LongSupplier nanos) {
        this.store = store;
        this.clock = clock;
        this.nanos = nanos;
    }

    public boolean enabled() {
        return store.isPresent();
    }

    public void sink(BiConsumer<String, String> sink) {
        this.sink = sink;
    }

    public synchronized void started(Long accountId, Lease lease) {
        if (!enabled() || accountId == null || accountId <= 0 || !lease.kind().equals("FITNESS")) {
            return;
        }
        visits.computeIfAbsent(lease.leaseId(), ignored -> new Visit(lease.userId(), accountId, nanos.getAsLong(),
                TimeUnit.MILLISECONDS.toNanos(clock.sample().cycleDurationMs() / 4)));
    }

    public synchronized void ended(Lease lease) {
        Visit visit = visits.get(lease.leaseId());
        if (visit != null && visit.ended == null) {
            visit.ended = nanos.getAsLong();
        }
    }

    @PostConstruct
    public void start() {
        if (enabled()) {
            worker.scheduleWithFixedDelay(this::settle, 1, 1, TimeUnit.SECONDS);
        }
    }

    // 테스트에서도 가짜 단조 시계로 정확한 경계·재시도·종료 경쟁을 확인한다.
    void settle() {
        List<String> leases;
        synchronized (this) {
            leases = List.copyOf(visits.keySet());
        }
        for (String leaseId : leases) {
            try {
                settleVisit(leaseId);
            } catch (RuntimeException exception) {
                // 성공 구간만 전진한다. 하차한 이용도 미지급 구간은 다음 주기에 같은 키로 재시도한다.
                log.warn("운동 보상 지급 재시도: leaseId={}", leaseId, exception);
            }
        }
    }

    private void settleVisit(String leaseId) {
        Visit visit;
        long due;
        synchronized (this) {
            visit = visits.get(leaseId);
            if (visit == null) {
                return;
            }
            due = Math.max(0, (visit.ended == null ? nanos.getAsLong() : visit.ended) - visit.started)
                    / visit.intervalNanos;
        }
        // 장애 복구 후 한 이용자가 작업 스레드를 독점하지 않도록 처리량을 제한한다.
        for (int batch = 0; visit.granted < due && batch < 32; batch++) {
            long interval = visit.granted + 1;
            store.orElseThrow().grant(visit.accountId, leaseId, interval,
                    Instant.ofEpochMilli(clock.sample().serverNow()));
            visit.granted = interval;
            sink.accept(visit.userId, "fitness:" + leaseId + ":" + interval);
        }
        synchronized (this) {
            if (visit.ended != null && visit.granted >= Math.max(0, visit.ended - visit.started) / visit.intervalNanos) {
                visits.remove(leaseId);
            }
        }
    }

    @PreDestroy
    public void close() {
        worker.shutdownNow();
    }
}
