package com.ssafy.ontop.game.result;

import java.time.Instant;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/** 엔진 잠금 안에서만 사용한다. 중도 이탈 사유를 최종 결과에도 보존한다. */
public final class GameLifecycle {
    private final Map<String, Map<Long, GameParticipantLeft>> departures = new HashMap<>();

    public void left(String gameId, String tableId, String gameCode, long version, long userId,
            GameDepartureReason reason, Instant at, List<Object> notices) {
        var players = departures.computeIfAbsent(gameId, ignored -> new HashMap<>());
        if (!players.containsKey(userId)) {
            var event = new GameParticipantLeft(gameId + ":left:" + userId, gameId, tableId, gameCode,
                    version, userId, reason, at);
            players.put(userId, event);
            notices.add(event);
        }
    }

    public GameFinished finished(String gameId, String tableId, String gameCode, long version,
            List<Long> players, List<Long> winners, String endReason, Instant endedAt) {
        Map<Long, GameParticipantLeft> left = departures.getOrDefault(gameId, Map.of());
        var results = players.stream().map(userId -> {
            GameParticipantLeft departure = left.get(userId);
            GameFinished.Result result = departure != null ? GameFinished.Result.FORFEIT
                    : winners.isEmpty() ? GameFinished.Result.DRAW
                    : winners.contains(userId) ? GameFinished.Result.WIN : GameFinished.Result.LOSE;
            return new GameFinished.Participant(userId, result, departure == null ? null : departure.leaveReason(),
                    departure == null ? null : departure.leftAt());
        }).toList();
        return new GameFinished(gameId + ":finished", gameId, tableId, gameCode, version,
                results, endReason, endedAt);
    }
}
