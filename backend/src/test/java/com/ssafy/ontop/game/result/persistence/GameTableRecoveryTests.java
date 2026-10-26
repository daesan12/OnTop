package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.start.GameRuntimeIdentity;
import com.ssafy.ontop.table.service.TableHub;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GameTableRecoveryTests {
    private final TableHub hub = mock(TableHub.class);
    private final GameStoredRoundQuery outbox = mock(GameStoredRoundQuery.class);
    private final GameResultNotifications notifications = mock(GameResultNotifications.class);
    private final GameRuntimeIdentity identity = new GameRuntimeIdentity("test");
    private final GameTableRecovery service = new GameTableRecovery(Optional.of(hub), identity, outbox, notifications);

    @Test void 현재대기중인_같은테이블의_DB종결만_재전달한다() {
        var payload = payload("table");
        when(hub.pendingResultRounds()).thenReturn(Map.of("table", "7"));
        when(outbox.currentRound(7, identity)).thenReturn(Optional.of(payload));

        assertThat(service.reconcile()).isEqualTo(1);

        verify(notifications).publish(payload);
    }

    @Test void 테이블이_다른_DB스냅샷이나_다른boot의_빈결과는_전달하지않는다() {
        var payload = payload("other");
        when(hub.pendingResultRounds()).thenReturn(Map.of("table", "7"));
        when(outbox.currentRound(7, identity)).thenReturn(Optional.of(payload));

        assertThat(service.reconcile()).isZero();

        verify(notifications, never()).publish(payload);
    }

    @Test void DB장애를_경기무효나_성공종결로_해석하지않는다() {
        when(hub.pendingResultRounds()).thenReturn(Map.of("table", "7"));
        when(outbox.currentRound(7, identity)).thenThrow(new DataAccessResourceFailureException("fixture"));

        assertThat(service.reconcile()).isZero();

        org.mockito.Mockito.verifyNoInteractions(notifications);
    }

    private GameResultOutboxPayload payload(String table) {
        var participants = List.of(new GameResultView.Participant("1", null), new GameResultView.Participant("2", null));
        return GameResultOutboxPayload.from(new GameResultsReady(table, List.of(
                new GameResultView(1, 2, "7", "OMOK", GameResultView.Status.INVALID, "ENGINE_LOST",
                        GameResultView.SettlementStatus.SETTLED, 5, participants, 0L, Instant.EPOCH),
                new GameResultView(2, 2, "7", "OMOK", GameResultView.Status.INVALID, "ENGINE_LOST",
                        GameResultView.SettlementStatus.SETTLED, 5, participants, 0L, Instant.EPOCH))));
    }
}
