package com.ssafy.ontop.game.chess;

import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameFinishedResultListener;
import com.ssafy.ontop.game.result.GameResultService;
import com.ssafy.ontop.table.service.TableHub;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

class ChessRoundCompletionTests {
    @Test
    void 체스_종료를_공통_대기실과_결과조회_경로에_연결한다() {
        GameResultService results = mock(GameResultService.class);
        TableHub tables = mock(TableHub.class);
        var listener = new GameFinishedResultListener(results, Optional.of(tables));
        var event = new GameFinished("188:finished", "188", "table", "CHESS", 6, List.of(
                new GameFinished.Participant(101, GameFinished.Result.DRAW, null, null),
                new GameFinished.Participant(202, GameFinished.Result.DRAW, null, null)),
                "AGREED_DRAW", Instant.parse("2026-11-21T00:00:00Z"));

        listener.finished(event);

        verify(tables, times(1)).roundEnded("table", "188");
        verify(results, times(1)).finished("188", List.of(101L, 202L));
    }
}
