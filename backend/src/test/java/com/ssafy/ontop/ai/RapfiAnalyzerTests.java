package com.ssafy.ontop.ai;

import com.ssafy.ontop.game.omok.domain.OmokBoard;
import java.nio.file.Path;
import java.util.ArrayList;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

class RapfiAnalyzerTests {
    @Test void installedEngineAnalyzesBothSidesAndUsesRenjuLegalMoves() {
        String path=System.getenv("AI_LAB_RAPFI_PATH");
        assumeTrue(path!=null && java.nio.file.Files.isRegularFile(Path.of(path)),"AI_LAB_RAPFI_PATH 미설정: 실제 Rapfi 검증 제외");
        var engine=new RapfiAnalyzer(Path.of(path),200);
        var board=new OmokBoard(); var moves=new ArrayList<OmokBoard.Move>();
        int[][] position={{5,7},{5,8},{6,7},{6,8},{7,7},{7,8},{8,7},{1,1}};
        for(int i=0;i<position.length;i++) {
            var stone=i%2==0?OmokBoard.Stone.BLACK:OmokBoard.Stone.WHITE;
            board.place(stone,position[i][0],position[i][1]); moves.add(new OmokBoard.Move(position[i][0],position[i][1],stone));
            if(i==6) {
                var white=engine.analyze(board.snapshot(),moves);
                assertThat(white.source()).isEqualTo("RAPFI");
                assertThat(white.advantage()).isEqualTo("BLACK");
                assertThat(white.blackEstimate()).isGreaterThan(.65);
            }
        }
        var black=engine.analyze(board.snapshot(),moves);
        assertThat(black.source()).isEqualTo("RAPFI_TACTICAL");
        assertThat(black.blackEstimate()).isNull();
        assertThat(black.advantage()).isEqualTo("BLACK");
        assertThat(black.bestMove()).isIn("4,7","9,7");
        assertThat(black.elapsedMs()).isLessThan(5000);
    }
}
