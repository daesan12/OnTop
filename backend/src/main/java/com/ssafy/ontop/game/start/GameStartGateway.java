package com.ssafy.ontop.game.start;

import java.util.UUID;

// A가 호출하고 B가 구현할 내부 경계. 확정 성공은 커밋 후, 거절은 반영 없음이 확정된 경우에만 반환한다.
public interface GameStartGateway {

    GameStartResult startGame(GameStartCommand command);

    GameStartResult findStartResult(UUID startAttemptId);
}
