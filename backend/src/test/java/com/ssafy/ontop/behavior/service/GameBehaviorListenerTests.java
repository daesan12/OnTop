package com.ssafy.ontop.behavior.service;

import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.PositionSample;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliBellLog;
import com.ssafy.ontop.game.halligalli.service.HalliGalliBellStats;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameFinished.Participant;
import com.ssafy.ontop.game.result.GameFinished.Result;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Supplier;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

class GameBehaviorListenerTests {

    private static final Instant ENDED_AT = Instant.parse("2026-10-23T01:00:00Z");

    private final CapturingLog log = new CapturingLog();
    private final GameBehaviorListener listener = new GameBehaviorListener(log);

    @Test
    void 경기_종료는_참가자마다_결과와_함께_기록한다() {
        listener.finished(new GameFinished("game-1:finished", "game-1", "table-1", "OMOK", 7, List.of(
                new Participant(101, Result.LOSE, null, null),
                new Participant(202, Result.WIN, null, null)), "FIVE_IN_ROW", ENDED_AT));

        assertThat(log.events)
                .extracting(BehaviorEvent::type, BehaviorEvent::userId, BehaviorEvent::occurredAt)
                .containsExactly(
                        tuple(BehaviorEventType.GAME_ENDED, 101L, ENDED_AT),
                        tuple(BehaviorEventType.GAME_ENDED, 202L, ENDED_AT));
        assertThat(log.events).extracting(event -> event.props().get("result")).containsExactly("LOSE", "WIN");
        assertThat(log.events.getFirst().props())
                .containsEntry("gameCode", "OMOK")
                .containsEntry("endReason", "FIVE_IN_ROW")
                .containsEntry("players", 2)
                .doesNotContainKey("leaveReason");
        assertThat(log.events.getFirst().gameId()).isEqualTo("game-1");
        assertThat(log.events.getFirst().tableId()).isEqualTo("table-1");
    }

    @Test
    void 중도_이탈한_참가자는_기권과_이탈_사유를_남긴다() {
        listener.finished(new GameFinished("game-2:finished", "game-2", "table-2", "ONE_CARD", 9, List.of(
                new Participant(101, Result.FORFEIT, GameDepartureReason.DISCONNECT_TIMEOUT, ENDED_AT.minusSeconds(30)),
                new Participant(202, Result.WIN, null, null),
                new Participant(303, Result.LOSE, null, null)), "LAST_CARD", ENDED_AT));

        assertThat(log.events.getFirst().props())
                .containsEntry("result", "FORFEIT")
                .containsEntry("leaveReason", "DISCONNECT_TIMEOUT")
                .containsEntry("players", 3);
    }

    @Test
    void 무승부는_모든_참가자를_DRAW로_남긴다() {
        listener.finished(new GameFinished("game-3:finished", "game-3", "table-1", "DICE", 3, List.of(
                new Participant(101, Result.DRAW, null, null),
                new Participant(202, Result.DRAW, null, null)), "ABANDONED", ENDED_AT));

        assertThat(log.events).extracting(event -> event.props().get("result")).containsExactly("DRAW", "DRAW");
    }

    @Test
    void 과일_땡_종_기록은_참가자마다_GAME_PLAY_STATS로_남기고_반응_시간이_없으면_키를_뺀다() {
        listener.bellStats(new HalliGalliBellStats("game-4", "table-4", ENDED_AT, List.of(
                new HalliGalliBellLog.Summary(101, 3, 1, 2, 80, 120, 140, 2, 3),
                new HalliGalliBellLog.Summary(202, 0, 2, 4, null, null, null, 0, 0))));

        assertThat(log.events)
                .extracting(BehaviorEvent::type, BehaviorEvent::userId, BehaviorEvent::occurredAt, BehaviorEvent::gameId)
                .containsExactly(
                        tuple(BehaviorEventType.GAME_PLAY_STATS, 101L, ENDED_AT, "game-4"),
                        tuple(BehaviorEventType.GAME_PLAY_STATS, 202L, ENDED_AT, "game-4"));
        assertThat(log.events.getFirst().props())
                .containsEntry("gameCode", "HALLI_GALLI")
                .containsEntry("players", 2)
                .containsEntry("successRings", 3)
                .containsEntry("penaltyRings", 1)
                .containsEntry("lateRings", 2)
                .containsEntry("reactionMinMs", 80)
                .containsEntry("reactionMedianMs", 120)
                .containsEntry("reactionAvgMs", 140)
                .containsEntry("under150Ms", 2)
                .containsEntry("under300Ms", 3);
        assertThat(log.events.get(1).props())
                .containsEntry("penaltyRings", 2)
                .containsEntry("lateRings", 4)
                .doesNotContainKeys("reactionMinMs", "reactionMedianMs", "reactionAvgMs");
        assertThat(log.events.getFirst().tableId()).isEqualTo("table-4");
    }

    private static final class CapturingLog implements BehaviorLog {
        private final List<BehaviorEvent> events = new ArrayList<>();

        @Override
        public void record(Supplier<BehaviorEvent> event) {
            events.add(event.get());
        }

        @Override
        public void recordPosition(Supplier<PositionSample> sample) {
            throw new UnsupportedOperationException("경기 종료는 위치를 기록하지 않습니다.");
        }
    }
}
