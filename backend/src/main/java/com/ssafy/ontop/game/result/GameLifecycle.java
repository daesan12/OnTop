package com.ssafy.ontop.game.result;

import java.time.Instant;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 엔진 잠금 안에서만 사용한다. 중도 이탈 사유를 최종 결과에도 보존한다. */
public final class GameLifecycle {
    private final Map<String, Map<Long, GameParticipantLeft>> departures = new HashMap<>();
    private final Map<String, Set<Long>> reactions = new HashMap<>();

    public void left(String gameId, String tableId, String gameCode, long version, long userId,
            GameDepartureReason reason, Instant at, int participantCount, List<Object> notices) {
        int remaining = participantCount - departures.getOrDefault(gameId, Map.of()).size();
        boolean first = !departures.getOrDefault(gameId, Map.of()).containsKey(userId);
        left(gameId, tableId, gameCode, version, userId, reason, at, notices);
        if (first) {
            react(gameId, tableId, gameCode, version, userId, GameDefeatConfirmed.Kind.FORFEIT,
                    remaining, at, notices, reason);
        }
    }

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
            List<Long> players, List<Long> winners, String endReason, Instant endedAt, List<Object> notices) {
        GameFinished event = finished(gameId, tableId, gameCode, version, players, winners, endReason, endedAt);
        int remaining = players.size() - departures.getOrDefault(gameId, Map.of()).size();
        for (var player : event.participants()) {
            if (player.result() == GameFinished.Result.LOSE) {
                react(gameId, tableId, gameCode, version, player.userId(), GameDefeatConfirmed.Kind.DEFEAT,
                        remaining, endedAt, notices, null);
            }
        }
        return event;
    }

    private void react(String gameId, String tableId, String gameCode, long version, long userId,
            GameDefeatConfirmed.Kind kind, int remaining, Instant at, List<Object> notices,
            GameDepartureReason reason) {
        if (reactions.computeIfAbsent(gameId, ignored -> new HashSet<>()).add(userId)) {
            notices.add(new GameDefeatConfirmed(gameId + ":reaction:" + userId, gameId, tableId, gameCode,
                    version, userId, kind, remaining, at, reason));
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
