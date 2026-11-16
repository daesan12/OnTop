package com.ssafy.ontop.raffle.service;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.admin.security.AdminAccessProperties;
import com.ssafy.ontop.raffle.RaffleException;
import com.ssafy.ontop.raffle.domain.RaffleDrawSelector;
import com.ssafy.ontop.raffle.domain.RaffleDrawSelector.Ticket;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository.EventRound;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository.LiveEventMembership;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository.ReviewDraw;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository.ReviewPick;
import com.ssafy.ontop.raffle.repository.RaffleRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 공개 추첨 행사 회차(11/16)·포함 회차(11/09)의 확정 잠금과 행사 완료용 내부 확정 경로를 검증한다. */
class RaffleDrawingServiceTests {
    private static final LocalDate EVENT_WEEK = LocalDate.of(2026, 11, 16);
    private static final LocalDate SOURCE_WEEK = LocalDate.of(2026, 11, 9);
    private static final Instant STARTS = Instant.parse("2026-11-16T00:00:00Z");
    private static final Instant ENDS = Instant.parse("2026-11-18T15:00:00Z");
    private static final Instant NOW = Instant.parse("2026-11-19T05:00:00Z");
    private static final long OPERATOR = 1;
    private static final long VIEWER = 2;
    private static final long MEMBER = 3;
    private static final long SOURCE_MEMBER = 4;
    private static final long EVENT_ROUND = 10;
    private static final long RAFFLE_ROUND = 20;
    private static final long DRAW = 30;
    private static final long LIVE_EVENT = 70;
    private static final Ticket TICKET = new Ticket(40, MEMBER, 1234);
    /** 11/09 회차 응모권. 11/16 응모권과 응모 번호가 같아도 다른 응모권이다. */
    private static final Ticket SOURCE_TICKET = new Ticket(41, SOURCE_MEMBER, 1234);
    private static final LiveEventMembership COMPLETE = new LiveEventMembership(LIVE_EVENT, EVENT_WEEK, 0, 0);
    private static final LiveEventMembership UNLINKED = new LiveEventMembership(LIVE_EVENT, EVENT_WEEK, 1, 0);

    private RaffleRepository raffles;
    private RaffleDrawingRepository drawings;
    private RaffleDrawingService service;

    @BeforeEach
    void setUp() {
        raffles = mock(RaffleRepository.class);
        drawings = mock(RaffleDrawingRepository.class);
        when(drawings.liveEventMembership(any())).thenReturn(Optional.empty());
        var administrators = new AdminAccessPolicy(new AdminAccessProperties(
                Set.of(OPERATOR, VIEWER), Set.of(), Set.of(OPERATOR)));
        service = new RaffleDrawingService(raffles, drawings, administrators,
                new RaffleDrawSelector(bound -> 0), transactions(), Clock.fixed(NOW, ZoneOffset.UTC),
                LocalDate.of(2026, 11, 2));
    }

    @Test
    void 행사_회차의_관리자_직접_확정은_거부하고_아무것도_기록하지_않는다() {
        reviewReady(COMPLETE, List.of(TICKET, SOURCE_TICKET));

        assertThatThrownBy(() -> service.confirmReview(EVENT_WEEK, OPERATOR, DRAW))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> {
                    assertThat(((RaffleException) error).status()).isEqualTo(409);
                    assertThat(((RaffleException) error).code()).isEqualTo("RAFFLE_LIVE_EVENT_LOCKED");
                });
        verify(drawings, never()).round(any(), anyBoolean());
        verify(drawings, never()).insertWinner(anyLong(), anyLong(), any(), any());
        verify(drawings, never()).finalizeRound(anyLong(), any(), any());
    }

    @Test
    void 행사에_포함된_11월9일_회차도_관리자_직접_확정을_거부한다() {
        when(drawings.liveEventMembership(SOURCE_WEEK)).thenReturn(Optional.of(COMPLETE));

        assertThatThrownBy(() -> service.confirmReview(SOURCE_WEEK, OPERATOR, DRAW))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_LOCKED"));
        verify(drawings, never()).finalizeRound(anyLong(), any(), any());
    }

    @Test
    void 행사에_포함된_11월9일_회차는_따로_사전추첨하거나_재추첨하지_않는다() {
        when(drawings.liveEventMembership(SOURCE_WEEK)).thenReturn(Optional.of(COMPLETE));

        assertThatThrownBy(() -> service.createReview(SOURCE_WEEK, OPERATOR))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_SOURCE_ROUND"));
        assertThatThrownBy(() -> service.reroll(SOURCE_WEEK, OPERATOR, DRAW, "재추첨"))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_SOURCE_ROUND"));
        // 회차·행사 회차·추첨 기록을 만들기 전에 거부한다.
        verify(raffles, never()).lockRound(any());
        verify(drawings, never()).ensureEventRound(anyLong(), any(), any(), any(), any());
        verify(drawings, never()).insertReview(anyLong(), anyLong(), anyInt(), anyLong(), any(),
                anyInt(), anyInt(), anyInt(), any());
    }

    @Test
    void 행사_대상이_아닌_회차의_직접_확정은_기존대로_자기_회차_응모권으로_확정한다() {
        reviewReady(null, List.of(TICKET));

        var result = service.confirmReview(EVENT_WEEK, OPERATOR, DRAW);

        assertThat(result.finalized()).isTrue();
        verify(drawings).purchasedTickets(RAFFLE_ROUND, STARTS, ENDS);
        verify(drawings, never()).liveEventTickets(anyLong());
        verify(drawings).finalizeRound(eq(EVENT_ROUND), any(), eq(OPERATOR));
    }

    @Test
    void 행사_완료_내부_경로는_연결된_두_회차_응모권을_기준으로_확정한다() {
        reviewReady(COMPLETE, List.of(TICKET, SOURCE_TICKET));

        var result = service.confirmLiveEventReview(EVENT_WEEK, OPERATOR, DRAW);

        assertThat(result.finalized()).isTrue();
        verify(drawings).liveEventTickets(LIVE_EVENT);
        verify(drawings, never()).purchasedTickets(anyLong(), any(), any());
        verify(drawings).insertWinner(eq(EVENT_ROUND), eq(50L), eq(SOURCE_TICKET), any());
        verify(drawings).finalizeRound(eq(EVENT_ROUND), any(), eq(OPERATOR));
    }

    @Test
    void 행사_완료_내부_경로는_대상이_아닌_회차와_포함_회차를_확정하지_않는다() {
        reviewReady(null, List.of(TICKET));
        assertThatThrownBy(() -> service.confirmLiveEventReview(EVENT_WEEK, OPERATOR, DRAW))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_NOT_REGISTERED"));

        when(drawings.liveEventMembership(SOURCE_WEEK)).thenReturn(Optional.of(COMPLETE));
        assertThatThrownBy(() -> service.confirmLiveEventReview(SOURCE_WEEK, OPERATOR, DRAW))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_SOURCE_ROUND"));
        verify(drawings, never()).finalizeRound(anyLong(), any(), any());
    }

    @Test
    void 포함_회차_연결이_끝나지_않은_행사는_통합_추첨과_확정을_진행하지_않는다() {
        reviewReady(UNLINKED, List.of(TICKET));

        assertThatThrownBy(() -> service.createReview(EVENT_WEEK, OPERATOR))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_INCOMPLETE"));
        assertThatThrownBy(() -> service.confirmLiveEventReview(EVENT_WEEK, OPERATOR, DRAW))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_INCOMPLETE"));
        verify(raffles, never()).lockRound(any());
        verify(drawings, never()).finalizeRound(anyLong(), any(), any());
        verify(drawings, never()).liveEventTickets(anyLong());
    }

    @Test
    void 행사_완료_내부_경로도_운영_권한이_없으면_DB를_읽기_전에_거부한다() {
        reviewReady(COMPLETE, List.of(TICKET));

        assertThatThrownBy(() -> service.confirmLiveEventReview(EVENT_WEEK, VIEWER, DRAW))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_ADMIN_FORBIDDEN"));
        verify(drawings, never()).liveEventMembership(any());
        verify(drawings, never()).finalizeRound(anyLong(), any(), any());
    }

    @Test
    void 행사_완료_내부_경로도_두_회차_후보가_바뀌면_확정하지_않는다() {
        reviewReady(COMPLETE, List.of(TICKET, SOURCE_TICKET));
        when(drawings.liveEventTickets(LIVE_EVENT))
                .thenReturn(List.of(TICKET, SOURCE_TICKET, new Ticket(42, 5, 5678)));

        assertThatThrownBy(() -> service.confirmLiveEventReview(EVENT_WEEK, OPERATOR, DRAW))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_CANDIDATES_CHANGED"));
        verify(drawings, never()).insertWinner(anyLong(), anyLong(), any(), any());
        verify(drawings, never()).finalizeRound(anyLong(), any(), any());
    }

    /**
     * 판매가 끝난 행사 회차에 검토안이 저장된 상태. 당첨 후보는 후보 목록의 마지막 응모권이다.
     * liveEvent가 null이면 행사와 무관한 회차로 자기 회차 응모권만 후보로 본다.
     */
    private void reviewReady(LiveEventMembership liveEvent, List<Ticket> candidates) {
        when(drawings.liveEventMembership(EVENT_WEEK)).thenReturn(Optional.ofNullable(liveEvent));
        if (liveEvent == null) {
            when(drawings.purchasedTickets(RAFFLE_ROUND, STARTS, ENDS)).thenReturn(candidates);
        } else {
            when(drawings.liveEventTickets(LIVE_EVENT)).thenReturn(candidates);
        }
        var round = new EventRound(EVENT_ROUND, RAFFLE_ROUND, EVENT_WEEK, STARTS, ENDS,
                Instant.parse("2026-11-19T00:00:00Z"), null);
        when(drawings.round(EVENT_WEEK, true)).thenReturn(Optional.of(round));
        when(drawings.round(EVENT_WEEK, false)).thenReturn(Optional.of(round));
        when(drawings.currentReview(EVENT_ROUND)).thenReturn(Optional.of(new ReviewDraw(DRAW, EVENT_ROUND,
                RAFFLE_ROUND, 1, "REVIEW", OPERATOR, null, candidates.size(), 0, 1, NOW)));
        var pick = new ReviewPick(50, candidates.getLast(), "member", 1, 1, "황올+크리스피+콜라");
        when(drawings.reviewPicks(DRAW)).thenReturn(List.of(pick));
        when(drawings.insertAttempt(eq(EVENT_ROUND), eq(OPERATOR), any(), eq("STARTED"), eq(null)))
                .thenReturn(60L);
        when(drawings.confirmReview(eq(DRAW), any())).thenReturn(1);
        when(drawings.winners(EVENT_ROUND)).thenReturn(List.of(pick.winner()));
        when(drawings.successfulCounts(EVENT_ROUND)).thenReturn(Optional.empty());
    }

    private PlatformTransactionManager transactions() {
        return new PlatformTransactionManager() {
            @Override
            public TransactionStatus getTransaction(TransactionDefinition definition) {
                return new SimpleTransactionStatus();
            }

            @Override
            public void commit(TransactionStatus status) {
            }

            @Override
            public void rollback(TransactionStatus status) {
            }
        };
    }
}
