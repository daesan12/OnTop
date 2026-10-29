package com.ssafy.ontop.game;

import com.ssafy.ontop.game.result.GameDefeatConfirmed;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameLifecycle;
import com.ssafy.ontop.world.dto.WorldGameReaction;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class GameDefeatTests {
    private final GameLifecycle lifecycle = new GameLifecycle();
    private final List<Object> notices = new ArrayList<>();
    private final Instant at = Instant.parse("2026-10-26T09:00:00Z");

    @Test
    void 네명중_순차기권은_직전잔여인원_4_3_2를_각각_확정한다() {
        left(101, 1);
        left(202, 2);
        left(303, 3);
        assertThat(reactions()).extracting(GameDefeatConfirmed::remainingBefore).containsExactly(4, 3, 2);
        assertThat(reactions().stream().map(event -> WorldGameReaction.from(event, "one")))
                .extracting(WorldGameReaction::motion).containsExactly("head-clutch", "head-clutch", "table-flip");
    }

    @Test
    void 기권재시도와_최종결과는_이탈자의_연출을_반복하지_않는다() {
        left(101, 1);
        left(101, 1);
        lifecycle.finished("game", "table", "ONE_CARD", 2,
                List.of(101L, 202L, 303L, 404L), List.of(404L), "NORMAL", at, notices);
        lifecycle.finished("game", "table", "ONE_CARD", 2,
                List.of(101L, 202L, 303L, 404L), List.of(404L), "NORMAL", at, notices);
        assertThat(reactions()).extracting(GameDefeatConfirmed::userId).containsExactly(101L, 202L, 303L);
        assertThat(reactions()).extracting(GameDefeatConfirmed::remainingBefore).containsExactly(4, 3, 3);
        assertThat(reactions().getFirst().kind()).isEqualTo(GameDefeatConfirmed.Kind.FORFEIT);
        assertThat(reactions().getLast().kind()).isEqualTo(GameDefeatConfirmed.Kind.DEFEAT);
        assertThat(reactions().getFirst().occurredAt()).isEqualTo(at);
    }

    @Test
    void 무승부와_승자는_패배연출을_만들지_않는다() {
        lifecycle.finished("draw", "table", "OMOK", 1, List.of(101L, 202L), List.of(), "DRAW", at, notices);
        assertThat(reactions()).isEmpty();
        lifecycle.finished("game", "table", "OMOK", 1, List.of(101L, 202L), List.of(202L), "NORMAL", at, notices);
        assertThat(reactions()).singleElement().satisfies(event -> {
            assertThat(event.userId()).isEqualTo(101);
            assertThat(WorldGameReaction.from(event, "one").durationMs()).isEqualTo(2800);
        });
    }

    private void left(long userId, long version) {
        lifecycle.left("game", "table", "ONE_CARD", version, userId,
                GameDepartureReason.EXPLICIT_LEAVE, at, 4, notices);
    }

    private List<GameDefeatConfirmed> reactions() {
        return notices.stream().filter(GameDefeatConfirmed.class::isInstance)
                .map(GameDefeatConfirmed.class::cast).toList();
    }
}
