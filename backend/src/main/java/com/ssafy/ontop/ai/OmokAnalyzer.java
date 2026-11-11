package com.ssafy.ontop.ai;

import com.ssafy.ontop.game.omok.domain.OmokBoard;
import java.util.List;

public interface OmokAnalyzer {
    /** blackEstimate is the engine's score-derived indicator, NOT measured human win probability. */
    record Analysis(String source, String advantage, Double blackEstimate, int depth, long elapsedMs,
                    String bestMove, String comment) { }
    Analysis analyze(OmokBoard.Snapshot board,List<OmokBoard.Move> moves);
    static Analysis unavailable() {
        return new Analysis("UNAVAILABLE","UNKNOWN",null,0,0,"","아직은 판세를 단정하기 어렵구먼.");
    }
    static Analysis finished(OmokBoard.Outcome outcome) {
        return new Analysis("SERVER_RESULT",outcome.name(),null,0,0,"",switch(outcome) {
            case BLACK_WIN -> "흑을 든 친구가 이겼구먼. 두 사람 모두 수고했네!";
            case WHITE_WIN -> "백을 든 친구가 이겼구먼. 두 사람 모두 수고했네!";
            case DRAW -> "마지막까지 팽팽했구먼. 무승부일세.";
            default -> "한 수 한 수 신중하게 두게나.";
        });
    }
}
