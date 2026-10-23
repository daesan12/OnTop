package com.ssafy.ontop.behavior.service;

import com.ssafy.ontop.behavior.config.BehaviorLogProperties;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorRecord;
import com.ssafy.ontop.behavior.domain.DropReason;
import com.ssafy.ontop.behavior.domain.PositionSample;
import java.time.Duration;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.LongAdder;
import java.util.function.Supplier;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import static java.util.concurrent.TimeUnit.NANOSECONDS;

/**
 * 기록을 메모리 큐에 넣고 전용 스레드가 묶어서 저장한다. docs/behavior-log.md 5장 "유실과 큐 초과"를 구현한다.
 * 호출한 쪽(TableHub 잠금 안 등)은 큐에 넣기만 하고 기다리지 않는다. 저장이 밀리면 기록을 버리고 건수만 센다.
 */
public final class BufferedBehaviorLog implements BehaviorLog {

    static final double POSITION_SHED_RATIO = 0.8;
    static final List<Duration> DEFAULT_RETRY_DELAYS =
            List.of(Duration.ofSeconds(1), Duration.ofSeconds(2), Duration.ofSeconds(4));
    private static final long WARN_INTERVAL_NANOS = Duration.ofMinutes(1).toNanos();
    // 저장 간격이 길어도 종료 요청을 이 간격 안에 알아차린다.
    private static final long STOP_CHECK_NANOS = Duration.ofMillis(100).toNanos();
    private static final Logger log = LoggerFactory.getLogger(BufferedBehaviorLog.class);

    private final BehaviorStore store;
    private final BlockingQueue<BehaviorRecord> queue;
    private final int positionLimit;
    private final int batchSize;
    private final long flushIntervalNanos;
    private final long shutdownTimeoutNanos;
    private final List<Duration> retryDelays;
    private final Map<DropReason, LongAdder> dropped = new EnumMap<>(DropReason.class);
    private final LongAdder written = new LongAdder();
    private final AtomicLong nextWarnAt = new AtomicLong(System.nanoTime());
    private final AtomicBoolean closed = new AtomicBoolean();
    private final Thread writer;
    private volatile boolean stopping;
    private volatile long shutdownDeadline;

    public BufferedBehaviorLog(BehaviorStore store, BehaviorLogProperties properties) {
        this(store, properties, DEFAULT_RETRY_DELAYS);
    }

    BufferedBehaviorLog(BehaviorStore store, BehaviorLogProperties properties, List<Duration> retryDelays) {
        this.store = store;
        this.queue = new ArrayBlockingQueue<>(properties.queueCapacity());
        this.positionLimit = (int) Math.ceil(properties.queueCapacity() * POSITION_SHED_RATIO);
        this.batchSize = properties.batchSize();
        this.flushIntervalNanos = properties.flushInterval().toNanos();
        this.shutdownTimeoutNanos = properties.shutdownTimeout().toNanos();
        this.retryDelays = List.copyOf(retryDelays);
        for (DropReason reason : DropReason.values()) {
            dropped.put(reason, new LongAdder());
        }
        this.writer = Thread.ofPlatform().name("behavior-log-writer").daemon().unstarted(this::writeLoop);
    }

    public BufferedBehaviorLog start() {
        writer.start();
        return this;
    }

    @Override
    public void record(Supplier<BehaviorEvent> event) {
        enqueue(event, false);
    }

    @Override
    public void recordPosition(Supplier<PositionSample> sample) {
        enqueue(sample, true);
    }

    public long dropped(DropReason reason) {
        return dropped.get(reason).sum();
    }

    public long written() {
        return written.sum();
    }

    public int queued() {
        return queue.size();
    }

    /** 새 기록을 막고 남은 큐를 shutdownTimeout 안에서 저장한다. 시간 안에 못 쓴 것은 SHUTDOWN으로 센다. */
    @Override
    public void close() {
        if (!closed.compareAndSet(false, true)) {
            return;
        }
        shutdownDeadline = System.nanoTime() + shutdownTimeoutNanos;
        stopping = true;
        if (writer.getState() == Thread.State.NEW) {
            drop(DropReason.SHUTDOWN, queue.size());
            queue.clear();
            return;
        }
        try {
            writer.join(Duration.ofNanos(shutdownTimeoutNanos).plusSeconds(1));
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
        if (writer.isAlive()) {
            // 저장이 멈춘 경우 깨워서 남은 것을 SHUTDOWN으로 정리하게 한다.
            writer.interrupt();
        }
        log.info("행동 로그 종료: 저장 {}건, 종료 중 버림 {}건", written(), dropped(DropReason.SHUTDOWN));
    }

    private void enqueue(Supplier<? extends BehaviorRecord> supplier, boolean position) {
        if (closed.get()) {
            drop(DropReason.SHUTDOWN, 1);
            return;
        }
        if (position && queue.size() >= positionLimit) {
            drop(DropReason.POSITION_SHED, 1);
            warnDropped(DropReason.POSITION_SHED);
            return;
        }
        BehaviorRecord value;
        try {
            value = supplier.get();
        } catch (RuntimeException exception) {
            // 기록 실패가 게임·상점 처리를 실패시키지 않도록 여기서 끝낸다.
            drop(DropReason.INVALID, 1);
            warn("행동 로그 값을 만들지 못해 버렸습니다.", exception);
            return;
        }
        if (value == null) {
            drop(DropReason.INVALID, 1);
            return;
        }
        if (!queue.offer(value)) {
            drop(DropReason.QUEUE_FULL, 1);
            warnDropped(DropReason.QUEUE_FULL);
        }
    }

    private void writeLoop() {
        List<BehaviorRecord> batch = new ArrayList<>(batchSize);
        try {
            while (!stopping) {
                if (fill(batch)) {
                    write(batch);
                    batch.clear();
                }
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
        }
        drainOnShutdown(batch);
    }

    /** 첫 기록부터 저장 간격이 지나거나 묶음 크기가 찰 때까지 모은다. 모은 것이 없으면 false. */
    private boolean fill(List<BehaviorRecord> batch) throws InterruptedException {
        BehaviorRecord first = queue.poll(Math.min(flushIntervalNanos, STOP_CHECK_NANOS), NANOSECONDS);
        if (first == null) {
            return false;
        }
        batch.add(first);
        long deadline = System.nanoTime() + flushIntervalNanos;
        while (batch.size() < batchSize && !stopping) {
            queue.drainTo(batch, batchSize - batch.size());
            long remaining = deadline - System.nanoTime();
            if (batch.size() >= batchSize || remaining <= 0) {
                break;
            }
            BehaviorRecord next = queue.poll(Math.min(remaining, STOP_CHECK_NANOS), NANOSECONDS);
            if (next != null) {
                batch.add(next);
            }
        }
        return true;
    }

    private void drainOnShutdown(List<BehaviorRecord> batch) {
        while (!Thread.currentThread().isInterrupted() && System.nanoTime() - shutdownDeadline < 0) {
            queue.drainTo(batch, batchSize - batch.size());
            if (batch.isEmpty()) {
                return;
            }
            write(batch);
            batch.clear();
        }
        drop(DropReason.SHUTDOWN, batch.size() + queue.size());
        batch.clear();
        queue.clear();
    }

    private void write(List<BehaviorRecord> batch) {
        List<BehaviorEvent> events = new ArrayList<>();
        List<PositionSample> positions = new ArrayList<>();
        for (BehaviorRecord value : batch) {
            switch (value) {
                case BehaviorEvent event -> events.add(event);
                case PositionSample sample -> positions.add(sample);
            }
        }
        for (int attempt = 0; ; attempt++) {
            try {
                store.save(events, positions);
                written.add(batch.size());
                return;
            } catch (RuntimeException exception) {
                if (stopping || attempt >= retryDelays.size() || !pause(retryDelays.get(attempt))) {
                    drop(DropReason.WRITE_FAILED, batch.size());
                    warn("행동 로그 {}건을 저장하지 못해 버렸습니다.", batch.size(), exception);
                    return;
                }
            }
        }
    }

    private boolean pause(Duration delay) {
        try {
            Thread.sleep(delay);
            return true;
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            return false;
        }
    }

    private void drop(DropReason reason, long count) {
        if (count > 0) {
            dropped.get(reason).add(count);
        }
    }

    private void warnDropped(DropReason reason) {
        warn("행동 로그를 버렸습니다: reason={}, 누적={}건", reason, dropped(reason));
    }

    /** 건마다 로그를 남기면 로그가 다시 부하가 되므로 1분에 한 번만 남긴다. */
    private void warn(String message, Object... arguments) {
        long now = System.nanoTime();
        long next = nextWarnAt.get();
        if (now - next >= 0 && nextWarnAt.compareAndSet(next, now + WARN_INTERVAL_NANOS)) {
            log.warn(message, arguments);
        }
    }
}
