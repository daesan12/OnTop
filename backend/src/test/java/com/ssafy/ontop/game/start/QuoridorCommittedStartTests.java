package com.ssafy.ontop.game.start;

import com.ssafy.ontop.game.quoridor.service.QuoridorEngine;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class QuoridorCommittedStartTests {
    @Test
    void 예약_커밋_전에는_엔진을_생성하지_않고_확정_조회_후_생성한다() {
        GameStartGateway gateway = mock(GameStartGateway.class);
        QuoridorEngine engine = mock(QuoridorEngine.class);
        var service = new CommittedGameStartService(gateway, Optional.empty(), Optional.empty(),
                Optional.empty(), true, false);
        service.configureQuoridor(engine);
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "QUORIDOR",
                List.of(new GameStartCommand.Participant("101", 1), new GameStartCommand.Participant("202", 2)));
        when(gateway.startGame(command)).thenReturn(GameStartResult.pending(command.startAttemptId()));
        when(gateway.findStartResult(command.startAttemptId())).thenReturn(GameStartResult.reserved(command, "7"));

        service.start(command);
        verifyNoInteractions(engine);
        service.find(command);

        verify(engine).create("7", "table", List.of(101L, 202L));
    }

    @Test
    void 세_명의_시작_요청은_예약_전에_거절한다() {
        assertThatThrownBy(() -> new GameStartCommand(UUID.randomUUID(), "table", 1, "QUORIDOR",
                List.of(new GameStartCommand.Participant("101", 1), new GameStartCommand.Participant("202", 2),
                        new GameStartCommand.Participant("303", 3))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 테이블의_세_명_설정과_자동_시작을_거절한다() {
        var table = new com.ssafy.ontop.table.domain.TableRoom("table");
        table.join("101");
        table.join("202");
        table.join("303");
        assertThatThrownBy(() -> table.configure(com.ssafy.ontop.table.domain.TableGame.QUORIDOR, null, 10, 3))
                .isInstanceOf(IllegalArgumentException.class);
        table.selectGame(com.ssafy.ontop.table.domain.TableGame.QUORIDOR, null, 10);

        table.setReady("101", true);
        table.setReady("202", true);
        table.setReady("303", true);

        assertThat(table.snapshot().allReady()).isFalse();
    }
}
