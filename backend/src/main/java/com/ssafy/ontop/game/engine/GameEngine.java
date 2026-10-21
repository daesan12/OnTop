package com.ssafy.ontop.game.engine;

import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.state.GameStateGateway;

/** 한 경기의 입력·상태·복구는 같은 엔진에서 처리한다. */
public interface GameEngine extends GameActionGateway, GameStateGateway, GameRecoveryGateway {
}
