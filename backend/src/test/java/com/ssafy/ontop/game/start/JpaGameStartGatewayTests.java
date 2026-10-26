package com.ssafy.ontop.game.start;

import java.sql.SQLException;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.TransactionSystemException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class JpaGameStartGatewayTests {
    private final GameStartPersistenceService persistence = mock(GameStartPersistenceService.class);
    private final JpaGameStartGateway gateway = new JpaGameStartGateway(persistence);
    private final GameStartCommand command = new GameStartCommand(UUID.randomUUID(), "table", 1, "OMOK", List.of(
            new GameStartCommand.Participant("10", 1), new GameStartCommand.Participant("20", 2)));

    @Test
    void 커밋을_끝낸_서비스_결과만_반환한다() {
        var expected = GameStartResult.reserved(command, "100");
        when(persistence.reserve(any())).thenReturn(expected);
        assertThat(gateway.startGame(command)).isEqualTo(expected);
    }

    @Test
    void 시도_UNIQUE_충돌은_롤백후_조회하고_재예약하지않는다() {
        var expected = GameStartResult.reserved(command, "100");
        when(persistence.reserve(any())).thenThrow(new DataIntegrityViolationException("fixture"));
        when(persistence.find(eq(command.startAttemptId()), any())).thenReturn(Optional.of(expected));

        assertThat(gateway.startGame(command)).isEqualTo(expected);
        verify(persistence).reserve(any());
        verify(persistence, never()).recordConflictRejection(any(), any());
    }

    @Test
    void 다른_내용의_시도_경합은_CONFLICT를_유지한다() {
        when(persistence.reserve(any())).thenThrow(new DataIntegrityViolationException("fixture"));
        when(persistence.find(eq(command.startAttemptId()), any()))
                .thenReturn(Optional.of(GameStartResult.conflict(command.startAttemptId())));
        assertThat(gateway.startGame(command).outcome()).isEqualTo(GameStartResult.Outcome.CONFLICT);
    }

    @Test
    void 활성_테이블_UNIQUE_경합은_재예약없이_거절결과만_저장한다() {
        when(persistence.reserve(any())).thenThrow(new DataIntegrityViolationException("fixture",
                new SQLException("Duplicate entry for key 'uk_game_sessions_active_table'", "23000", 1062)));
        when(persistence.find(eq(command.startAttemptId()), any())).thenReturn(Optional.empty());
        when(persistence.recordConflictRejection(any(), eq("TABLE_ALREADY_IN_GAME")))
                .thenReturn(GameStartResult.rejected(command.startAttemptId(), "TABLE_ALREADY_IN_GAME"));

        assertThat(gateway.startGame(command).code()).isEqualTo("TABLE_ALREADY_IN_GAME");
        verify(persistence).reserve(any());
    }

    @Test
    void DB나_커밋_결과_불명은_PENDING이며_거절_저장이나_재예약을_하지않는다() {
        for (var failure : List.of(new DataAccessResourceFailureException("fixture"),
                new TransactionSystemException("fixture-unknown-commit"))) {
            doThrow(failure).when(persistence).reserve(any());
            assertThat(gateway.startGame(command).outcome()).isEqualTo(GameStartResult.Outcome.PENDING);
        }
        verify(persistence, never()).recordConflictRejection(any(), any());
        verify(persistence, never()).find(any(), any());
    }

    @Test
    void 조회실패와_미확인시도는_PENDING이며_조회에서_예약을_호출하지않는다() {
        when(persistence.find(command.startAttemptId(), null)).thenReturn(Optional.empty());
        assertThat(gateway.findStartResult(command.startAttemptId()).outcome()).isEqualTo(GameStartResult.Outcome.PENDING);
        when(persistence.find(command.startAttemptId(), null)).thenThrow(new DataAccessResourceFailureException("fixture"));
        assertThat(gateway.findStartResult(command.startAttemptId()).outcome()).isEqualTo(GameStartResult.Outcome.PENDING);
        verify(persistence, never()).reserve(any());
    }
}
