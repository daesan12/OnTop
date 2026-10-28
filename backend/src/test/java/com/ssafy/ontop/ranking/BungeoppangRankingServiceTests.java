package com.ssafy.ontop.ranking;

import com.ssafy.ontop.ranking.dto.BungeoppangRankingPage.Item;
import com.ssafy.ontop.ranking.exception.BungeoppangRankingException;
import com.ssafy.ontop.ranking.repository.BungeoppangRankingRepository;
import com.ssafy.ontop.ranking.service.BungeoppangRankingService;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class BungeoppangRankingServiceTests {
    private final BungeoppangRankingRepository repository = mock(BungeoppangRankingRepository.class);
    private final DefaultListableBeanFactory beans = new DefaultListableBeanFactory();
    private final TestClock clock = new TestClock();
    private final BungeoppangRankingService service;
    BungeoppangRankingServiceTests() {
        beans.registerSingleton("rankings", repository);
        service = new BungeoppangRankingService(beans.getBeanProvider(BungeoppangRankingRepository.class), clock, Duration.ofSeconds(2));
        when(repository.personalBests("v5")).thenReturn(List.of(item(1, "1", 12, 1), item(1, "2", 12, 1), item(3, "42", 8, 2)));
    }
    private Item item(long rank, String user, long made, long failed) {
        return new Item(rank, user, "별명" + user, made, failed, clock.instant());
    }

    @Test void 페이지중새기록이생겨도_원래스냅샷과_본인순위를_유지하고_새조회는갱신한다() {
        var first = service.find(42, "ALL_TIME", "v5", "1", null);
        when(repository.personalBests("v5")).thenReturn(List.of(item(1, "42", 20, 0)));
        var second = service.find(42, "ALL_TIME", "v5", "1", first.nextCursor());
        assertThat(second.snapshotId()).isEqualTo(first.snapshotId());
        assertThat(second.items()).extracting(Item::userId).containsExactly("2");
        assertThat(second.items().getFirst().rank()).isEqualTo(1);
        assertThat(second.me()).isEqualTo(first.me());
        assertThat(second.totalParticipants()).isEqualTo(3);
        var third = service.find(42, "ALL_TIME", "v5", "1", second.nextCursor());
        assertThat(third.items().getFirst().rank()).isEqualTo(3);
        assertThat(third.nextCursor()).isNull();
        var refreshed = service.find(42, "ALL_TIME", "v5", "1", null);
        assertThat(refreshed.snapshotId()).isNotEqualTo(first.snapshotId());
        assertThat(refreshed.me().rank()).isEqualTo(1);
        verify(repository, times(2)).personalBests("v5");
    }

    @Test void 커서변조_다른회원_버전_페이지크기_만료와서버재시작을_구분한다() {
        var first = service.find(42, "ALL_TIME", "v5", "1", null);
        String cursor = first.nextCursor();
        String tampered = cursor.substring(0, cursor.indexOf('.') + 1) + "AAAA";
        assertThatThrownBy(() -> service.find(42, "ALL_TIME", "v5", "1", tampered)).isInstanceOf(BungeoppangRankingException.class)
                .extracting(e -> ((BungeoppangRankingException)e).status()).isEqualTo(400);
        for (var operation : List.<Runnable>of(
                () -> service.find(43, "ALL_TIME", "v5", "1", cursor),
                () -> service.find(42, "ALL_TIME", "v4", "1", cursor),
                () -> service.find(42, "ALL_TIME", "v5", "2", cursor),
                () -> new BungeoppangRankingService(beans.getBeanProvider(BungeoppangRankingRepository.class), clock,
                        Duration.ofSeconds(2)).find(42, "ALL_TIME", "v5", "1", cursor))) {
            assertThatThrownBy(operation::run).isInstanceOf(BungeoppangRankingException.class)
                    .extracting(e -> ((BungeoppangRankingException)e).code()).isEqualTo("RANKING_SNAPSHOT_EXPIRED");
        }
        clock.time = clock.time.plusSeconds(2);
        assertThatThrownBy(() -> service.find(42, "ALL_TIME", "v5", "1", cursor)).isInstanceOf(BungeoppangRankingException.class)
                .extracting(e -> ((BungeoppangRankingException)e).code()).isEqualTo("RANKING_SNAPSHOT_EXPIRED");
    }

    @Test void 빈기록과_잘못된입력_저장소부재를_성공으로꾸미지않는다() {
        when(repository.personalBests("v4")).thenReturn(List.of());
        var empty = service.find(42, "ALL_TIME", "v4", "20", null);
        assertThat(empty.items()).isEmpty(); assertThat(empty.me()).isNull();
        assertThat(empty.totalParticipants()).isZero(); assertThat(empty.nextCursor()).isNull();
        assertThatThrownBy(() -> service.find(42, "WEEK", "v5", "20", null)).isInstanceOf(BungeoppangRankingException.class);
        assertThatThrownBy(() -> service.find(42, "ALL_TIME", "v2", "20", null)).isInstanceOf(BungeoppangRankingException.class);
        for (String limit : List.of("", "0", "21", "-1", "1.0")) {
            assertThatThrownBy(() -> service.find(42, "ALL_TIME", "v5", limit, null)).isInstanceOf(BungeoppangRankingException.class);
        }
        var unavailable = new BungeoppangRankingService(new DefaultListableBeanFactory()
                .getBeanProvider(BungeoppangRankingRepository.class), clock, Duration.ofSeconds(2));
        assertThatThrownBy(() -> unavailable.find(42, "ALL_TIME", "v5", "20", null))
                .isInstanceOf(BungeoppangRankingException.class).extracting(e -> ((BungeoppangRankingException)e).status()).isEqualTo(503);
    }
    static class TestClock extends Clock {
        Instant time = Instant.parse("2026-10-28T00:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return time; }
    }
}
