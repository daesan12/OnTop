package com.ssafy.ontop.world.fitness;

import com.ssafy.ontop.world.service.WorldClock;
import com.ssafy.ontop.world.service.WorldFacilityService.Lease;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class FitnessRewardServiceTests {
    private final AtomicLong time = new AtomicLong();
    private final FitnessRewardStore store = mock(FitnessRewardStore.class);
    private final WorldClock clock = new WorldClock(Clock.fixed(Instant.EPOCH, ZoneOffset.UTC));
    private final FitnessRewardService service = new FitnessRewardService(Optional.of(store), clock, time::get);

    private static Lease lease(String id, String kind) {
        return new Lease(id, "channel", "101", "fitness", kind, 0, Instant.EPOCH, null, null, null, 0, 0, 0);
    }

    private void seconds(long seconds) {
        time.set(TimeUnit.SECONDS.toNanos(seconds));
    }

    @AfterEach
    void close() {
        service.close();
    }

    @Test
    void 게임_6시간인_현실_450초_경계마다_1냥을_한번만_지급한다() {
        service.started(101L, lease("visit", "FITNESS"));
        seconds(449);
        service.settle();
        verifyNoInteractions(store);

        seconds(450);
        service.settle();
        service.settle();
        seconds(900);
        service.settle();

        verify(store).grant(101L, "visit", 1, Instant.EPOCH);
        verify(store).grant(101L, "visit", 2, Instant.EPOCH);
        verify(store, times(2)).grant(anyLong(), anyString(), anyLong(), any());
    }

    @Test
    void 중복_시작은_탑승시간을_초기화하거나_보상을_늘리지_않는다() {
        Lease lease = lease("visit", "FITNESS");
        service.started(101L, lease);
        seconds(440);
        service.started(101L, lease);
        seconds(450);

        service.settle();

        verify(store).grant(101L, "visit", 1, Instant.EPOCH);
    }

    @Test
    void 하차나_이탈_후에는_시간이_늘지_않고_새탑승은_처음부터_계산한다() {
        Lease first = lease("first", "FITNESS");
        service.started(101L, first);
        seconds(449);
        service.ended(first);
        seconds(1000);
        service.started(101L, lease("second", "FITNESS"));
        service.settle();
        seconds(1449);
        service.settle();
        verifyNoInteractions(store);

        seconds(1450);
        service.settle();

        verify(store).grant(101L, "second", 1, Instant.EPOCH);
    }

    @Test
    void 지급_실패후_하차해도_완료한_구간만_같은키로_재시도한다() {
        List<String> receipts = new ArrayList<>();
        service.sink((user, receipt) -> receipts.add(user + ":" + receipt));
        doThrow(new IllegalStateException("test failure")).doNothing()
                .when(store).grant(anyLong(), anyString(), anyLong(), any());
        Lease lease = lease("visit", "FITNESS");
        service.started(101L, lease);
        seconds(450);
        service.settle();
        assertThat(receipts).isEmpty();
        service.ended(lease);
        seconds(900);

        service.settle();
        service.settle();

        verify(store, times(2)).grant(101L, "visit", 1, Instant.EPOCH);
        assertThat(receipts).containsExactly("101:fitness:visit:1");
    }

    @Test
    void 지급_중_하차가_다음_경계와_겹쳐도_완료구간을_잃지_않는다() {
        Lease lease = lease("visit", "FITNESS");
        service.started(101L, lease);
        seconds(450);
        doAnswer(invocation -> {
            seconds(900);
            service.ended(lease);
            return null;
        }).when(store).grant(101L, "visit", 1, Instant.EPOCH);

        service.settle();
        service.settle();

        verify(store).grant(101L, "visit", 2, Instant.EPOCH);
    }

    @Test
    void 벤치와_망원경과_비회원은_보상을_받지_않는다() {
        service.started(101L, lease("bench", "BENCH"));
        service.started(101L, lease("telescope", "TELESCOPE"));
        service.started(null, lease("guest", "FITNESS"));
        seconds(900);

        service.settle();

        verifyNoInteractions(store);
    }

    @Test
    void DB없는_실행에서는_비활성이다() {
        var disabled = new FitnessRewardService(Optional.empty(), clock, time::get);
        disabled.started(101L, lease("visit", "FITNESS"));
        seconds(900);

        disabled.settle();

        assertThat(disabled.enabled()).isFalse();
        disabled.close();
    }
}
