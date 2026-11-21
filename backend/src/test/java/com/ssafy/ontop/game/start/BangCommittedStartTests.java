package com.ssafy.ontop.game.start;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.bang.service.BangEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class BangCommittedStartTests {
    @Test
    void 예약이_커밋되기_전에는_엔진을_생성하지_않고_성공_이후_실제_시계방향으로_시작한다() {
        GameStartGateway gateway = mock(GameStartGateway.class);
        BangEngine engine = new BangEngine(new ObjectMapper(), Clock.systemUTC(), ignored -> {}, new GameEngineRouter(), new Random(3));
        var service = new CommittedGameStartService(gateway, Optional.empty(), Optional.empty(), Optional.empty(), true, false);
        service.configureBang(engine);
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "BANG", IntStream.rangeClosed(1, 7)
                .mapToObj(index -> new GameStartCommand.Participant(Integer.toString(index), index)).toList(), null, 10);
        when(gateway.startGame(command)).thenReturn(GameStartResult.pending(command.startAttemptId()), GameStartResult.reserved(command, "77"));

        assertThat(service.start(command).outcome()).isEqualTo(GameStartResult.Outcome.PENDING);
        assertThat(engine.load(1, "77")).isEmpty();
        assertThat(service.start(command).outcome()).isEqualTo(GameStartResult.Outcome.RESERVED);

        var players = engine.load(1, "77").orElseThrow().publicState().path("players");
        assertThat(players).extracting(player -> player.path("userId").asText())
                .containsExactly("1", "5", "3", "7", "2", "6", "4");
        assertThat(engine.load(1).orElseThrow().participantCount()).isEqualTo(7);
        assertThat(GameReservationRequest.from(command).userIds()).isEqualTo(List.of(1L, 2L, 3L, 4L, 5L, 6L, 7L));
    }
}
