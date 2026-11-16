package com.ssafy.ontop.raffle.service;

import com.ssafy.ontop.admin.security.AdminAccessPolicy;
import com.ssafy.ontop.admin.security.AdminAccessProperties;
import com.ssafy.ontop.raffle.RaffleException;
import com.ssafy.ontop.raffle.domain.RaffleDrawSelector;
import com.ssafy.ontop.raffle.domain.RaffleDrawSelector.Ticket;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository;
import com.ssafy.ontop.raffle.repository.RaffleDrawingRepository.EventRound;
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
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 공개 추첨 행사 대상 회차의 직접 확정 잠금과 행사 완료용 내부 확정 경로를 검증한다. */
class RaffleDrawingServiceTests {
    private static final LocalDate WEEK = LocalDate.of(2026, 11, 16);
    private static final Instant STARTS = Instant.parse("2026-11-16T00:00:00Z");
    private static final Instant ENDS = Instant.parse("2026-11-18T15:00:00Z");
    private static final Instant NOW = Instant.parse("2026-11-19T05:00:00Z");
    private static final long OPERATOR = 1;
    private static final long VIEWER = 2;
    private static final long MEMBER = 3;
    private static final long EVENT_ROUND = 10;
    private static final long RAFFLE_ROUND = 20;
    private static final long DRAW = 30;
    private static final Ticket TICKET = new Ticket(40, MEMBER, 1234);

    private RaffleDrawingRepository drawings;
    private RaffleDrawingService service;

    @BeforeEach
    void setUp() {
        drawings = mock(RaffleDrawingRepository.class);
        var administrators = new AdminAccessPolicy(new AdminAccessProperties(
                Set.of(OPERATOR, VIEWER), Set.of(), Set.of(OPERATOR)));
        service = new RaffleDrawingService(mock(RaffleRepository.class), drawings, administrators,
                new RaffleDrawSelector(bound -> 0), transactions(), Clock.fixed(NOW, ZoneOffset.UTC),
                LocalDate.of(2026, 11, 2));
    }

    @Test
    void 행사_대상_회차의_관리자_직접_확정은_거부하고_아무것도_기록하지_않는다() {
        reviewReady(true);

        assertThatThrownBy(() -> service.confirmReview(WEEK, OPERATOR, DRAW))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> {
                    assertThat(((RaffleException) error).status()).isEqualTo(409);
                    assertThat(((RaffleException) error).code()).isEqualTo("RAFFLE_LIVE_EVENT_LOCKED");
                });
        verify(drawings, never()).round(any(), anyBoolean());
        verify(drawings, never()).insertWinner(anyLong(), anyLong(), any(), any());
        verify(drawings, never()).finalizeRound(anyLong(), any(), any());
        verify(drawings, never()).confirmReview(anyLong(), any());
    }

    @Test
    void 행사_대상이_아닌_회차의_직접_확정은_기존대로_당첨자를_저장한다() {
        reviewReady(false);

        var result = service.confirmReview(WEEK, OPERATOR, DRAW);

        assertThat(result.finalized()).isTrue();
        verify(drawings).insertWinner(eq(EVENT_ROUND), eq(50L), eq(TICKET), any());
        verify(drawings).finalizeRound(eq(EVENT_ROUND), any(), eq(OPERATOR));
        verify(drawings).confirmReview(eq(DRAW), any());
    }

    @Test
    void 행사_완료_내부_경로는_대상_회차를_같은_검증으로_확정한다() {
        reviewReady(true);

        var result = service.confirmLiveEventReview(WEEK, OPERATOR, DRAW);

        assertThat(result.finalized()).isTrue();
        verify(drawings).insertWinner(eq(EVENT_ROUND), eq(50L), eq(TICKET), any());
        verify(drawings).finalizeRound(eq(EVENT_ROUND), any(), eq(OPERATOR));
    }

    @Test
    void 행사_완료_내부_경로는_대상이_아닌_회차를_확정하지_않는다() {
        reviewReady(false);

        assertThatThrownBy(() -> service.confirmLiveEventReview(WEEK, OPERATOR, DRAW))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_LIVE_EVENT_NOT_REGISTERED"));
        verify(drawings, never()).finalizeRound(anyLong(), any(), any());
    }

    @Test
    void 행사_완료_내부_경로도_운영_권한이_없으면_DB를_읽기_전에_거부한다() {
        reviewReady(true);

        assertThatThrownBy(() -> service.confirmLiveEventReview(WEEK, VIEWER, DRAW))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_ADMIN_FORBIDDEN"));
        verify(drawings, never()).liveEventRegistered(any());
        verify(drawings, never()).finalizeRound(anyLong(), any(), any());
    }

    @Test
    void 행사_완료_내부_경로도_후보가_바뀌면_확정하지_않는다() {
        reviewReady(true);
        when(drawings.purchasedTickets(RAFFLE_ROUND, STARTS, ENDS))
                .thenReturn(List.of(TICKET, new Ticket(41, 4, 5678)));

        assertThatThrownBy(() -> service.confirmLiveEventReview(WEEK, OPERATOR, DRAW))
                .isInstanceOf(RaffleException.class)
                .satisfies(error -> assertThat(((RaffleException) error).code())
                        .isEqualTo("RAFFLE_CANDIDATES_CHANGED"));
        verify(drawings, never()).insertWinner(anyLong(), anyLong(), any(), any());
        verify(drawings, never()).finalizeRound(anyLong(), any(), any());
    }

    /** 판매가 끝난 회차에 후보 1명·당첨 1명인 검토안이 저장된 상태. */
    private void reviewReady(boolean liveEvent) {
        when(drawings.liveEventRegistered(WEEK)).thenReturn(liveEvent);
        var round = new EventRound(EVENT_ROUND, RAFFLE_ROUND, WEEK, STARTS, ENDS,
                Instant.parse("2026-11-19T00:00:00Z"), null);
        when(drawings.round(WEEK, true)).thenReturn(Optional.of(round));
        when(drawings.round(WEEK, false)).thenReturn(Optional.of(round));
        when(drawings.currentReview(EVENT_ROUND)).thenReturn(Optional.of(new ReviewDraw(DRAW, EVENT_ROUND,
                RAFFLE_ROUND, 1, "REVIEW", OPERATOR, null, 1, 0, 1, NOW)));
        var pick = new ReviewPick(50, TICKET, "member", 1, 1, "황올+크리스피+콜라");
        when(drawings.reviewPicks(DRAW)).thenReturn(List.of(pick));
        when(drawings.purchasedTickets(RAFFLE_ROUND, STARTS, ENDS)).thenReturn(List.of(TICKET));
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
