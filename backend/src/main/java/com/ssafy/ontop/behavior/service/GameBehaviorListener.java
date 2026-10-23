package com.ssafy.ontop.behavior.service;

import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.game.bridge.service.BridgeGameFinished;
import com.ssafy.ontop.game.farkle.service.FarkleGameFinished;
import com.ssafy.ontop.game.omok.service.OmokGameFinished;
import com.ssafy.ontop.game.onecard.service.OneCardGameFinished;
import java.time.Instant;
import java.util.List;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 엔진의 승패 판정 이벤트로 참가자별 GAME_ENDED를 남긴다. 정산 금액은 포함하지 않는다(GAME_SETTLED).
 * 사용자별 분석(첫 경기 완주 등)이 쉽도록 경기 하나를 참가자 수만큼 기록한다.
 */
@Component
public class GameBehaviorListener {

    private final BehaviorLog behaviorLog;

    public GameBehaviorListener(BehaviorLog behaviorLog) {
        this.behaviorLog = behaviorLog;
    }

    @EventListener
    public void finished(OmokGameFinished event) {
        List<Long> winners = event.winnerUserId() == null ? List.of() : List.of(event.winnerUserId());
        ended("OMOK", event.gameId(), event.tableId(), event.endReason(), event.endedAt(),
                List.of(event.blackUserId(), event.whiteUserId()), winners);
    }

    @EventListener
    public void finished(FarkleGameFinished event) {
        List<Long> winners = event.winnerUserId() == null ? List.of() : List.of(event.winnerUserId());
        ended("DICE", event.gameId(), event.tableId(), event.endReason(), event.endedAt(), event.players(), winners);
    }

    @EventListener
    public void finished(OneCardGameFinished event) {
        ended("ONE_CARD", event.gameId(), event.tableId(), event.endReason(), event.endedAt(), event.players(),
                event.winnerUserIds());
    }

    @EventListener
    public void finished(BridgeGameFinished event) {
        ended("LIAR_BRIDGE", event.gameId(), event.tableId(), event.endReason(), event.endedAt(), event.players(),
                event.winnerUserIds());
    }

    private void ended(String gameCode, String gameId, String tableId, String endReason, Instant endedAt,
            List<Long> players, List<Long> winners) {
        for (Long player : players) {
            behaviorLog.record(() -> BehaviorEvent.builder(BehaviorEventType.GAME_ENDED, endedAt)
                    .userId(player)
                    .tableId(tableId)
                    .gameId(gameId)
                    .prop("gameCode", gameCode)
                    .prop("endReason", endReason)
                    .prop("players", players.size())
                    .prop("won", winners.contains(player))
                    .build());
        }
    }
}
