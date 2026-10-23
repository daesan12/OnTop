package com.ssafy.ontop.behavior.service;

import com.ssafy.ontop.behavior.config.BehaviorLogProperties;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.DropReason;
import com.ssafy.ontop.behavior.domain.PositionSample;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.awaitility.Awaitility.await;

class BufferedBehaviorLogTests {

    private static final Instant AT = Instant.parse("2026-10-23T00:00:00Z");
    private static final List<Duration> NO_DELAY = List.of(Duration.ZERO, Duration.ZERO, Duration.ZERO);

    private final RecordingStore store = new RecordingStore();
    private BufferedBehaviorLog log;

    @AfterEach
    void close() {
        store.release();
        if (log != null) {
            log.close();
        }
    }

    @Test
    void 묶음_크기가_차면_한_번에_저장한다() {
        log = new BufferedBehaviorLog(store, properties(100, 3, Duration.ofSeconds(10)), NO_DELAY).start();

        for (int i = 0; i < 3; i++) {
            log.record(() -> event(BehaviorEventType.CHAT_SENT));
        }

        await().atMost(Duration.ofSeconds(5)).until(() -> log.written() == 3);
        assertThat(store.batches).singleElement().satisfies(batch -> assertThat(batch.events()).hasSize(3));
    }

    @Test
    void 묶음이_덜_차도_저장_간격이_지나면_저장한다() {
        log = new BufferedBehaviorLog(store, properties(100, 50, Duration.ofMillis(100)), NO_DELAY).start();

        log.record(() -> event(BehaviorEventType.WS_CONNECTED));
        log.recordPosition(BufferedBehaviorLogTests::position);

        await().atMost(Duration.ofSeconds(5)).until(() -> log.written() == 2);
        assertThat(store.batches).singleElement().satisfies(batch -> {
            assertThat(batch.events()).hasSize(1);
            assertThat(batch.positions()).hasSize(1);
        });
    }

    @Test
    void 큐가_가득_차면_기다리지_않고_버린_건수만_센다() throws InterruptedException {
        store.block();
        log = new BufferedBehaviorLog(store, properties(5, 1, Duration.ofMillis(50)), NO_DELAY).start();
        log.record(() -> event(BehaviorEventType.CHAT_SENT));
        assertThat(store.entered.await(5, TimeUnit.SECONDS)).isTrue();

        long started = System.nanoTime();
        for (int i = 0; i < 10; i++) {
            log.record(() -> event(BehaviorEventType.CHAT_SENT));
        }

        assertThat(Duration.ofNanos(System.nanoTime() - started)).isLessThan(Duration.ofSeconds(1));
        assertThat(log.queued()).isEqualTo(5);
        assertThat(log.dropped(DropReason.QUEUE_FULL)).isEqualTo(5);
    }

    @Test
    void 큐가_80퍼센트_이상_차면_위치는_버리고_다른_이벤트는_받는다() throws InterruptedException {
        store.block();
        log = new BufferedBehaviorLog(store, properties(10, 1, Duration.ofMillis(50)), NO_DELAY).start();
        log.record(() -> event(BehaviorEventType.CHAT_SENT));
        assertThat(store.entered.await(5, TimeUnit.SECONDS)).isTrue();
        for (int i = 0; i < 8; i++) {
            log.record(() -> event(BehaviorEventType.CHAT_SENT));
        }
        AtomicInteger built = new AtomicInteger();

        log.recordPosition(() -> {
            built.incrementAndGet();
            return position();
        });
        log.record(() -> event(BehaviorEventType.GAME_STARTED));

        assertThat(log.dropped(DropReason.POSITION_SHED)).isEqualTo(1);
        assertThat(built).hasValue(0);
        assertThat(log.queued()).isEqualTo(9);
    }

    @Test
    void 기록값을_만들다_오류가_나도_호출한_쪽으로_던지지_않는다() {
        log = new BufferedBehaviorLog(store, properties(10, 1, Duration.ofMillis(50)), NO_DELAY).start();

        assertThatCode(() -> log.record(() -> {
            throw new IllegalStateException("잘못된 값");
        })).doesNotThrowAnyException();

        assertThat(log.dropped(DropReason.INVALID)).isEqualTo(1);
    }

    @Test
    void 저장이_실패하면_재시도하고_성공하면_한_번만_남긴다() {
        store.failNext(2);
        log = new BufferedBehaviorLog(store, properties(10, 1, Duration.ofMillis(50)), NO_DELAY).start();

        log.record(() -> event(BehaviorEventType.SHOP_PURCHASED));

        await().atMost(Duration.ofSeconds(5)).until(() -> log.written() == 1);
        assertThat(store.attempts).hasValue(3);
        assertThat(store.batches).hasSize(1);
        assertThat(log.dropped(DropReason.WRITE_FAILED)).isZero();
    }

    @Test
    void 재시도를_모두_실패하면_묶음을_버리고_다음_기록은_계속_저장한다() {
        store.failNext(4);
        log = new BufferedBehaviorLog(store, properties(10, 1, Duration.ofMillis(50)), NO_DELAY).start();

        log.record(() -> event(BehaviorEventType.CHAT_SENT));
        await().atMost(Duration.ofSeconds(5)).until(() -> log.dropped(DropReason.WRITE_FAILED) == 1);
        log.record(() -> event(BehaviorEventType.EMOTE_SENT));

        await().atMost(Duration.ofSeconds(5)).until(() -> log.written() == 1);
        assertThat(store.attempts).hasValue(5);
    }

    @Test
    void 종료하면_남은_큐를_저장하고_이후_기록은_종료로_센다() {
        log = new BufferedBehaviorLog(store, properties(100, 50, Duration.ofSeconds(10)), NO_DELAY).start();
        for (int i = 0; i < 5; i++) {
            log.record(() -> event(BehaviorEventType.CHAT_SENT));
        }

        log.close();
        log.record(() -> event(BehaviorEventType.CHAT_SENT));

        assertThat(log.written()).isEqualTo(5);
        assertThat(log.dropped(DropReason.SHUTDOWN)).isEqualTo(1);
    }

    @Test
    void 종료_대기_시간_안에_저장하지_못한_기록은_종료로_센다() throws InterruptedException {
        store.block();
        log = new BufferedBehaviorLog(store,
                new BehaviorLogProperties(true, 10, 1, Duration.ofMillis(50), Duration.ofMillis(200)), NO_DELAY)
                .start();
        log.record(() -> event(BehaviorEventType.CHAT_SENT));
        assertThat(store.entered.await(5, TimeUnit.SECONDS)).isTrue();
        for (int i = 0; i < 3; i++) {
            log.record(() -> event(BehaviorEventType.CHAT_SENT));
        }

        log.close();
        store.release();

        await().atMost(Duration.ofSeconds(5)).until(() -> log.dropped(DropReason.SHUTDOWN) == 3);
        assertThat(log.queued()).isZero();
    }

    private static BehaviorLogProperties properties(int capacity, int batchSize, Duration flushInterval) {
        return new BehaviorLogProperties(true, capacity, batchSize, flushInterval, Duration.ofSeconds(5));
    }

    private static BehaviorEvent event(BehaviorEventType type) {
        return BehaviorEvent.builder(type, AT).userId(101L).build();
    }

    private static PositionSample position() {
        return new PositionSample(101L, "channel-1", AT, 1, 0.84, 2, true, false, false, "map");
    }

    private record Batch(List<BehaviorEvent> events, List<PositionSample> positions) {
    }

    private static final class RecordingStore implements BehaviorStore {
        private final List<Batch> batches = new CopyOnWriteArrayList<>();
        private final AtomicInteger attempts = new AtomicInteger();
        private final AtomicInteger failures = new AtomicInteger();
        private final CountDownLatch entered = new CountDownLatch(1);
        private final CountDownLatch released = new CountDownLatch(1);
        private volatile boolean blocking;

        void block() {
            blocking = true;
        }

        void release() {
            released.countDown();
        }

        void failNext(int count) {
            failures.set(count);
        }

        @Override
        public void save(List<BehaviorEvent> events, List<PositionSample> positions) {
            attempts.incrementAndGet();
            entered.countDown();
            if (blocking) {
                try {
                    released.await(10, TimeUnit.SECONDS);
                } catch (InterruptedException exception) {
                    Thread.currentThread().interrupt();
                }
            }
            if (failures.getAndDecrement() > 0) {
                throw new IllegalStateException("DB 연결 실패");
            }
            batches.add(new Batch(List.copyOf(events), List.copyOf(positions)));
        }
    }
}
