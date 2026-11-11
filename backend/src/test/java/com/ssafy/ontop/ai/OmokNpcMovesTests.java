package com.ssafy.ontop.ai;
import com.ssafy.ontop.game.omok.domain.OmokBoard;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;
class OmokNpcMovesTests {
    @Test void blocksImmediateWinEvenOnEasy() {
        var b=new OmokBoard();
        for(int x=0;x<3;x++){b.place(OmokBoard.Stone.BLACK,x,7);b.place(OmokBoard.Stone.WHITE,x,6);}b.place(OmokBoard.Stone.BLACK,3,7);
        assertThat(OmokNpcMoves.choose(b.snapshot(),b.moves(),"14,14","EASY")).containsExactly(4,7);
    }
    @Test void winningMoveTakesPriorityOverEngineRecommendation() {
        var b=new OmokBoard();
        for(int x=0;x<4;x++){b.place(OmokBoard.Stone.BLACK,x*2,0);b.place(OmokBoard.Stone.WHITE,x,7);}b.place(OmokBoard.Stone.BLACK,12,1);
        assertThat(OmokNpcMoves.choose(b.snapshot(),b.moves(),"14,14","HARD")).containsExactly(4,7);
    }
    @Test void invalidOrOccupiedRecommendationsNeverBecomeMoves() {
        var b=new OmokBoard();b.place(OmokBoard.Stone.BLACK,7,7);
        for(String recommendation:new String[]{"7,7","15,15","bad"}) {
            var p=OmokNpcMoves.choose(b.snapshot(),b.moves(),recommendation,"NORMAL");
            assertThat(p[0]).isBetween(0,14);assertThat(p[1]).isBetween(0,14);assertThat(b.snapshot().board().get(p[1]).get(p[0])).isZero();
        }
    }
}
