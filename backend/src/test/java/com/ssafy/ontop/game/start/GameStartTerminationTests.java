package com.ssafy.ontop.game.start;

import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.user.repository.UserRepository;
import com.ssafy.ontop.wallet.repository.WalletRepository;
import com.ssafy.ontop.wallet.repository.WalletTransactionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.doThrow;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GameStartTerminationTests {
    @Test
    void 시작확인_커밋실패를_예약성공으로_응답하지않는다() {
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "OMOK", List.of(
                new GameStartCommand.Participant("11", 1), new GameStartCommand.Participant("22", 2)), null, 5);
        var gateway = mock(GameStartGateway.class);
        var activation = mock(GameActivationPersistenceService.class);
        var engine = mock(com.ssafy.ontop.game.omok.service.OmokEngine.class);
        when(gateway.findStartResult(command.startAttemptId())).thenReturn(GameStartResult.reserved(command, "7"));
        when(activation.authorize(command, "7")).thenReturn(true);
        var failure = new org.springframework.transaction.TransactionSystemException("합성 커밋 실패");
        doThrow(failure).when(activation).started(command, "7");
        var service = new CommittedGameStartService(gateway, Optional.of(engine), Optional.empty(),
                Optional.empty(), Optional.empty(), Optional.of(activation), true, false);

        assertThatThrownBy(() -> service.find(command)).isSameAs(failure);
        verify(engine).create("7", "table", 11, 22);
        verify(gateway, org.mockito.Mockito.never()).startGame(command);
    }

    @Test
    void DB_Gateway를_활성화_검증없이_연결할수없다() {
        assertThatThrownBy(() -> new CommittedGameStartService(mock(JpaGameStartGateway.class),
                Optional.empty(), Optional.empty(), Optional.empty(), Optional.empty(), true, false))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void DB_활성화_승인이_거절되면_엔진을_생성하지않는다() {
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "OMOK", List.of(
                new GameStartCommand.Participant("11", 1), new GameStartCommand.Participant("22", 2)), null, 5);
        var gateway = mock(GameStartGateway.class);
        var activation = mock(GameActivationPersistenceService.class);
        var engine = mock(com.ssafy.ontop.game.omok.service.OmokEngine.class);
        when(gateway.findStartResult(command.startAttemptId())).thenReturn(GameStartResult.reserved(command, "7"));
        var service = new CommittedGameStartService(gateway, Optional.of(engine), Optional.empty(),
                Optional.empty(), Optional.empty(), Optional.of(activation), true, false);

        assertThat(service.find(command).outcome()).isEqualTo(GameStartResult.Outcome.REJECTED);
        verify(activation).authorize(command, "7");
        verifyNoInteractions(engine);
    }

    @ParameterizedTest
    @EnumSource(value = GameSession.Status.class, names = {"FINISHED", "INVALID"})
    void 종결경기_조회는_다시_예약확정이나_엔진생성을_승인하지않는다(GameSession.Status status) {
        var sessions = mock(GameSessionRepository.class);
        var participants = mock(GameParticipantRepository.class);
        var users = mock(UserRepository.class);
        var wallets = mock(WalletRepository.class);
        var ledger = mock(WalletTransactionRepository.class);
        var now = Instant.parse("2026-10-26T00:00:00Z");
        var service = new GameStartPersistenceService(sessions, participants, users, wallets, ledger,
                Clock.fixed(now, ZoneOffset.UTC), "test");
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "OMOK", List.of(
                new GameStartCommand.Participant("11", 1), new GameStartCommand.Participant("22", 2)), null, 5);
        var game = GameSession.prepare(command, new byte[32], "test", UUID.randomUUID(), now);
        game.reserve(now);
        ReflectionTestUtils.setField(game, "status", status);
        when(sessions.findByStartAttemptId(command.startAttemptId())).thenReturn(Optional.of(game));

        var result = service.find(command.startAttemptId(), null).orElseThrow();

        assertThat(result.outcome()).isEqualTo(GameStartResult.Outcome.REJECTED);
        assertThat(result.code()).isEqualTo("GAME_ALREADY_TERMINATED");
        assertThat(result.isReservationCommitted(command)).isFalse();
        var gateway = mock(GameStartGateway.class);
        when(gateway.findStartResult(command.startAttemptId())).thenReturn(result);
        var engine = mock(com.ssafy.ontop.game.omok.service.OmokEngine.class);
        var starts = new CommittedGameStartService(gateway, Optional.of(engine), Optional.empty(),
                Optional.empty(), Optional.empty(), true, false);
        assertThat(starts.find(command)).isEqualTo(result);
        verifyNoInteractions(engine, participants, users, wallets, ledger);
    }
}
