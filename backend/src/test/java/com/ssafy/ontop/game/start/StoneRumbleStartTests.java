package com.ssafy.ontop.game.start;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.stonerumble.service.StoneRumbleEngine;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class StoneRumbleStartTests {
    @org.junit.jupiter.params.ParameterizedTest
    @org.junit.jupiter.params.provider.ValueSource(ints = {2, 3, 4, 5, 6, 7, 8})
    void 예약이_커밋된_뒤에만_돌탑_엔진을_생성하고_재확인은_멱등이다(int count) {
        var engine = new StoneRumbleEngine(new ObjectMapper(), Clock.systemUTC(), event -> { }, new GameEngineRouter());
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "STONE_RUMBLE",
                java.util.stream.IntStream.rangeClosed(1, count)
                        .mapToObj(index -> new GameStartCommand.Participant(Integer.toString(index * 101), index)).toList());
        boolean[] committed = {false};
        var gateway = new GameStartGateway() {
            @Override public GameStartResult startGame(GameStartCommand request) {
                return committed[0] ? GameStartResult.reserved(request, "7")
                        : GameStartResult.pending(request.startAttemptId());
            }
            @Override public GameStartResult findStartResult(UUID id) {
                return startGame(command);
            }
        };
        var service = new CommittedGameStartService(gateway, Optional.empty(), Optional.empty(), Optional.empty(),
                true, false);
        service.configureStoneRumble(engine);

        service.start(command);
        assertThat(engine.load(101)).isEmpty();
        committed[0] = true;
        service.start(command);
        long version = engine.load(101, "7").orElseThrow().version();
        service.find(command);

        assertThat(engine.load(101, "7").orElseThrow().version()).isEqualTo(version);
        assertThat(engine.load(101, "7").orElseThrow().publicState().path("players")).hasSize(count);
    }
}
