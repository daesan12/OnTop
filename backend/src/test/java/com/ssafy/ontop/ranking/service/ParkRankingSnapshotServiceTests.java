package com.ssafy.ontop.ranking.service;

import com.ssafy.ontop.ranking.dto.ParkRankingResponse;
import com.ssafy.ontop.ranking.exception.RankingException;
import com.ssafy.ontop.ranking.repository.ParkBalanceRankingRepository;
import com.ssafy.ontop.ranking.repository.ParkBalanceRankingRepository.BalanceStanding;
import com.ssafy.ontop.ranking.repository.ParkBungeoppangChampionRepository;
import com.ssafy.ontop.ranking.repository.ParkBungeoppangChampionRepository.BungeoppangChampionStanding;
import com.ssafy.ontop.ranking.repository.ParkJumpmapChampionRepository;
import com.ssafy.ontop.ranking.repository.ParkJumpmapChampionRepository.JumpmapChampionStanding;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.scheduling.annotation.Scheduled;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class ParkRankingSnapshotServiceTests {
    private static final Instant STARTED_AT = Instant.parse("2026-11-02T00:00:00Z");
    private static final Instant UPDATED_AT = Instant.parse("2026-11-02T01:00:00Z");

    private final ParkBalanceRankingRepository balances = mock(ParkBalanceRankingRepository.class);
    private final ParkBungeoppangChampionRepository bungeoppang = mock(ParkBungeoppangChampionRepository.class);
    private final ParkJumpmapChampionRepository jumpmap = mock(ParkJumpmapChampionRepository.class);
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final Clock clock = Clock.fixed(UPDATED_AT, ZoneOffset.UTC);

    @Test
    void 최초_집계_전에는_503이고_성공_후에는_보유량과_두_우승자를_같은_시각에_공개한다() {
        ParkRankingSnapshotService service = service(STARTED_AT.toString());
        when(balances.findTopTen()).thenReturn(List.of(new BalanceStanding(1, 11, "보유자", 50)));
        when(bungeoppang.findChampion(STARTED_AT)).thenReturn(Optional.of(
                new BungeoppangChampionStanding(12, "붕어빵왕", 9_000, 12, UPDATED_AT)));
        when(jumpmap.findChampion(STARTED_AT)).thenReturn(Optional.of(
                new JumpmapChampionStanding(13, "점프왕", 8_500, UPDATED_AT)));

        assertThatThrownBy(service::current).isInstanceOfSatisfying(RankingException.class,
                error -> assertThat(error.error().code()).isEqualTo("RANKING_UNAVAILABLE"));
        service.refresh();
        ParkRankingResponse first = service.current();
        ParkRankingResponse again = service.current();

        assertThat(first).isSameAs(again);
        assertThat(first.updatedAt()).isEqualTo(UPDATED_AT);
        assertThat(first.balance()).extracting(ParkRankingResponse.BalanceItem::userId).containsExactly("11");
        assertThat(first.bungeoppangChampion().score()).isEqualTo(9_000);
        assertThat(first.bungeoppangChampion().maxCombo()).isEqualTo(12);
        assertThat(first.jumpmapChampion().finishMs()).isEqualTo(8_500);
        assertThat(meters.counter("ontop.ranking.park.refresh", "result", "success").count()).isEqualTo(1);
        verify(balances, times(1)).findTopTen();
        verify(bungeoppang, times(1)).findChampion(STARTED_AT);
        verify(jumpmap, times(1)).findChampion(STARTED_AT);
    }

    @Test
    void 미니게임_기록이_없어도_null_우승자로_정상_스냅샷을_공개한다() {
        ParkRankingSnapshotService service = service(STARTED_AT.toString());
        when(balances.findTopTen()).thenReturn(List.of());
        when(bungeoppang.findChampion(STARTED_AT)).thenReturn(Optional.empty());
        when(jumpmap.findChampion(STARTED_AT)).thenReturn(Optional.empty());

        service.refresh();

        assertThat(service.current().bungeoppangChampion()).isNull();
        assertThat(service.current().jumpmapChampion()).isNull();
        assertThat(meters.counter("ontop.ranking.park.refresh", "result", "success").count()).isEqualTo(1);
    }

    @Test
    void 일부_집계가_실패하면_마지막_정상_스냅샷을_유지한다() {
        ParkRankingSnapshotService service = service(STARTED_AT.toString());
        when(balances.findTopTen()).thenReturn(List.of(new BalanceStanding(1, 11, "보유자", 50)));
        when(bungeoppang.findChampion(STARTED_AT)).thenReturn(Optional.empty());
        when(jumpmap.findChampion(STARTED_AT)).thenReturn(Optional.empty())
                .thenThrow(new DataAccessResourceFailureException("test-db-down"));

        service.refresh();
        ParkRankingResponse previous = service.current();
        service.refresh();

        assertThat(service.current()).isSameAs(previous);
        assertThat(meters.counter("ontop.ranking.park.refresh", "result", "failure").count()).isEqualTo(1);
        assertThat(meters.timer("ontop.ranking.park.refresh.duration").count()).isEqualTo(2);
    }

    @Test
    void 예상하지_못한_매핑오류도_실패로_기록하고_다음_집계를_계속한다() {
        ParkRankingSnapshotService service = service(STARTED_AT.toString());
        when(balances.findTopTen()).thenReturn(List.of());
        when(bungeoppang.findChampion(STARTED_AT)).thenReturn(Optional.empty())
                .thenThrow(new IllegalStateException("mapping-failed")).thenReturn(Optional.empty());
        when(jumpmap.findChampion(STARTED_AT)).thenReturn(Optional.empty());

        service.refresh();
        ParkRankingResponse previous = service.current();
        service.refresh();
        assertThat(service.current()).isSameAs(previous);
        service.refresh();

        assertThat(service.current()).isNotSameAs(previous);
        assertThat(meters.counter("ontop.ranking.park.refresh", "result", "failure").count()).isEqualTo(1);
        assertThat(meters.counter("ontop.ranking.park.refresh", "result", "success").count()).isEqualTo(2);
    }

    @Test
    void 개발_시작시각이_없으면_기존_서비스는_기동하고_집계는_실행하지_않는다() {
        ParkRankingSnapshotService service = service("");

        service.refresh();

        assertThatThrownBy(service::current).isInstanceOf(RankingException.class);
        verifyNoInteractions(balances, bungeoppang, jumpmap);
    }

    @Test
    void 이전_집계가_끝나지_않았다면_중복_집계를_시작하지_않는다() throws Exception {
        ParkRankingSnapshotService service = service(STARTED_AT.toString());
        CountDownLatch entered = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        when(balances.findTopTen()).thenAnswer(invocation -> {
            entered.countDown();
            release.await(3, TimeUnit.SECONDS);
            return List.of();
        });
        when(bungeoppang.findChampion(STARTED_AT)).thenReturn(Optional.empty());
        when(jumpmap.findChampion(STARTED_AT)).thenReturn(Optional.empty());
        Thread first = new Thread(service::refresh);

        first.start();
        try {
            assertThat(entered.await(3, TimeUnit.SECONDS)).isTrue();
            service.refresh();
        } finally {
            release.countDown();
            first.join(3_000);
        }

        assertThat(first.isAlive()).isFalse();
        verify(balances, times(1)).findTopTen();
        assertThat(meters.counter("ontop.ranking.park.refresh", "result", "success").count()).isEqualTo(1);
    }

    @Test
    void 집계는_시작직후부터_일분_주기로_예약된다() throws Exception {
        Scheduled schedule = ParkRankingSnapshotService.class.getMethod("refresh").getAnnotation(Scheduled.class);

        assertThat(schedule.fixedRate()).isEqualTo(60_000);
        assertThat(schedule.initialDelay()).isZero();
    }

    private ParkRankingSnapshotService service(String startedAt) {
        return new ParkRankingSnapshotService(balances, bungeoppang, jumpmap, meters, startedAt, clock);
    }
}
