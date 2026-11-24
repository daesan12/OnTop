package com.ssafy.ontop.game.quoridor.domain;

import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Cell;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Goal;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Orientation;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Wall;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class QuoridorBoardTests {
    @Test
    void 빈칸에서는_상하좌우만_이동한다() {
        assertThat(QuoridorBoard.legalMoves(new Cell(4, 4), Set.of(), List.of()))
                .containsExactlyInAnyOrder(new Cell(4, 3), new Cell(5, 4), new Cell(4, 5), new Cell(3, 4));
    }

    @Test
    void 직진_점프가_가능하면_대각선으로_피하지_않는다() {
        assertThat(QuoridorBoard.legalMoves(new Cell(4, 4), Set.of(new Cell(4, 3)), List.of()))
                .contains(new Cell(4, 2)).doesNotContain(new Cell(3, 3), new Cell(5, 3), new Cell(4, 3));
    }

    @Test
    void 상대와_사이에_장벽이_있으면_점프하지_못한다() {
        assertThat(QuoridorBoard.legalMoves(new Cell(4, 4), Set.of(new Cell(4, 3)),
                List.of(new Wall(4, 3, Orientation.HORIZONTAL))))
                .doesNotContain(new Cell(4, 2), new Cell(3, 3), new Cell(5, 3));
    }

    @Test
    void 상대_뒤가_보드_끝이면_대각선으로_피한다() {
        assertThat(QuoridorBoard.legalMoves(new Cell(4, 1), Set.of(new Cell(4, 0)), List.of()))
                .contains(new Cell(3, 0), new Cell(5, 0)).doesNotContain(new Cell(4, -1));
    }

    @Test
    void 상대_뒤가_장벽이면_열린_대각선만_허용한다() {
        assertThat(QuoridorBoard.legalMoves(new Cell(4, 4), Set.of(new Cell(4, 3)),
                List.of(new Wall(4, 2, Orientation.HORIZONTAL), new Wall(3, 3, Orientation.VERTICAL))))
                .contains(new Cell(5, 3)).doesNotContain(new Cell(4, 2), new Cell(3, 3));
    }

    @Test
    void 두_말을_연속으로_뛰어넘지_않고_옆으로_피한다() {
        assertThat(QuoridorBoard.legalMoves(new Cell(4, 4), Set.of(new Cell(4, 3), new Cell(4, 2)), List.of()))
                .contains(new Cell(3, 3), new Cell(5, 3)).doesNotContain(new Cell(4, 1), new Cell(4, 2));
    }

    @Test
    void 네_말이_붙으면_비어_있는_회피_칸만_허용한다() {
        assertThat(QuoridorBoard.legalMoves(new Cell(4, 4),
                Set.of(new Cell(4, 3), new Cell(4, 2), new Cell(3, 3)), List.of()))
                .contains(new Cell(5, 3)).doesNotContain(new Cell(3, 3), new Cell(4, 2));
    }

    @Test
    void 뒤와_양옆이_모두_막히면_그_상대를_넘을_수_없다() {
        assertThat(QuoridorBoard.legalMoves(new Cell(4, 4),
                Set.of(new Cell(4, 3), new Cell(4, 2), new Cell(3, 3)),
                List.of(new Wall(4, 2, Orientation.VERTICAL))))
                .doesNotContain(new Cell(3, 3), new Cell(5, 3), new Cell(4, 2));
    }

    @Test
    void 장벽은_교차와_반칸_겹침을_금지하고_끝끼리_닿는_배치는_허용한다() {
        List<Wall> placed = List.of(new Wall(3, 4, Orientation.HORIZONTAL));

        assertThat(QuoridorBoard.overlaps(new Wall(3, 4, Orientation.VERTICAL), placed)).isTrue();
        assertThat(QuoridorBoard.overlaps(new Wall(4, 4, Orientation.HORIZONTAL), placed)).isTrue();
        assertThat(QuoridorBoard.overlaps(new Wall(5, 4, Orientation.HORIZONTAL), placed)).isFalse();
        assertThat(QuoridorBoard.overlaps(new Wall(8, 4, Orientation.HORIZONTAL), placed)).isTrue();
    }

    @Test
    void 자기_또는_다른_참가자를_완전히_가두는_장벽을_거절한다() {
        List<Wall> placed = List.of(new Wall(3, 2, Orientation.HORIZONTAL),
                new Wall(2, 3, Orientation.VERTICAL), new Wall(4, 3, Orientation.VERTICAL));
        Wall closing = new Wall(3, 4, Orientation.HORIZONTAL);
        List<Cell> pawns = List.of(new Cell(0, 0), new Cell(8, 0), new Cell(3, 3), new Cell(0, 8));
        List<Goal> goals = List.of(Goal.SOUTH, Goal.WEST, Goal.NORTH, Goal.EAST);

        assertThat(QuoridorBoard.overlaps(closing, placed)).isFalse();
        assertThat(QuoridorBoard.canPlace(closing, placed, pawns, goals)).isFalse();
        assertThat(QuoridorBoard.canPlace(new Wall(5, 6, Orientation.HORIZONTAL), placed, pawns, goals)).isTrue();
    }
}
