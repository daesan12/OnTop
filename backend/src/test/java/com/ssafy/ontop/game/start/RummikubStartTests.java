package com.ssafy.ontop.game.start;

import com.ssafy.ontop.game.rummikub.service.RummikubEngine;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class RummikubStartTests {
    private final GameStartGateway gateway = mock(GameStartGateway.class);
    private final RummikubEngine engine = mock(RummikubEngine.class);
    private final CommittedGameStartService service = new CommittedGameStartService(gateway,
            Optional.empty(), Optional.empty(), Optional.empty(), true, false);
    private final GameStartCommand command = new GameStartCommand(UUID.randomUUID(), "table", 1, "RUMMIKUB",
            List.of(new GameStartCommand.Participant("101", 1), new GameStartCommand.Participant("202", 2)), null, 0);

    @Test
    void 예약_커밋이_확정된_뒤에만_루미큐브_엔진을_생성한다() {
        service.configureRummikub(engine);
        when(gateway.startGame(command)).thenReturn(GameStartResult.pending(command.startAttemptId()));
        service.start(command);
        verify(engine, never()).create("game", "table", List.of(101L, 202L));

        when(gateway.findStartResult(command.startAttemptId())).thenReturn(GameStartResult.reserved(command, "game"));
        service.find(command);

        verify(engine).create("game", "table", List.of(101L, 202L));
    }

    @Test
    void 엔진이_비활성화되어_있으면_예약_이전에_거절한다() {
        assertThat(service.start(command).code()).isEqualTo("GAME_RUNTIME_UNAVAILABLE");
        verify(gateway, never()).startGame(command);
    }
}
