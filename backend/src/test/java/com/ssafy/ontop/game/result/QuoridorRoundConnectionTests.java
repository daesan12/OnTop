package com.ssafy.ontop.game.result;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.quoridor.service.QuoridorEngine;
import com.ssafy.ontop.table.service.TableHub;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Random;
import java.util.stream.IntStream;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

class QuoridorRoundConnectionTests {
    @ParameterizedTest
    @CsvSource({"2,false", "4,false", "2,true", "4,true"})
    void 실제_엔진의_기권과_도착_종료는_로비와_전원_결과_조회로_한번_이어진다(int count, boolean goal) {
        var results = mock(GameResultService.class);
        var tables = mock(TableHub.class);
        var listener = new GameFinishedResultListener(results, Optional.of(tables));
        List<GameFinished> finished = new ArrayList<>();
        Instant[] now = {Instant.parse("2026-11-23T00:00:00Z")};
        Clock clock = new Clock() {
            @Override public ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return now[0]; }
        };
        List<Long> users = IntStream.rangeClosed(1, count).mapToObj(i -> 101L * i).toList();
        var engine = new QuoridorEngine(new ObjectMapper(), clock, event -> {
            if (event instanceof GameFinished ended) {
                finished.add(ended);
                listener.finished(ended);
            }
        }, new GameEngineRouter(), new Random(1));
        engine.create("7", "table", users);

        if (goal) {
            for (int turn = 0; turn < 100 && finished.isEmpty(); turn++) {
                now[0] = now[0].plusSeconds(30);
                engine.tick();
            }
        } else {
            for (int i = 0; i < count - 1; i++) {
                var request = new GameForfeitCommand(users.get(i), "7", "leave-" + i);
                engine.forfeit(request);
                engine.forfeit(request);
                if (i < count - 2) {
                    verifyNoInteractions(results, tables);
                    assertThat(engine.load(users.getLast(), "7").orElseThrow().publicState()
                            .path("status").asText()).isEqualTo("PLAYING");
                }
            }
        }
        engine.tick();

        assertThat(finished).hasSize(1);
        assertThat(finished.getFirst().endReason()).isEqualTo(goal ? "GOAL_REACHED" : "LAST_PLAYER_STANDING");
        assertThat(finished.getFirst().participants()).filteredOn(p -> p.result() == GameFinished.Result.WIN)
                .hasSize(1);
        verify(tables, times(1)).roundEnded("table", "7");
        verify(results, times(1)).finished("7", users);
    }
}
