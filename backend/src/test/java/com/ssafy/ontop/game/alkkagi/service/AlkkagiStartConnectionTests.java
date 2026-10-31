package com.ssafy.ontop.game.alkkagi.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.start.CommittedGameStartService;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import java.time.Clock;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AlkkagiStartConnectionTests {
    @Test
    void 공원시작은_예약성공뒤에만_생성하고_동일확인을_재사용한다() {
        var engine = engine();
        var command = command();
        var gateway = new GameStartGateway() {
            public GameStartResult startGame(GameStartCommand request) {
                return GameStartResult.reserved(request, "park-game");
            }

            public GameStartResult findStartResult(UUID id) {
                return GameStartResult.reserved(command, "park-game");
            }
        };
        var service = service(gateway, engine);
        assertThat(service.start(command).gameSessionId()).isEqualTo("park-game");
        long version = engine.load(42, "park-game").orElseThrow().version();
        service.find(command);
        assertThat(engine.load(42, "park-game").orElseThrow().version()).isEqualTo(version);
        assertThat(engine.load(99, "park-game").orElseThrow().privateState().isEmpty()).isTrue();
    }

    @Test
    void 엔진이_꺼져있으면_예약을_호출하지_않는다() {
        var calls = new AtomicInteger();
        var gateway = new GameStartGateway() {
            public GameStartResult startGame(GameStartCommand command) {
                calls.incrementAndGet();
                return GameStartResult.reserved(command, "bad");
            }

            public GameStartResult findStartResult(UUID id) {
                throw new AssertionError();
            }
        };
        assertThat(service(gateway, null).start(command()).code()).isEqualTo("GAME_RUNTIME_UNAVAILABLE");
        assertThat(calls.get()).isZero();
    }

    @Test
    void 예약대기이면_엔진을_만들지_않는다() {
        var engine = engine();
        var gateway = new GameStartGateway() {
            public GameStartResult startGame(GameStartCommand command) {
                return GameStartResult.pending(command.startAttemptId());
            }

            public GameStartResult findStartResult(UUID id) {
                return GameStartResult.pending(id);
            }
        };
        service(gateway, engine).start(command());
        assertThat(engine.load(42)).isEmpty();
    }

    private AlkkagiEngine engine() {
        return new AlkkagiEngine(new ObjectMapper(), Clock.systemUTC(), event -> { }, new GameEngineRouter());
    }

    private CommittedGameStartService service(GameStartGateway gateway, AlkkagiEngine engine) {
        return new CommittedGameStartService(gateway, Optional.empty(), Optional.empty(), Optional.empty(),
                Optional.empty(), Optional.empty(), Optional.ofNullable(engine), true, false);
    }

    private GameStartCommand command() {
        return new GameStartCommand(UUID.randomUUID(), "table", 1, "ALKKAGI", List.of(
                new GameStartCommand.Participant("42", 1), new GameStartCommand.Participant("84", 2)));
    }
}
