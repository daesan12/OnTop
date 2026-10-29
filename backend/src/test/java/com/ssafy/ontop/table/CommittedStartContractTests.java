package com.ssafy.ontop.table;

import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.start.CommittedGameStartService;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.game.start.LocalGameStartGateway;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class CommittedStartContractTests {
    private final GameStartGateway gateway = mock(GameStartGateway.class);
    private final OmokEngine omok = mock(OmokEngine.class);
    private final GameStartCommand command = new GameStartCommand(UUID.randomUUID(), "table", 2, "OMOK",
            List.of(new GameStartCommand.Participant("101", 1), new GameStartCommand.Participant("202", 2)));
    private final CommittedGameStartService service = new CommittedGameStartService(gateway, Optional.of(omok),
            Optional.empty(), Optional.empty(), true, false);

    @Test
    void 전원판돈예약커밋을확인해야엔진을생성한다() {
        var pending = GameStartResult.pending(command.startAttemptId());
        var reserved = GameStartResult.reserved(command, "game");
        when(gateway.startGame(command)).thenReturn(pending);
        when(gateway.findStartResult(command.startAttemptId())).thenReturn(reserved);

        assertThat(service.start(command)).isEqualTo(pending);
        verifyNoInteractions(omok);
        assertThat(service.find(command)).isEqualTo(reserved);
        verify(omok).create("game", "table", 101, 202);
        verify(gateway, times(1)).startGame(command);
    }

    @Test
    void 예약미완료나일부예약과예약금액불일치는엔진을열지않는다() {
        var id = command.startAttemptId();
        for (var invalid : List.of(
                new GameStartResult(id, GameStartResult.Outcome.PENDING, "game", command.participants(), 1, 2, null),
                new GameStartResult(id, GameStartResult.Outcome.RESERVED, "game", command.participants(), 0, 0, null),
                new GameStartResult(id, GameStartResult.Outcome.RESERVED, "game", command.participants(), 1, 1, null),
                new GameStartResult(id, GameStartResult.Outcome.RESERVED, "game", command.participants(), 2, 4, null),
                new GameStartResult(id, GameStartResult.Outcome.RESERVED, "game",
                        command.participants().subList(0, 1), 1, 1, null))) {
            when(gateway.startGame(command)).thenReturn(invalid);
            service.start(command);
        }
        verifyNoInteractions(omok);
    }

    @Test
    void 엔진생성실패는같은확정결과조회로재시도하고시작요청은반복하지않는다() {
        var committed = GameStartResult.reserved(command, "game");
        when(gateway.startGame(command)).thenReturn(committed);
        when(gateway.findStartResult(command.startAttemptId())).thenReturn(committed);
        doThrow(new IllegalStateException("runtime unavailable")).doNothing()
                .when(omok).create("game", "table", 101, 202);
        assertThatThrownBy(() -> service.start(command)).isInstanceOf(IllegalStateException.class);
        assertThat(service.find(command)).isEqualTo(committed);
        verify(gateway, times(1)).startGame(command);
        verify(gateway, times(1)).findStartResult(command.startAttemptId());
        verify(omok, times(2)).create("game", "table", 101, 202);
    }

    @Test
    void 미확정과다른시도성공은엔진에전달하지않는다() {
        when(gateway.startGame(command)).thenReturn(GameStartResult.pending(command.startAttemptId()));
        service.start(command);
        when(gateway.findStartResult(command.startAttemptId())).thenReturn(new GameStartResult(UUID.randomUUID(),
                GameStartResult.Outcome.RESERVED, "game", command.participants(), 1, 2, null));
        service.find(command);
        verifyNoInteractions(omok);
    }

    @Test
    void 비계정ID와미설정엔진은예약전에거절한다() {
        var invalid = new GameStartCommand(UUID.randomUUID(), "table", 1, "OMOK",
                List.of(new GameStartCommand.Participant("dev-a", 1), new GameStartCommand.Participant("202", 2)));
        assertThat(service.start(invalid).outcome()).isEqualTo(GameStartResult.Outcome.REJECTED);
        var missing = new CommittedGameStartService(gateway, Optional.empty(), Optional.empty(), Optional.empty(),
                true, false);
        assertThat(missing.start(command).outcome()).isEqualTo(GameStartResult.Outcome.REJECTED);
        verifyNoInteractions(gateway, omok);
    }

    @Test
    void 미인증과개발시작대역혼용설정은기동전에거절한다() {
        assertThatThrownBy(() -> new CommittedGameStartService(gateway, Optional.empty(), Optional.empty(),
                Optional.empty(), false, false)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CommittedGameStartService(gateway, Optional.empty(), Optional.empty(),
                Optional.empty(), true, true)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new CommittedGameStartService(
                new LocalGameStartGateway(LocalGameStartGateway.Scenario.SUCCESS, 0), Optional.empty(),
                Optional.empty(), Optional.empty(), true, false)).isInstanceOf(IllegalArgumentException.class);
    }
}
