package com.ssafy.ontop.game.davinci;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.davinci.service.DavinciEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.result.GameFinishedResultListener;
import com.ssafy.ontop.game.result.GameLifecycle;
import com.ssafy.ontop.game.result.GameResultService;
import com.ssafy.ontop.game.start.CommittedGameStartService;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.table.service.TableHub;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class DavinciStartFlowTests {
    @Test
    void 공통_종료_알림이_대기실_정산_전이를_연결한다() {
        GameResultService results = mock(GameResultService.class);
        TableHub tables = mock(TableHub.class);
        GameFinishedResultListener listener = new GameFinishedResultListener(results, Optional.of(tables));
        var event = new GameLifecycle().finished("123", "table", "DAVINCI_CODE", 9,
                List.of(101L, 202L), List.of(101L), "LAST_PLAYER_STANDING", Instant.now());

        listener.finished(event);

        verify(tables).roundEnded("table", "123");
        verify(results).finished("123", List.of(101L, 202L));
    }

    @Test
    void 예약_커밋_확인_후에만_엔진을_생성하고_확인_재호출은_같은_경기를_복구한다() {
        DavinciEngine engine = new DavinciEngine(new ObjectMapper(), Clock.systemUTC(), event -> { },
                new GameEngineRouter(), tiles -> { });
        GameStartCommand command = new GameStartCommand(UUID.randomUUID(), "table", 1, "DAVINCI_CODE",
                List.of(new GameStartCommand.Participant("101", 1), new GameStartCommand.Participant("202", 2)));
        GameStartGateway gateway = new GameStartGateway() {
            @Override public GameStartResult startGame(GameStartCommand request) {
                assertThat(engine.load(101, "123")).isEmpty();
                return GameStartResult.reserved(request, "123");
            }
            @Override public GameStartResult findStartResult(UUID attempt) { return GameStartResult.reserved(command, "123"); }
        };
        CommittedGameStartService service = new CommittedGameStartService(gateway,
                Optional.empty(), Optional.empty(), Optional.empty(), true, false);
        ReflectionTestUtils.setField(service, "davinci", engine);

        GameStartResult result = service.start(command);
        GameStartResult restored = service.find(command);

        assertThat(result.gameSessionId()).isEqualTo("123");
        assertThat(restored).isEqualTo(result);
        assertThat(engine.load(101, "123").orElseThrow().publicState().path("gameCode").asText())
                .isEqualTo("DAVINCI_CODE");
    }

    @Test
    void 예약이_아직_커밋되지_않으면_엔진을_만들지_않는다() {
        DavinciEngine engine = new DavinciEngine(new ObjectMapper(), Clock.systemUTC(), event -> { },
                new GameEngineRouter(), tiles -> { });
        GameStartGateway gateway = new GameStartGateway() {
            @Override public GameStartResult startGame(GameStartCommand request) { return GameStartResult.pending(request.startAttemptId()); }
            @Override public GameStartResult findStartResult(UUID attempt) { return GameStartResult.pending(attempt); }
        };
        CommittedGameStartService service = new CommittedGameStartService(gateway,
                Optional.empty(), Optional.empty(), Optional.empty(), true, false);
        ReflectionTestUtils.setField(service, "davinci", engine);
        GameStartCommand command = new GameStartCommand(UUID.randomUUID(), "table", 1, "DAVINCI_CODE",
                List.of(new GameStartCommand.Participant("101", 1), new GameStartCommand.Participant("202", 2)));

        service.start(command);

        assertThat(engine.load(101)).isEmpty();
    }
}
