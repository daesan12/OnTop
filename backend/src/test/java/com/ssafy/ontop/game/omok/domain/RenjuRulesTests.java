package com.ssafy.ontop.game.omok.domain;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import static org.assertj.core.api.Assertions.assertThat;

class RenjuRulesTests {
    private final int[][] cells = new int[15][15];

    @ParameterizedTest
    @CsvSource({"1,0,0,1", "1,0,1,1", "0,1,1,-1", "1,1,1,-1"})
    void 두_축의_열린삼은_삼삼이다(int ax, int ay, int bx, int by) {
        black(7-ax,7-ay,7+ax,7+ay,7-bx,7-by,7+bx,7+by);
        assertThat(forbidden(7,7)).isTrue();
    }

    @Test void 끊긴삼도_합법적인_열린사로_확장되면_삼삼이다() {
        black(5,7,8,7,7,6,7,8);
        assertThat(forbidden(7,7)).isTrue();
    }

    @Test void 사용자가_발견한_H6의_세로와_대각선삼삼을_거절한다() {
        black(7,7,8,6,9,7,7,6);
        cells[6][6]=2; cells[7][6]=2; cells[7][8]=2; cells[10][8]=2;
        assertThat(forbidden(7,5)).isTrue();
    }

    @Test void 백돌이나_판끝으로_막힌삼은_삼삼이아니다() {
        black(6,7,8,7,7,6,7,8); cells[7][5]=2;
        assertThat(forbidden(7,7)).isFalse();
        int[][] edge = new int[15][15];
        edge[1][0]=1; edge[1][2]=1; edge[0][1]=1; edge[2][1]=1; edge[1][1]=1;
        assertThat(new RenjuRules(edge).forbidden(1,1)).isFalse();
    }

    @Test void 서로다른_두사는_한쪽끝이_막혀도_사사다() {
        black(5,7,6,7,8,7,7,5,7,6,7,8); cells[7][4]=2; cells[4][7]=2;
        assertThat(forbidden(7,7)).isTrue();
    }

    @Test void 같은축의_서로다른_끊긴사도_사사다() {
        black(3,7,5,7,6,7,9,7);
        assertThat(forbidden(7,7)).isTrue();
    }

    @Test void 열린사의_양끝을_사사로_중복계산하지않는다() {
        black(5,7,6,7,8,7);
        assertThat(forbidden(7,7)).isFalse();
    }

    @Test void 사삼은_합법이다() {
        black(5,7,6,7,8,7,7,6,7,8);
        assertThat(forbidden(7,7)).isFalse();
    }

    @Test void 여섯목은_금수다() {
        black(4,7,5,7,6,7,8,7,9,7);
        assertThat(forbidden(7,7)).isTrue();
    }

    @Test void 같은수의_정확한오목은_금수보다_우선한다() {
        black(3,7,4,7,5,7,6,7,7,4,7,5,7,6,7,8,7,9);
        assertThat(forbidden(7,7)).isFalse();
    }

    @Test void 확장하면_장목이되는_삼은_가짜삼이다() {
        black(6,7,8,7,7,6,7,8);
        // 가로 삼의 두 확장점(5,7)/(9,7)이 모두 세로 장목이다.
        for(int x : new int[]{5,9}) black(x,4,x,5,x,6,x,8,x,9);
        assertThat(forbidden(7,7)).isFalse();
    }

    @Test void 확장하면_사사가되는_삼은_가짜삼이다() {
        black(6,7,8,7,7,6,7,8);
        for(int x : new int[]{5,9}) black(x,5,x,6,x,8);
        assertThat(forbidden(7,7)).isFalse();
    }

    @Test void 확장하면_삼삼이되는_삼도_재귀로_가려낸다() {
        // 중심 세로 삼은 진짜. 가로 삼의 양 확장은 세로/대각 삼삼이어서 가짜다.
        black(6,7,8,7,7,6,7,8,5,6,5,8,4,8,6,6,9,6,9,8,8,6,10,8);
        assertThat(forbidden(7,7)).isFalse();
    }

    @Test void 끝점이_장목이되는_모양은_열린사가아니다() {
        black(6,7,8,7,11,7,7,6,7,8); cells[7][4]=2;
        // 9에 확장한 6,7,8,9는 10에 두면 11까지 연결되어 장목. 5 확장은 4에 막힘.
        assertThat(forbidden(7,7)).isFalse();
    }

    @Test void 백은_삼삼과_사사_제한이없다() {
        OmokBoard board = new OmokBoard();
        for(int[] p : new int[][]{{6,7},{8,7},{7,6},{7,8},{7,7}}) board.place(OmokBoard.Stone.WHITE,p[0],p[1]);
        assertThat(board.snapshot().moveCount()).isEqualTo(5);
    }

    private void black(int... xy) { for(int i=0;i<xy.length;i+=2) cells[xy[i+1]][xy[i]]=1; }
    private boolean forbidden(int x,int y) {
        cells[y][x]=1;
        var before = java.util.Arrays.deepToString(cells);
        boolean result = new RenjuRules(cells).forbidden(x,y);
        assertThat(java.util.Arrays.deepToString(cells)).isEqualTo(before);
        return result;
    }
}
