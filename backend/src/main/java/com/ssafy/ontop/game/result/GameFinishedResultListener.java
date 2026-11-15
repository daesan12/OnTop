package com.ssafy.ontop.game.result;

import com.ssafy.ontop.game.bridge.service.BridgeGameFinished;
import com.ssafy.ontop.game.farkle.service.FarkleGameFinished;
import com.ssafy.ontop.game.halligalli.service.HalliGalliGameFinished;
import com.ssafy.ontop.game.omok.service.OmokGameFinished;
import com.ssafy.ontop.game.onecard.service.OneCardGameFinished;
import java.util.List;
import com.ssafy.ontop.table.service.TableHub;
import org.springframework.beans.factory.annotation.Autowired;
import java.util.Optional;
import com.ssafy.ontop.config.RuntimeProfiles;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** 서버 종료 판정과 저장 결과 전송을 잇는다. 승패·정산 금액을 다시 계산하지 않는다. */
@Component
@Profile(RuntimeProfiles.PRODUCT_FEATURE)
public class GameFinishedResultListener {
    private final GameResultService results;
    private final Optional<TableHub> tables;

    public GameFinishedResultListener(GameResultService results) {
        this(results, Optional.empty());
    }

    @Autowired
    public GameFinishedResultListener(GameResultService results, Optional<TableHub> tables) {
        this.results = results;
        this.tables = tables;
    }

    @EventListener
    public void finished(OmokGameFinished event) {
        tables.ifPresent(hub -> hub.roundEnded(event.tableId(), event.gameId()));
        results.finished(event.gameId(), List.of(event.blackUserId(), event.whiteUserId()));
    }

    @EventListener
    public void finished(FarkleGameFinished event) {
        tables.ifPresent(hub -> hub.roundEnded(event.tableId(), event.gameId()));
        results.finished(event.gameId(), event.players());
    }

    @EventListener
    public void finished(OneCardGameFinished event) {
        tables.ifPresent(hub -> hub.roundEnded(event.tableId(), event.gameId()));
        results.finished(event.gameId(), event.players());
    }

    @EventListener
    public void finished(BridgeGameFinished event) {
        tables.ifPresent(hub -> hub.roundEnded(event.tableId(), event.gameId()));
        results.finished(event.gameId(), event.players());
    }

    @EventListener
    public void finished(HalliGalliGameFinished event) {
        tables.ifPresent(hub -> hub.roundEnded(event.tableId(), event.gameId()));
        results.finished(event.gameId(), event.players());
    }

    @EventListener
    public void stored(StoredGameRoundEnded event) {
        // 엔진의 일회성 종료 통지가 유실되어도 DB 종결 정보로 SETTLING 진입을 복구한다.
        tables.ifPresent(hub -> hub.roundEnded(event.tableId(), event.result().gameSessionId()));
    }

    @EventListener
    public void finished(GameFinished event) {
        // 전용 알림이 없는 알까기와 돌탑은 공통 종료 알림으로 로비·결과를 연결한다.
        if (!"ALKKAGI".equals(event.gameCode()) && !"STONE_RUMBLE".equals(event.gameCode())) { return; }
        tables.ifPresent(hub -> hub.roundEnded(event.tableId(), event.gameId()));
        results.finished(event.gameId(), event.participants().stream().map(GameFinished.Participant::userId).toList());
    }
}
