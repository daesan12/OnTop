package com.ssafy.ontop.game.result;

import com.ssafy.ontop.game.bridge.service.BridgeGameFinished;
import com.ssafy.ontop.game.farkle.service.FarkleGameFinished;
import com.ssafy.ontop.game.omok.service.OmokGameFinished;
import com.ssafy.ontop.game.onecard.service.OneCardGameFinished;
import java.util.List;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** 서버 종료 판정과 저장 결과 전송을 잇는다. 승패·정산 금액을 다시 계산하지 않는다. */
@Component
@Profile("local")
public class GameFinishedResultListener {
    private final GameResultService results;

    public GameFinishedResultListener(GameResultService results) {
        this.results = results;
    }

    @EventListener
    public void finished(OmokGameFinished event) {
        results.finished(event.gameId(), List.of(event.blackUserId(), event.whiteUserId()));
    }

    @EventListener
    public void finished(FarkleGameFinished event) {
        results.finished(event.gameId(), event.players());
    }

    @EventListener
    public void finished(OneCardGameFinished event) {
        results.finished(event.gameId(), event.players());
    }

    @EventListener
    public void finished(BridgeGameFinished event) {
        results.finished(event.gameId(), event.players());
    }
}
