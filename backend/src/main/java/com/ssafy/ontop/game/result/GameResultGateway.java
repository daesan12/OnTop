package com.ssafy.ontop.game.result;

import java.util.Optional;

public interface GameResultGateway {

    // 저장된 본인 참가 결과만 읽는다. 미종료·없는 경기·타인 경기는 모두 empty. 정산을 실행하지 않는다.
    Optional<GameResultView> load(long userId, String gameSessionId);
}
