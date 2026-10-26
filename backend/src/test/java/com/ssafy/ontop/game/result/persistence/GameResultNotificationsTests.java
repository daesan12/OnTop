package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultView;
import java.time.Instant;
import java.util.List;
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
        assertThatCode(() -> new GameResultNotifications(events).committed(new GameResultsReady(outcomes))).doesNotThrowAnyException();
        verify(events, times(2)).publishEvent(any(GameResultCommitted.class));
    }
}
