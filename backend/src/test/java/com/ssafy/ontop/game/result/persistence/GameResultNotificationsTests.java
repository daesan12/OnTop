package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultView;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class GameResultNotificationsTests {
    @Test void 한회원의_전송실패가_다른회원알림과_커밋완료를_실패로바꾸지_않는다() {
        var events = mock(ApplicationEventPublisher.class);
        doAnswer(call -> {
            if (((GameResultCommitted) call.getArgument(0)).result().userId() == 1) {
                throw new IllegalStateException("fixture transport failure");
            }
            return null;
        }).when(events).publishEvent(any(GameResultCommitted.class));
        var players = List.of(new GameResultView.Participant("1", "WIN"), new GameResultView.Participant("2", "LOSE"));
        var outcomes = List.of(new GameResultView(1, 2, "7", "OMOK", GameResultView.Status.FINISHED, "FIVE_IN_ROW",
                GameResultView.SettlementStatus.SETTLED, 5, players, 5L, Instant.EPOCH),
                new GameResultView(2, 2, "7", "OMOK", GameResultView.Status.FINISHED, "FIVE_IN_ROW",
                        GameResultView.SettlementStatus.SETTLED, 5, players, -5L, Instant.EPOCH));
        var outbox = mock(GameResultOutbox.class);
        var claim = new GameResultOutbox.Claim(1, UUID.randomUUID(), "{}", 1);
        when(outbox.due(50)).thenReturn(List.of(1L));
        when(outbox.claim(1)).thenReturn(Optional.of(claim));
        when(outbox.decode(claim)).thenReturn(GameResultOutboxPayload.from(new GameResultsReady("table", outcomes)));
        assertThat(new GameResultNotifications(outbox, events).dispatchOnce(50)).isZero();
        verify(events, times(2)).publishEvent(any(GameResultCommitted.class));
        verify(outbox).failed(eq(claim), any(IllegalStateException.class));
        verify(outbox, never()).delivered(any());
    }

    @Test void 이미_선점된_알림은_다른전달기가_재전송하지않는다() {
        var outbox = mock(GameResultOutbox.class);
        var events = mock(ApplicationEventPublisher.class);
        when(outbox.due(50)).thenReturn(List.of(1L));
        when(outbox.claim(1)).thenReturn(Optional.empty());

        assertThat(new GameResultNotifications(outbox, events).dispatchOnce(50)).isZero();

        verifyNoInteractions(events);
    }
}
