package com.ssafy.ontop.game.result;

import com.ssafy.ontop.table.service.TableHub;
import java.time.Instant;
import java.util.Optional;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class StoneRumbleRoundConnectionTests {
    @ParameterizedTest
    @ValueSource(ints = {2, 8})
    void 돌탑_종료는_로비를_정산_대기로_전환하고_모든_참가자의_결과를_조회한다(int count) {
        var results = mock(GameResultService.class);
        var tables = mock(TableHub.class);
        var listener = new GameFinishedResultListener(results, Optional.of(tables));
        var players = IntStream.rangeClosed(1, count).mapToObj(index -> new GameFinished.Participant(
                index * 101L, GameFinished.Result.DRAW, null, null)).toList();
        var event = new GameFinished("7:finished", "7", "table", "STONE_RUMBLE", 100,
                players, "ALL_FALLEN", Instant.EPOCH);

        listener.finished(event);

        verify(tables).roundEnded("table", "7");
        verify(results).finished("7", players.stream().map(GameFinished.Participant::userId).toList());
    }

    @Test
    void 전용_종료_알림을_쓰는_게임은_공통_알림으로_중복_처리하지_않는다() {
        var results = mock(GameResultService.class);
        var tables = mock(TableHub.class);
        new GameFinishedResultListener(results, Optional.of(tables)).finished(new GameFinished(
                "7:finished", "7", "table", "ONE_CARD", 100, java.util.List.of(), "EMPTY_HAND", Instant.EPOCH));

        verifyNoInteractions(results, tables);
    }
}
