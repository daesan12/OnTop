package com.ssafy.ontop.behavior.service;

import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.game.result.GameFinished;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 네 엔진이 공통으로 발행하는 최종 판정(GameFinished)으로 참가자별 GAME_ENDED를 남긴다.
 * 정산 금액은 포함하지 않는다(GAME_SETTLED). 사용자별 분석이 쉽도록 경기 하나를 참가자 수만큼 기록한다.
 */
@Component
public class GameBehaviorListener {

    private final BehaviorLog behaviorLog;

    public GameBehaviorListener(BehaviorLog behaviorLog) {
        this.behaviorLog = behaviorLog;
    }

    @EventListener
    public void finished(GameFinished event) {
        for (GameFinished.Participant participant : event.participants()) {
            behaviorLog.record(() -> BehaviorEvent.builder(BehaviorEventType.GAME_ENDED, event.endedAt())
                    .userId(participant.userId())
                    .tableId(event.tableId())
                    .gameId(event.gameId())
                    .prop("gameCode", event.gameCode())
                    .prop("endReason", event.endReason())
                    .prop("players", event.participants().size())
                    .prop("result", participant.result().name())
                    .prop("leaveReason", participant.leaveReason() == null ? null : participant.leaveReason().name())
                    .build());
        }
    }
}
