package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.wallet.domain.Wallet;
import com.ssafy.ontop.wallet.domain.WalletTransaction;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.mockito.ArgumentCaptor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GameInvalidSettlementTests {
    private final GameSessionRepository sessions = mock(GameSessionRepository.class);
    private final GameParticipantRepository participants = mock(GameParticipantRepository.class);
    private final WalletRepository wallets = mock(WalletRepository.class);
    private final WalletTransactionRepository ledger = mock(WalletTransactionRepository.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final Instant began = Instant.parse("2026-10-26T00:00:00Z");
    private final Instant ended = began.plusSeconds(10);
    private final GameSettlementPersistenceService service = new GameSettlementPersistenceService(
            sessions, participants, wallets, ledger, Clock.fixed(ended, ZoneOffset.UTC), events);

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void 무효반환은_판정유무와_무관하게_예약만_한번_해제한다(boolean engineVerdict) {
        var game = game();
        var first = new GameParticipant(7, 11, 1, 0, 5);
        var second = new GameParticipant(7, 22, 2, 1, 5);
        if (engineVerdict) {
            first.recordFinish(new GameFinished.Participant(11, GameFinished.Result.FORFEIT,
                    GameDepartureReason.LOGOUT, ended));
            second.recordFinish(new GameFinished.Participant(22, GameFinished.Result.FORFEIT,
                    GameDepartureReason.LOGOUT, ended));
        }
        var firstWallet = wallet(11, 111);
        var secondWallet = wallet(22, 122);
        when(participants.findByGameSessionIdOrderByParticipantOrder(7)).thenReturn(List.of(first, second));
        when(wallets.findForUpdateByUserId(11)).thenReturn(Optional.of(firstWallet));
        when(wallets.findForUpdateByUserId(22)).thenReturn(Optional.of(secondWallet));

        service.settle(7);
        service.settle(7);

        assertThat(firstWallet.balance()).isEqualTo(100);
        assertThat(secondWallet.balance()).isEqualTo(100);
        assertThat(firstWallet.reserved()).isZero();
        assertThat(secondWallet.reserved()).isZero();
        assertThat(game.status()).isEqualTo(GameSession.Status.INVALID);
        assertThat(game.settlementStatus()).isEqualTo(GameSession.SettlementStatus.SETTLED);
        assertThat(game.resultVersion()).isEqualTo(2);
        assertThat(first.coinDelta()).isZero();
        assertThat(first.reservationReleasedAt()).isEqualTo(ended);
        assertThat(first.result()).isEqualTo(engineVerdict ? GameFinished.Result.FORFEIT : null);
        var order = inOrder(sessions, wallets);
        order.verify(sessions).findForUpdateById(7);
        order.verify(wallets).findForUpdateByUserId(11);
        order.verify(wallets).findForUpdateByUserId(22);
        var entries = ArgumentCaptor.forClass(WalletTransaction.class);
        verify(ledger, times(2)).save(entries.capture());
        assertThat(entries.getAllValues()).allSatisfy(entry -> {
            assertThat(ReflectionTestUtils.getField(entry, "transactionType")).isEqualTo("GAME_RELEASE");
            assertThat(ReflectionTestUtils.getField(entry, "balanceDelta")).isEqualTo(0L);
            assertThat(ReflectionTestUtils.getField(entry, "reservedDelta")).isEqualTo(-5L);
        });
        assertThat(ReflectionTestUtils.getField(entries.getAllValues().getFirst(), "idempotencyKey"))
                .isEqualTo("game:7:close:11");
        var ready = ArgumentCaptor.forClass(GameResultsReady.class);
        verify(events).publishEvent(ready.capture());
        assertThat(ready.getValue().results()).allSatisfy(result -> {
            assertThat(result.status()).isEqualTo(GameResultView.Status.INVALID);
            assertThat(result.myCoinDelta()).isZero();
        });
        assertThatThrownBy(() -> game.recordFinish("7:finished", new byte[32], 2, "FIVE_IN_ROW", ended))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 지갑조회실패는_반환이나_완료알림을_진행하지않는다() {
        var game = game();
        when(participants.findByGameSessionIdOrderByParticipantOrder(7)).thenReturn(List.of(
                new GameParticipant(7, 11, 1, 0, 5), new GameParticipant(7, 22, 2, 1, 5)));
        var firstWallet = wallet(11, 111);
        when(wallets.findForUpdateByUserId(11)).thenReturn(Optional.of(firstWallet));
        when(wallets.findForUpdateByUserId(22)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.settle(7)).isInstanceOf(IllegalStateException.class);

        assertThat(firstWallet.reserved()).isEqualTo(5);
        assertThat(game.settlementStatus()).isEqualTo(GameSession.SettlementStatus.PENDING);
        verify(ledger, never()).save(org.mockito.ArgumentMatchers.any(WalletTransaction.class));
        verify(events, never()).publishEvent(org.mockito.ArgumentMatchers.any(GameResultsReady.class));
    }

    private GameSession game() {
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "OMOK", List.of(
                new GameStartCommand.Participant("11", 1), new GameStartCommand.Participant("22", 2)), null, 5);
        var game = GameSession.prepare(command, new byte[32], "test", UUID.randomUUID(), began);
        ReflectionTestUtils.setField(game, "id", 7L);
        game.reserve(began);
        // 소유권 복구 서비스는 아직 연결하지 않는다. DB에서 읽은 판정 없는 INVALID 행을 재현한다.
        ReflectionTestUtils.setField(game, "status", GameSession.Status.INVALID);
        ReflectionTestUtils.setField(game, "endReason", "ENGINE_LOST");
        ReflectionTestUtils.setField(game, "endedAt", ended);
        ReflectionTestUtils.setField(game, "resultVersion", 1L);
        when(sessions.findForUpdateById(7)).thenReturn(Optional.of(game));
        return game;
    }

    private Wallet wallet(long userId, long walletId) {
        var wallet = Wallet.forSignup(userId, began);
        ReflectionTestUtils.setField(wallet, "id", walletId);
        wallet.reserveGameEntry(5, began);
        return wallet;
    }
}
