package com.ssafy.ontop.behavior.service;

import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.PositionSample;
import com.ssafy.ontop.game.farkle.service.FarkleGameFinished;
import com.ssafy.ontop.game.omok.service.OmokGameFinished;
import com.ssafy.ontop.game.onecard.service.OneCardGameFinished;
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
    void 오목_종료는_참가자마다_승패와_함께_기록한다() {
        listener.finished(new OmokGameFinished("game-1", "table-1", 7, 101, 202, 202L, "FIVE_IN_ROW", ENDED_AT));

        assertThat(log.events)
                .extracting(BehaviorEvent::type, BehaviorEvent::userId, BehaviorEvent::occurredAt)
                .containsExactly(
                        tuple(BehaviorEventType.GAME_ENDED, 101L, ENDED_AT),
                        tuple(BehaviorEventType.GAME_ENDED, 202L, ENDED_AT));
        assertThat(log.events).extracting(event -> event.props().get("won")).containsExactly(false, true);
        assertThat(log.events.getFirst().props())
                .containsEntry("gameCode", "OMOK")
                .containsEntry("endReason", "FIVE_IN_ROW")
                .containsEntry("players", 2);
        assertThat(log.events.getFirst().gameId()).isEqualTo("game-1");
        assertThat(log.events.getFirst().tableId()).isEqualTo("table-1");
    }

    @Test
    void 승자가_없으면_모든_참가자를_won_false로_남긴다() {
        listener.finished(new FarkleGameFinished("game-2", "table-1", 3, List.of(101L, 202L), List.of(0L, 0L),
                null, "ABANDONED", ENDED_AT));

        assertThat(log.events).extracting(event -> event.props().get("won")).containsExactly(false, false);
        assertThat(log.events.getFirst().props()).containsEntry("gameCode", "DICE");
    }

    @Test
    void 승자가_여럿인_게임은_승자_각각을_won_true로_남긴다() {
        listener.finished(new OneCardGameFinished("game-3", "table-2", 9, List.of(101L, 202L, 303L),
                List.of(101L, 303L), "LAST_CARD", ENDED_AT));

        assertThat(log.events).extracting(event -> event.props().get("won")).containsExactly(true, false, true);
        assertThat(log.events.getFirst().props()).containsEntry("players", 3).containsEntry("gameCode", "ONE_CARD");
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
