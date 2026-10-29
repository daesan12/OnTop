package com.ssafy.ontop.game.state;

import java.util.Optional;

// 경기 담당이 현재 참가/관전 자격을 검사한다. 접근 불가와 없는 경기는 모두 empty다.
public interface GameStateGateway {

    Optional<GameStateView> load(long userId, String gameId);
}
