package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Pageable;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class GameTerminalRetryServiceTests {
    private final GameSessionRepository sessions = mock(GameSessionRepository.class);
    private final GameSettlementPersistenceService settlements = mock(GameSettlementPersistenceService.class);
    private final GameTerminalRetryService retries = new GameTerminalRetryService(sessions, settlements);

    @Test
    void 미완료_종결경기만_조회하고_실패행이_다음경기를_막지않는다() {
        var terminal = Set.of(GameSession.Status.FINISHED, GameSession.Status.INVALID);
        when(sessions.findPendingTerminalIds(eq(3L), eq(terminal),
                eq(GameSession.SettlementStatus.PENDING), any(Pageable.class))).thenReturn(List.of(7L, 8L));
        doThrow(new IllegalStateException("합성 실패")).when(settlements).settle(7);

        var result = retries.retryPending(3, 20);

        assertThat(result).isEqualTo(new GameTerminalRetryService.Batch(8, 1, 1));
        verify(settlements).settle(7);
        verify(settlements).settle(8);
        var page = ArgumentCaptor.forClass(Pageable.class);
        verify(sessions).findPendingTerminalIds(eq(3L), eq(terminal),
                eq(GameSession.SettlementStatus.PENDING), page.capture());
        assertThat(page.getValue().getPageSize()).isEqualTo(20);
    }

    @Test
    void 마지막_페이지_이후에는_처음부터_다시_순회한다() {
        when(sessions.findPendingTerminalIds(eq(8L), any(), any(), any())).thenReturn(List.of());
        assertThat(retries.retryPending(8, 20)).isEqualTo(new GameTerminalRetryService.Batch(0, 0, 0));
        verifyNoInteractions(settlements);
    }

    @Test
    void 잘못된_배치범위는_DB조회전에_거절한다() {
        assertThatThrownBy(() -> retries.retryPending(-1, 20)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> retries.retryPending(0, 101)).isInstanceOf(IllegalArgumentException.class);
        verifyNoInteractions(sessions, settlements);
    }
}
