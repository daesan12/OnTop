package com.ssafy.ontop.game.farkle.service;

import java.time.Instant;
import java.util.List;

// 서버 승패 판정이다. 재화 지급·정산 커밋 알림은 아니다.
public record FarkleGameFinished(String gameId, String tableId, long version, List<Long> players,
        List<Long> scores, Long winnerUserId, String endReason, Instant endedAt) {
    public FarkleGameFinished {
        players = List.copyOf(players);
        scores = List.copyOf(scores);
    }
}
