package com.ssafy.ontop.game.chess;

import com.ssafy.ontop.game.chess.domain.ChessPosition;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChessPositionTests {
    @Test
    void 초기배치의_깊이별_합법수는_표준_perft와_일치한다() {
        ChessPosition position = ChessPosition.initial();

        assertThat(perft(position, 1)).isEqualTo(20);
        assertThat(perft(position, 2)).isEqualTo(400);
        assertThat(perft(position, 3)).isEqualTo(8902);
    }

    @Test
    void 캐슬링과_핀의_표준_키위피트_포지션을_검증한다() {
        ChessPosition position = ChessPosition.fromFen(
                "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1");

        assertThat(perft(position, 1)).isEqualTo(48);
        assertThat(perft(position, 2)).isEqualTo(2039);
    }

    @Test
    void 왕이_체크를_통과하는_캐슬링은_금지한다() {
        ChessPosition position = ChessPosition.fromFen("k4r2/8/8/8/8/8/8/4K2R w K - 0 1");

        assertThat(position.legalMoves()).doesNotContain(new ChessPosition.Move("e1", "g1", null));
    }

    @Test
    void 앙파상으로_자신의_왕이_노출되면_금지한다() {
        ChessPosition position = ChessPosition.fromFen("k7/8/8/r4pPK/8/8/8/8 w - f6 0 1");

        assertThat(position.legalMoves()).doesNotContain(new ChessPosition.Move("g5", "f6", null));
        assertThat(position.repetitionKey()).endsWith(" -");
    }

    @Test
    void 앙파상은_직후에만_가능하고_지나간_폰을_제거한다() {
        ChessPosition position = ChessPosition.fromFen("4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1");
        ChessPosition next = position.play(new ChessPosition.Move("e5", "d6", null));

        assertThat(next.piece(ChessPosition.square("d5"))).isEqualTo('.');
        assertThat(next.piece(ChessPosition.square("d6"))).isEqualTo('P');
        assertThat(next.halfmove()).isZero();
    }

    @Test
    void 승격은_퀸_룩_비숍_나이트_네가지이며_선택을_생략할_수_없다() {
        ChessPosition position = ChessPosition.fromFen("4k3/P7/8/8/8/8/8/4K3 w - - 0 1");

        assertThat(position.legalMoves().stream().filter(move -> move.from().equals("a7"))).hasSize(4);
        assertThatThrownBy(() -> position.play(new ChessPosition.Move("a7", "a8", null)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(position.play(new ChessPosition.Move("a7", "a8", "n")).piece(56)).isEqualTo('N');
    }

    @Test
    void 왕은_잡을_수_없고_폰은_막힌_칸을_뛰어넘을_수_없다() {
        ChessPosition position = ChessPosition.fromFen("4k3/8/8/8/8/4n3/4P3/4K3 w - - 0 1");

        assertThat(position.legalMoves()).doesNotContain(new ChessPosition.Move("e2", "e4", null));
    }

    @Test
    void 룩을_움직였다_돌려도_캐슬링_권리는_회복하지_않는다() {
        ChessPosition position = ChessPosition.fromFen("4k3/8/8/8/8/8/8/4K2R w K - 0 1");
        position = position.play(new ChessPosition.Move("h1", "h2", null))
                .play(new ChessPosition.Move("e8", "e7", null))
                .play(new ChessPosition.Move("h2", "h1", null))
                .play(new ChessPosition.Move("e7", "e8", null));

        assertThat(position.legalMoves()).doesNotContain(new ChessPosition.Move("e1", "g1", null));
    }

    private long perft(ChessPosition position, int depth) {
        if (depth == 0) { return 1; }
        long total = 0;
        for (ChessPosition.Move move : position.legalMoves()) {
            total += perft(position.play(move), depth - 1);
        }
        return total;
    }
}
