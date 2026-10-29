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
        when(repository.personalBests("v5", 120000)).thenReturn(List.of(item(1, "1", 12, 1), item(1, "2", 12, 1), item(3, "42", 8, 2)));
    }
    private Item item(long rank, String user, long made, long failed) {
        return new Item(rank, user, "별명" + user, made, failed, clock.instant());
    }

    @Test void 페이지중새기록이생겨도_원래스냅샷과_본인순위를_유지하고_새조회는갱신한다() {
        var first = service.find(42, "ALL_TIME", "v5", null, "1", null);
        when(repository.personalBests("v5", 120000)).thenReturn(List.of(item(1, "42", 20, 0)));
        var second = service.find(42, "ALL_TIME", "v5", null, "1", first.nextCursor());
        assertThat(second.snapshotId()).isEqualTo(first.snapshotId());
        assertThat(second.items()).extracting(Item::userId).containsExactly("2");
        assertThat(second.items().getFirst().rank()).isEqualTo(1);
        assertThat(second.me()).isEqualTo(first.me());
        assertThat(second.totalParticipants()).isEqualTo(3);
        var third = service.find(42, "ALL_TIME", "v5", null, "1", second.nextCursor());
        assertThat(third.items().getFirst().rank()).isEqualTo(3);
        assertThat(third.nextCursor()).isNull();
        var refreshed = service.find(42, "ALL_TIME", "v5", null, "1", null);
        assertThat(refreshed.snapshotId()).isNotEqualTo(first.snapshotId());
        assertThat(refreshed.me().rank()).isEqualTo(1);
        verify(repository, times(2)).personalBests("v5", 120000);
    }

    @Test void 커서변조_다른회원_버전_페이지크기_만료와서버재시작을_구분한다() {
        var first = service.find(42, "ALL_TIME", "v5", null, "1", null);
        String cursor = first.nextCursor();
        String tampered = cursor.substring(0, cursor.indexOf('.') + 1) + "AAAA";
        assertThatThrownBy(() -> service.find(42, "ALL_TIME", "v5", null, "1", tampered)).isInstanceOf(BungeoppangRankingException.class)
                .extracting(e -> ((BungeoppangRankingException)e).status()).isEqualTo(400);
        for (var operation : List.<Runnable>of(
                () -> service.find(43, "ALL_TIME", "v5", null, "1", cursor),
                () -> service.find(42, "ALL_TIME", "v4", null, "1", cursor),
                () -> service.find(42, "ALL_TIME", "v5", null, "2", cursor),
                () -> new BungeoppangRankingService(beans.getBeanProvider(BungeoppangRankingRepository.class), clock,
                        Duration.ofSeconds(2)).find(42, "ALL_TIME", "v5", null, "1", cursor))) {
            assertThatThrownBy(operation::run).isInstanceOf(BungeoppangRankingException.class)
                    .extracting(e -> ((BungeoppangRankingException)e).code()).isEqualTo("RANKING_SNAPSHOT_EXPIRED");
        }
        clock.time = clock.time.plusSeconds(2);
        assertThatThrownBy(() -> service.find(42, "ALL_TIME", "v5", null, "1", cursor)).isInstanceOf(BungeoppangRankingException.class)
                .extracting(e -> ((BungeoppangRankingException)e).code()).isEqualTo("RANKING_SNAPSHOT_EXPIRED");
    }

    @Test void 빈기록과_잘못된입력_저장소부재를_성공으로꾸미지않는다() {
        when(repository.personalBests("v4", null)).thenReturn(List.of());
        var empty = service.find(42, "ALL_TIME", "v4", null, "20", null);
        assertThat(empty.items()).isEmpty(); assertThat(empty.me()).isNull();
        assertThat(empty.totalParticipants()).isZero(); assertThat(empty.nextCursor()).isNull();
        assertThatThrownBy(() -> service.find(42, "WEEK", "v5", null, "20", null)).isInstanceOf(BungeoppangRankingException.class);
        assertThatThrownBy(() -> service.find(42, "ALL_TIME", "v2", null, "20", null)).isInstanceOf(BungeoppangRankingException.class);
        for (String limit : List.of("", "0", "21", "-1", "1.0")) {
            assertThatThrownBy(() -> service.find(42, "ALL_TIME", "v5", null, limit, null)).isInstanceOf(BungeoppangRankingException.class);
        }
        var unavailable = new BungeoppangRankingService(new DefaultListableBeanFactory()
                .getBeanProvider(BungeoppangRankingRepository.class), clock, Duration.ofSeconds(2));
        assertThatThrownBy(() -> unavailable.find(42, "ALL_TIME", "v5", null, "20", null))
                .isInstanceOf(BungeoppangRankingException.class).extracting(e -> ((BungeoppangRankingException)e).status()).isEqualTo(503);
    }
    @Test void v5는_플레이시간별로_조회하고_기본은_2분이며_v4는_시간없이_기존대로_조회한다() {
        when(repository.personalBests("v5", 180000)).thenReturn(List.of(item(1, "7", 30, 0)));
        when(repository.personalBests("v4", null)).thenReturn(List.of(item(1, "42", 9, 0)));

        var twoMinutes = service.find(42, "ALL_TIME", "v5", null, "20", null);
        var explicit = service.find(42, "ALL_TIME", "v5", "120000", "20", null);
        var threeMinutes = service.find(42, "ALL_TIME", "v5", "180000", "20", null);
        var v4 = service.find(42, "ALL_TIME", "v4", null, "20", null);

        assertThat(twoMinutes.durationMs()).isEqualTo(120000);
        assertThat(twoMinutes.items()).extracting(Item::userId).containsExactly("1", "2", "42");
        assertThat(explicit.items()).isEqualTo(twoMinutes.items());
        assertThat(threeMinutes.durationMs()).isEqualTo(180000);
        assertThat(threeMinutes.items()).extracting(Item::userId).containsExactly("7");
        assertThat(threeMinutes.me()).isNull();
        assertThat(v4.durationMs()).isNull();
        assertThat(v4.me().made()).isEqualTo(9);
        verify(repository, times(2)).personalBests("v5", 120000);
        verify(repository).personalBests("v5", 180000);
        verify(repository).personalBests("v4", null);
    }

    @Test void 허용하지않는_시간과_v4의_시간지정은_저장소조회전에_거절한다() {
        for (String duration : List.of("60000", "90000", "150000", "0", "", "abc", "0120000", "120000.0", "1200000000")) {
            assertThatThrownBy(() -> service.find(42, "ALL_TIME", "v5", duration, "20", null))
                    .isInstanceOf(BungeoppangRankingException.class).satisfies(e -> {
                        assertThat(((BungeoppangRankingException) e).status()).isEqualTo(400);
                        assertThat(((BungeoppangRankingException) e).code()).isEqualTo("RANKING_INVALID_DURATION");
                    });
        }
        for (String duration : List.of("120000", "180000", "60000")) {
            assertThatThrownBy(() -> service.find(42, "ALL_TIME", "v4", duration, "20", null))
                    .isInstanceOf(BungeoppangRankingException.class)
                    .extracting(e -> ((BungeoppangRankingException) e).code()).isEqualTo("RANKING_INVALID_DURATION");
        }
        verifyNoInteractions(repository);
    }

    @Test void 다른_플레이시간으로_커서를_재사용하면_스냅샷만료로_거절한다() {
        when(repository.personalBests("v5", 180000)).thenReturn(List.of(item(1, "7", 30, 0), item(2, "8", 20, 0)));
        String twoMinuteCursor = service.find(42, "ALL_TIME", "v5", null, "1", null).nextCursor();
        String threeMinuteCursor = service.find(42, "ALL_TIME", "v5", "180000", "1", null).nextCursor();

        for (var operation : List.<Runnable>of(
                () -> service.find(42, "ALL_TIME", "v5", "180000", "1", twoMinuteCursor),
                () -> service.find(42, "ALL_TIME", "v5", null, "1", threeMinuteCursor),
                () -> service.find(42, "ALL_TIME", "v5", "120000", "1", threeMinuteCursor))) {
            assertThatThrownBy(operation::run).isInstanceOf(BungeoppangRankingException.class)
                    .extracting(e -> ((BungeoppangRankingException) e).code()).isEqualTo("RANKING_SNAPSHOT_EXPIRED");
        }
        // The default and the explicit 120000 are the same board, so its cursor stays valid either way.
        assertThat(service.find(42, "ALL_TIME", "v5", "120000", "1", twoMinuteCursor).items())
                .extracting(Item::userId).containsExactly("2");
        assertThat(service.find(42, "ALL_TIME", "v5", "180000", "1", threeMinuteCursor).items())
                .extracting(Item::userId).containsExactly("8");
    }
    static class TestClock extends Clock {
        Instant time = Instant.parse("2026-10-28T00:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return time; }
    }
}
