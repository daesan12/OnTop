package com.ssafy.ontop.ranking.service;

import com.ssafy.ontop.ranking.dto.ParkRankingResponse;
import com.ssafy.ontop.ranking.exception.RankingException;
import com.ssafy.ontop.ranking.repository.ParkBalanceRankingRepository;
import com.ssafy.ontop.ranking.repository.ParkBalanceRankingRepository.BalanceStanding;
import com.ssafy.ontop.ranking.repository.ParkJumpRopeRankingRepository;
import com.ssafy.ontop.ranking.repository.ParkJumpRopeRankingRepository.JumpRopeRankingStanding;
import com.ssafy.ontop.ranking.repository.ParkMoleRankingRepository;
import com.ssafy.ontop.ranking.repository.ParkMoleRankingRepository.MoleRankingStanding;
import com.ssafy.ontop.ranking.repository.ParkSpeedMoleRankingRepository;
import com.ssafy.ontop.ranking.repository.ParkSpeedMoleRankingRepository.SpeedMoleRankingStanding;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
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
    private static final Instant JUMPMAP_STARTED_AT = Instant.parse("2026-11-16T07:00:00Z");
    private static final Instant UPDATED_AT = Instant.parse("2026-11-02T01:00:00Z");

    private final ParkBalanceRankingRepository balances = mock(ParkBalanceRankingRepository.class);
    private final ParkMoleRankingRepository mole = mock(ParkMoleRankingRepository.class);
    private final ParkSpeedMoleRankingRepository speedMole = mock(ParkSpeedMoleRankingRepository.class);
    private final ParkJumpRopeRankingRepository jumpRope = mock(ParkJumpRopeRankingRepository.class);
    private final SimpleMeterRegistry meters = new SimpleMeterRegistry();
    private final Clock clock = Clock.fixed(UPDATED_AT, ZoneOffset.UTC);

    @Test
    void 일곱_조회가_성공해야_교체하고_신규_열이_실패하면_직전_전체_집계를_보존한다() {
        var jumpmap = mock(com.ssafy.ontop.ranking.repository.ParkJumpmapRankingRepository.class);
        var bungeoppang = mock(com.ssafy.ontop.ranking.repository.ParkBungeoppangRankingRepository.class);
        var skewer = mock(com.ssafy.ontop.ranking.repository.ParkSkewerRankingRepository.class);
        var service = new ParkRankingSnapshotService(balances, mole, speedMole, jumpRope,
                jumpmap, bungeoppang, skewer, meters,
                mock(com.ssafy.ontop.admin.security.AdminAccessPolicy.class),
                STARTED_AT.toString(), JUMPMAP_STARTED_AT.toString());
        when(jumpmap.findTopTen(JUMPMAP_STARTED_AT)).thenReturn(List.of(
                new com.ssafy.ontop.ranking.repository.ParkJumpmapRankingRepository.JumpmapRankingStanding(1, 21, "완주왕", 60123, UPDATED_AT)));
        when(bungeoppang.findTopTen(STARTED_AT)).thenReturn(List.of(
                new com.ssafy.ontop.ranking.repository.ParkBungeoppangRankingRepository.BungeoppangRankingStanding(1, 22, "붕어왕", 900, 5, UPDATED_AT)));
        var lastQueryFinished = new java.util.concurrent.atomic.AtomicReference<Instant>();
        when(skewer.findTopTen(STARTED_AT)).thenAnswer(invocation -> {
            lastQueryFinished.set(Instant.now());
            return List.of(new com.ssafy.ontop.ranking.repository.ParkSkewerRankingRepository.Standing(1, "team", 21, "요리", 22, "서빙", 700, "VR", UPDATED_AT));
        });
        service.refresh();
        var first = service.current();
        assertThat(first.updatedAt()).isAfterOrEqualTo(lastQueryFinished.get());
        assertThat(first.jumpmap()).singleElement().satisfies(r -> assertThat(r.finishMs()).isEqualTo(60123));
        assertThat(first.bungeoppang()).singleElement().satisfies(r -> assertThat(r.score()).isEqualTo(900));
        assertThat(first.skewer()).singleElement().satisfies(r -> assertThat(r.playMode()).isEqualTo("VR"));
        assertThat(first.jumpRopeStartsAt()).isEqualTo(com.ssafy.ontop.game.jumprope.JumpRopeRankingWindow.START);
        verify(jumpmap).findTopTen(JUMPMAP_STARTED_AT);
        when(skewer.findTopTen(STARTED_AT)).thenThrow(new DataAccessResourceFailureException("격리 검증"));
        service.refresh();
        assertThat(service.current()).isSameAs(first);
    }

    @Test
    void 최초_집계_전에는_503이고_성공_후에는_네_랭킹을_같은_시각에_공개한다() {
        ParkRankingSnapshotService service = service(STARTED_AT.toString());
        when(balances.findTopTen()).thenReturn(List.of(new BalanceStanding(1, 11, "보유자", 50)));
        when(mole.findTopTen(STARTED_AT)).thenReturn(List.of(
                new MoleRankingStanding(1, 12, "두더지왕", 9_000, 12, UPDATED_AT)));
        when(speedMole.findTopTen(STARTED_AT)).thenReturn(List.of(
                new SpeedMoleRankingStanding(1, 13, "스피드왕", 85, 2, UPDATED_AT)));
        when(jumpRope.findTopTen(STARTED_AT)).thenReturn(List.of(
                new JumpRopeRankingStanding(1, 14, "줄넘기왕", 1_250, 1, UPDATED_AT)));

        assertThatThrownBy(service::current).isInstanceOfSatisfying(RankingException.class,
                error -> assertThat(error.error().code()).isEqualTo("RANKING_UNAVAILABLE"));
        service.refresh();
        ParkRankingResponse first = service.current();
        ParkRankingResponse again = service.current();

        assertThat(first).isSameAs(again);
        assertThat(first.updatedAt()).isEqualTo(UPDATED_AT);
        assertThat(first.balance()).extracting(ParkRankingResponse.BalanceItem::userId).containsExactly("11");
        assertThat(first.mole()).singleElement().satisfies(item -> {
            assertThat(item.rank()).isEqualTo(1);
            assertThat(item.score()).isEqualTo(9_000);
            assertThat(item.maxCombo()).isEqualTo(12);
        });
        assertThat(first.speedMole()).singleElement().satisfies(item -> {
            assertThat(item.rank()).isEqualTo(1);
            assertThat(item.score()).isEqualTo(85);
            assertThat(item.misses()).isEqualTo(2);
        });
        assertThat(first.jumpRope()).singleElement().satisfies(item -> {
            assertThat(item.rank()).isEqualTo(1);
            assertThat(item.userId()).isEqualTo("14");
            assertThat(item.score()).isEqualTo(1_250);
            assertThat(item.misses()).isEqualTo(1);
            assertThat(item.completedAt()).isEqualTo(UPDATED_AT);
            assertThat(item.gameMaster()).isFalse();
        });
        assertThat(meters.counter("ontop.ranking.park.refresh", "result", "success").count()).isEqualTo(1);
        verify(balances, times(1)).findTopTen();
        verify(mole, times(1)).findTopTen(STARTED_AT);
        verify(speedMole, times(1)).findTopTen(STARTED_AT);
        verify(jumpRope, times(1)).findTopTen(STARTED_AT);
    }

    @Test
    void 미니게임_기록이_없어도_빈_목록으로_정상_스냅샷을_공개한다() {
        ParkRankingSnapshotService service = service(STARTED_AT.toString());
        when(balances.findTopTen()).thenReturn(List.of());
        when(mole.findTopTen(STARTED_AT)).thenReturn(List.of());
        when(speedMole.findTopTen(STARTED_AT)).thenReturn(List.of());

        service.refresh();

        assertThat(service.current().mole()).isEmpty();
        assertThat(service.current().speedMole()).isEmpty();
        assertThat(service.current().jumpRope()).isEmpty();
        assertThat(meters.counter("ontop.ranking.park.refresh", "result", "success").count()).isEqualTo(1);
    }

    @Test
    void 관리자_회원은_공개_랭킹에_GM으로_표시한다() {
        ParkRankingSnapshotService service = new ParkRankingSnapshotService(
                balances, mole, speedMole, jumpRope, meters, STARTED_AT.toString(), clock, id -> id == 11);
        when(balances.findTopTen()).thenReturn(List.of(
                new BalanceStanding(1, 11, "관리자", 100),
                new BalanceStanding(2, 12, "일반회원", 90)));
        when(mole.findTopTen(STARTED_AT)).thenReturn(List.of());
        when(speedMole.findTopTen(STARTED_AT)).thenReturn(List.of());
        when(jumpRope.findTopTen(STARTED_AT)).thenReturn(List.of(
                new JumpRopeRankingStanding(1, 11, "관리자", 900, 0, UPDATED_AT),
                new JumpRopeRankingStanding(2, 12, "일반회원", 800, 0, UPDATED_AT)));

        service.refresh();

        assertThat(service.current().balance()).extracting(ParkRankingResponse.BalanceItem::gameMaster)
                .containsExactly(true, false);
        assertThat(service.current().jumpRope()).extracting(ParkRankingResponse.JumpRopeItem::gameMaster)
                .containsExactly(true, false);
    }

    @Test
    void 일부_집계가_실패하면_마지막_정상_스냅샷을_유지한다() {
        ParkRankingSnapshotService service = service(STARTED_AT.toString());
        when(balances.findTopTen()).thenReturn(List.of(new BalanceStanding(1, 11, "보유자", 50)));
        when(mole.findTopTen(STARTED_AT)).thenReturn(List.of());
        when(speedMole.findTopTen(STARTED_AT)).thenReturn(List.of())
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
        when(mole.findTopTen(STARTED_AT)).thenReturn(List.of())
                .thenThrow(new IllegalStateException("mapping-failed")).thenReturn(List.of());
        when(speedMole.findTopTen(STARTED_AT)).thenReturn(List.of());

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
        verifyNoInteractions(balances, mole, speedMole, jumpRope);
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
        when(mole.findTopTen(STARTED_AT)).thenReturn(List.of());
        when(speedMole.findTopTen(STARTED_AT)).thenReturn(List.of());
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
        return new ParkRankingSnapshotService(balances, mole, speedMole, jumpRope, meters, startedAt, clock);
    }
}
