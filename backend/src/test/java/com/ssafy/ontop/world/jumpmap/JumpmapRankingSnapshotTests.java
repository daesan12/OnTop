package com.ssafy.ontop.world.jumpmap;

import com.ssafy.ontop.world.jumpmap.JumpmapStore.Ranking;
import com.ssafy.ontop.world.jumpmap.JumpmapStore.RankingEntry;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class JumpmapRankingSnapshotTests {
    private final TestClock clock = new TestClock();

    @Test
    void 사용자들이_같은_상위50명과_각자의_순위를_공유한다() {
        var calls = new AtomicInteger();
        List<RankingEntry> entries = IntStream.rangeClosed(1, 60).mapToObj(this::entry).toList();
        var snapshot = new JumpmapRankingSnapshot(() -> {
            calls.incrementAndGet();
            return entries;
        }, clock);

        Ranking first = snapshot.ranking(1);
        Ranking last = snapshot.ranking(60);
        Ranking missing = snapshot.ranking(100);

        assertThat(calls).hasValue(1);
        assertThat(first.items()).hasSize(50).containsExactlyElementsOf(entries.subList(0, 50));
        assertThat(last.items()).isSameAs(first.items());
        assertThat(first.me()).isEqualTo(entries.getFirst());
        assertThat(last.me()).isEqualTo(entries.getLast());
        assertThat(missing.me()).isNull();
        assertThatThrownBy(() -> first.items().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void 이분_경계에서만_새기록을_반영하고_이전_응답은_보존한다() {
        var entries = new ArrayList<>(List.of(entry(1)));
        var calls = new AtomicInteger();
        var snapshot = new JumpmapRankingSnapshot(() -> {
            calls.incrementAndGet();
            return entries;
        }, clock);
        Ranking before = snapshot.ranking(2);
        entries.add(entry(2));

        clock.advanceMillis(119_999);
        assertThat(snapshot.ranking(2).me()).isNull();
        assertThat(calls).hasValue(1);
        clock.advanceMillis(1);

        assertThat(snapshot.ranking(2).me()).isEqualTo(entry(2));
        assertThat(calls).hasValue(2);
        assertThat(before.items()).containsExactly(entry(1));
    }

    @Test
    void 빈_랭킹도_이분간_공유한다() {
        var calls = new AtomicInteger();
        var snapshot = new JumpmapRankingSnapshot(() -> {
            calls.incrementAndGet();
            return List.of();
        }, clock);

        assertThat(snapshot.ranking(1).items()).isEmpty();
        assertThat(snapshot.ranking(2).me()).isNull();

        assertThat(calls).hasValue(1);
    }

    @Test
    void 집계실패를_캐시하지_않고_다음_요청에서_재시도한다() {
        var calls = new AtomicInteger();
        var snapshot = new JumpmapRankingSnapshot(() -> {
            if (calls.incrementAndGet() == 1) {
                throw new IllegalStateException("DB 조회 실패");
            }
            return List.of(entry(1));
        }, clock);

        assertThatThrownBy(() -> snapshot.ranking(1)).isInstanceOf(IllegalStateException.class);
        assertThat(snapshot.ranking(1).me()).isEqualTo(entry(1));

        assertThat(calls).hasValue(2);
    }

    @Test
    void 최초와_만료후_동시요청도_집계는_한번만_실행한다() throws Exception {
        var calls = new AtomicInteger();
        var snapshot = new JumpmapRankingSnapshot(() -> {
            calls.incrementAndGet();
            return List.of(entry(1));
        }, clock);

        concurrentRead(snapshot);
        assertThat(calls).hasValue(1);
        clock.advanceMillis(120_000);
        concurrentRead(snapshot);

        assertThat(calls).hasValue(2);
    }

    private void concurrentRead(JumpmapRankingSnapshot snapshot) throws Exception {
        var go = new CountDownLatch(1);
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var results = new ArrayList<Future<Ranking>>();
            for (int index = 0; index < 32; index++) {
                results.add(workers.submit(() -> {
                    if (!go.await(5, TimeUnit.SECONDS)) {
                        throw new IllegalStateException("동시 요청 시작 대기 초과");
                    }
                    return snapshot.ranking(1);
                }));
            }
            go.countDown();
            for (Future<Ranking> result : results) {
                assertThat(result.get(5, TimeUnit.SECONDS).me()).isEqualTo(entry(1));
            }
        }
    }

    private RankingEntry entry(int user) {
        return new RankingEntry(user, Integer.toString(user), "참가자" + user, 90_000L + user,
                "2026-11-01T00:00:00Z");
    }

    private static final class TestClock extends Clock {
        private Instant now = Instant.parse("2026-11-01T00:00:00Z");

        void advanceMillis(long millis) {
            now = now.plusMillis(millis);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return Clock.fixed(now, zone);
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
