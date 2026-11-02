package com.ssafy.ontop.game.reconnect.persistence;

import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.reconnect.ActiveGameRecord;
import com.ssafy.ontop.game.result.GameResultGateway;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.result.persistence.GameSettlementPersistenceService;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class StoredTerminalGameRecoveryTests {
    private static final Instant NOW = Instant.parse("2026-11-02T00:00:00Z");
    private final GameResultGateway results = mock(GameResultGateway.class);
    private final GameSettlementPersistenceService settlements = mock(GameSettlementPersistenceService.class);
    private final StoredTerminalGameRecovery recovery = new StoredTerminalGameRecovery(results, settlements);

    @ParameterizedTest
    @EnumSource(value = GameSession.Status.class, names = {"FINISHED", "INVALID"})
    void 저장된본인결과의_기존정산을_호출하고_커밋결과를_재조회한다(GameSession.Status status) {
        when(results.load(101, "1")).thenReturn(Optional.of(view(101, "1", "ALKKAGI", status,
                GameResultView.SettlementStatus.PENDING)), Optional.of(view(101, "1", "ALKKAGI", status,
                GameResultView.SettlementStatus.SETTLED)));
        recovery.settleStored(101, record(status));
        var order = inOrder(results, settlements);
        order.verify(results).load(101, "1");
        order.verify(settlements).settle(1);
        order.verify(results).load(101, "1");
    }

    @Test
    void 이미정산됐으면_금전처리를_다시호출하지않는다() {
        when(results.load(101, "1")).thenReturn(Optional.of(view(101, "1", "ALKKAGI", GameSession.Status.FINISHED,
                GameResultView.SettlementStatus.SETTLED)));
        recovery.settleStored(101, record(GameSession.Status.FINISHED));
        verifyNoInteractions(settlements);
    }

    @Test
    void 본인결과가_없으면_정산하지않는다() {
        when(results.load(101, "1")).thenReturn(Optional.empty());
        assertThatThrownBy(() -> recovery.settleStored(101, record(GameSession.Status.FINISHED)))
                .isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(settlements);
    }

    @Test
    void 사용자_경기_게임종류_판정이_다르면_정산하지않는다() {
        for (var view : List.of(
                view(102, "1", "ALKKAGI", GameSession.Status.FINISHED, GameResultView.SettlementStatus.PENDING),
                view(101, "2", "ALKKAGI", GameSession.Status.FINISHED, GameResultView.SettlementStatus.PENDING),
                view(101, "1", "OMOK", GameSession.Status.FINISHED, GameResultView.SettlementStatus.PENDING),
                view(101, "1", "ALKKAGI", GameSession.Status.INVALID, GameResultView.SettlementStatus.PENDING))) {
            when(results.load(101, "1")).thenReturn(Optional.of(view));
            assertThatThrownBy(() -> recovery.settleStored(101, record(GameSession.Status.FINISHED)))
                    .isInstanceOf(IllegalStateException.class);
        }
        verifyNoInteractions(settlements);
    }

    @Test
    void 종료시각이_다르면_정산하지않는다() {
        var original = record(GameSession.Status.FINISHED);
        var changed = new ActiveGameRecord(1, original.gameCode(), original.tableId(), original.status(),
                original.settlementStatus(), original.ownerInstanceId(), original.ownerBootId(), NOW, NOW,
                NOW.plusSeconds(1));
        when(results.load(101, "1")).thenReturn(Optional.of(view(101, "1", "ALKKAGI", GameSession.Status.FINISHED,
                GameResultView.SettlementStatus.PENDING)));
        assertThatThrownBy(() -> recovery.settleStored(101, changed)).isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(settlements);
    }

    @Test
    void 정산호출후에도_PENDING이면_성공으로_간주하지않는다() {
        when(results.load(101, "1")).thenReturn(Optional.of(view(101, "1", "ALKKAGI", GameSession.Status.FINISHED,
                GameResultView.SettlementStatus.PENDING)));
        assertThatThrownBy(() -> recovery.settleStored(101, record(GameSession.Status.FINISHED)))
                .isInstanceOf(IllegalStateException.class);
        verify(settlements).settle(1);
    }

    @ParameterizedTest
    @EnumSource(value = GameSession.Status.class, names = {"RESERVED", "RUNNING"})
    void 미종결경기는_기존정산으로도_넘기지않는다(GameSession.Status status) {
        assertThatThrownBy(() -> recovery.settleStored(101, record(status))).isInstanceOf(IllegalStateException.class);
        verifyNoInteractions(results, settlements);
    }

    private ActiveGameRecord record(GameSession.Status status) {
        return new ActiveGameRecord(1, "ALKKAGI", "table-1", status, GameSession.SettlementStatus.PENDING,
                "old-server", UUID.randomUUID(), NOW, NOW, NOW);
    }

    private GameResultView view(long user, String game, String code, GameSession.Status status,
            GameResultView.SettlementStatus settlement) {
        return new GameResultView(user, 1, game, code, GameResultView.Status.valueOf(status.name()), "FORFEIT",
                settlement, 1, List.of(new GameResultView.Participant("101", "FORFEIT"),
                new GameResultView.Participant("102", "WIN")),
                settlement == GameResultView.SettlementStatus.SETTLED ? 0L : null, NOW);
    }
}
