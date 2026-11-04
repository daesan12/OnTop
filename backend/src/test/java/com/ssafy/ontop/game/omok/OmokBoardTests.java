package com.ssafy.ontop.game.omok;

import com.ssafy.ontop.game.omok.domain.OmokBoard;
import com.ssafy.ontop.game.omok.domain.OmokBoard.Outcome;
import com.ssafy.ontop.game.omok.domain.OmokBoard.Stone;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OmokBoardTests {
    @Test
    void 금수_미리보기는_판을_보존하고_실제판정과_같으며_무르기에_갱신된다() {
        OmokBoard board = new OmokBoard();
        for (int[] p : new int[][]{{6, 7}, {8, 7}, {7, 6}, {7, 8}}) board.place(Stone.BLACK, p[0], p[1]);
        var before = board.snapshot();
        assertThat(before.forbiddenMoves()).contains(new OmokBoard.Point(7, 7));
        assertThat(board.snapshot().forbiddenMoves()).isSameAs(before.forbiddenMoves());
        assertThat(before.board().get(7).get(7)).isZero();
        assertThatThrownBy(() -> board.place(Stone.BLACK, 7, 7)).isInstanceOf(OmokBoard.ForbiddenMove.class);
        assertThat(board.snapshot()).isEqualTo(before);
        board.place(Stone.WHITE, 7, 7);
        assertThat(board.snapshot().forbiddenMoves()).doesNotContain(new OmokBoard.Point(7, 7));
        board.undoPair();
        assertThat(board.snapshot().forbiddenMoves()).isEmpty();
        assertThat(before.forbiddenMoves()).contains(new OmokBoard.Point(7, 7));
    }

    @Test
    void 장목_미리보기는_정확한_오목_승리와_구분한다() {
        OmokBoard board = new OmokBoard();
        for (int x : new int[]{2, 3, 4, 6, 7}) board.place(Stone.BLACK, x, 7);
        assertThat(board.snapshot().forbiddenMoves()).contains(new OmokBoard.Point(5, 7));
        OmokBoard five = new OmokBoard();
        for (int x : new int[]{2, 3, 4, 6}) five.place(Stone.BLACK, x, 7);
        assertThat(five.snapshot().forbiddenMoves()).doesNotContain(new OmokBoard.Point(5, 7));
        five.place(Stone.BLACK, 5, 7);
        assertThat(five.snapshot().outcome()).isEqualTo(Outcome.BLACK_WIN);
        assertThat(five.snapshot().forbiddenMoves()).isEmpty();
    }
    @ParameterizedTest
    @CsvSource({"0,0,1,0", "14,0,0,1", "0,0,1,1", "0,14,1,-1"})
    void 가로세로와_양대각선의_다섯돌을_양쪽끝에서도_판정한다(int x, int y, int dx, int dy) {
        OmokBoard board = new OmokBoard();
        for (int index = 0; index < 4; index++) {
            board.place(Stone.BLACK, x + dx * index, y + dy * index);
        }
        assertThat(board.snapshot().outcome()).isEqualTo(Outcome.PLAYING);
        board.place(Stone.BLACK, x + dx * 4, y + dy * 4);
        assertThat(board.snapshot().outcome()).isEqualTo(Outcome.BLACK_WIN);
        assertThatIllegalArgumentException().isThrownBy(() -> board.place(Stone.WHITE, 7, 7));
    }

    @Test
    void 백은_중간을_채워_여섯돌이_이어져도_승리다() {
        OmokBoard board = new OmokBoard();
        for (int x : new int[]{0, 1, 2, 4, 5}) {
            board.place(Stone.WHITE, x, 0);
        }
        board.place(Stone.WHITE, 3, 0);
        assertThat(board.snapshot().outcome()).isEqualTo(Outcome.WHITE_WIN);
    }

    @Test
    void 흑의_삼삼을_거절하고_판전체를_보존한다() {
        OmokBoard board = new OmokBoard();
        for (int[] point : new int[][]{{6, 7}, {8, 7}, {7, 6}, {7, 8}}) {
            board.place(Stone.BLACK, point[0], point[1]);
        }
        var before = board.snapshot();
        assertThatThrownBy(() -> board.place(Stone.BLACK, 7, 7)).isInstanceOf(OmokBoard.ForbiddenMove.class);
        assertThat(board.snapshot()).isEqualTo(before);
        board.place(Stone.BLACK, 0, 0);
        assertThat(board.snapshot().moveCount()).isEqualTo(5);
    }

    @Test
    void 잘못된_위치와_점유된_칸은_판을_바꾸지않는다() {
        OmokBoard board = new OmokBoard();
        board.place(Stone.BLACK, 0, 0);
        var before = board.snapshot();
        for (int[] point : new int[][]{{-1, 0}, {15, 0}, {0, -1}, {0, 15}, {0, 0}}) {
            assertThatIllegalArgumentException().isThrownBy(() -> board.place(Stone.WHITE, point[0], point[1]));
        }
        assertThat(board.snapshot()).isEqualTo(before);
    }

    @Test
    void 외부_스냅샷으로_판을_수정할수없고_이전판은_변하지않는다() {
        OmokBoard board = new OmokBoard();
        var before = board.snapshot();
        assertThatThrownBy(() -> before.board().get(0).set(0, 2)).isInstanceOf(UnsupportedOperationException.class);
        board.place(Stone.BLACK, 0, 0);
        assertThat(before.board().get(0).get(0)).isZero();
        assertThat(board.snapshot().lastMove()).isEqualTo(new OmokBoard.Move(0, 0, Stone.BLACK));
    }

    @Test
    void 승리없이_225칸이_차면_무승부다() {
        OmokBoard board = new OmokBoard();
        for (int y = 0; y < 15; y++) {
            for (int x = 0; x < 15; x++) {
                board.place((x + 2 * y) % 4 < 2 ? Stone.BLACK : Stone.WHITE, x, y);
            }
        }
        assertThat(board.snapshot().outcome()).isEqualTo(Outcome.DRAW);
        assertThat(board.snapshot().moveCount()).isEqualTo(225);
    }
}
