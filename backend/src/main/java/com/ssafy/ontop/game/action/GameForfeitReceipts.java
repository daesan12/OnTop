package com.ssafy.ontop.game.action;

import java.util.HashMap;
import java.util.Map;

/** 엔진 잠금 안에서 사용한다. 버튼 재클릭도 경기·참가자당 한 번만 확정한다. */
public final class GameForfeitReceipts {
    private final Map<Player, Long> versions = new HashMap<>();

    public GameForfeitResult previous(GameForfeitCommand command) {
        Long version = versions.get(new Player(command.gameId(), command.userId()));
        return version == null ? null : result(command, version, true);
    }

    public GameForfeitResult accepted(GameForfeitCommand command, long version) {
        versions.put(new Player(command.gameId(), command.userId()), version);
        return result(command, version, false);
    }

    private GameForfeitResult result(GameForfeitCommand command, long version, boolean duplicate) {
        return new GameForfeitResult(command.userId(), command.gameId(), command.actionId(), version, duplicate);
    }

    private record Player(String gameId, long userId) {
    }
}
