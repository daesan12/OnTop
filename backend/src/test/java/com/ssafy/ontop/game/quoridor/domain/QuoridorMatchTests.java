package com.ssafy.ontop.game.quoridor.domain;

import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Orientation;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Wall;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QuoridorMatchTests {
    private static final Instant NOW = Instant.parse("2026-11-21T00:00:00Z");

    @Test
    void 두_명은_장벽_열_개씩_네_명은_다섯_개씩_나눈다() {
        assertThat(new QuoridorMatch(List.of(1L, 2L), 0).players())
                .extracting(QuoridorMatch.Player::wallsRemaining).containsExactly(10, 10);
        assertThat(new QuoridorMatch(List.of(1L, 2L, 3L, 4L), 0).players())
                .extracting(QuoridorMatch.Player::wallsRemaining).containsExactly(5, 5, 5, 5);
        assertThatThrownBy(() -> new QuoridorMatch(List.of(1L, 2L, 3L), 0))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 네_면의_중앙에서_시작하고_시계_방향으로_차례가_진행된다() {
        QuoridorMatch match = new QuoridorMatch(List.of(1L, 2L, 3L, 4L), 0);
        assertThat(match.players()).extracting(p -> List.of(p.x(), p.y()))
                .containsExactly(List.of(4, 0), List.of(8, 4), List.of(4, 8), List.of(0, 4));

        match.move(1, 4, 1, NOW);
        match.move(2, 7, 4, NOW);
        match.move(3, 4, 7, NOW);
        match.move(4, 1, 4, NOW);

        assertThat(match.turnUserId()).isEqualTo(1L);
        assertThat(match.version()).isEqualTo(5);
    }

    @Test
    void 장벽을_놓으면_개수가_줄고_차례가_넘어가며_다시_이동하지_못한다() {
        QuoridorMatch match = new QuoridorMatch(List.of(1L, 2L), 0);

        match.place(1, new Wall(0, 0, Orientation.HORIZONTAL));

        assertThat(match.players().getFirst().wallsRemaining()).isEqualTo(9);
        assertThat(match.turnUserId()).isEqualTo(2L);
        assertThatThrownBy(() -> match.move(1, 4, 1, NOW)).isInstanceOf(Rejected.class);
    }

    @Test
    void 맞은편_끝줄에_도착하면_즉시_끝나고_추가_입력을_거절한다() {
        QuoridorMatch match = new QuoridorMatch(List.of(1L, 2L), 0);
        for (int y = 1; y <= 8; y++) {
            match.move(1, 4, y, NOW);
            if (y < 8) {
                match.move(2, y % 2 == 1 ? 5 : 6, 8, NOW);
            }
        }

        assertThat(match.winnerUserId()).isEqualTo(1L);
        assertThat(match.endReason()).isEqualTo("GOAL_REACHED");
        assertThat(match.turnUserId()).isNull();
        assertThat(match.legalMoves()).isEmpty();
        assertThatThrownBy(() -> match.move(2, 5, 7, NOW)).isInstanceOf(Rejected.class);
    }

    @Test
    void 기권한_말은_빠지고_장벽은_유지하며_마지막_한_명이_승리한다() {
        QuoridorMatch match = new QuoridorMatch(List.of(1L, 2L, 3L, 4L), 0);
        match.place(1, new Wall(0, 0, Orientation.HORIZONTAL));

        match.forfeit(1, NOW);
        match.forfeit(2, NOW);
        match.forfeit(3, NOW);

        assertThat(match.walls()).hasSize(1);
        assertThat(match.winnerUserId()).isEqualTo(4L);
        assertThat(match.endReason()).isEqualTo("LAST_PLAYER_STANDING");
        long version = match.version();
        assertThat(match.forfeit(3, NOW)).isFalse();
        assertThat(match.version()).isEqualTo(version);
    }
}
