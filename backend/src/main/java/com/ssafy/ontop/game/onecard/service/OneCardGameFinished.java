package com.ssafy.ontop.game.onecard.service;

import java.time.Instant;
import java.util.List;

// 게임 규칙의 승패 확정 알림. DB 정산·재화 지급 알림과 구분한다.
public record OneCardGameFinished(String gameId, String tableId, long version, List<Long> players,
        List<Long> winnerUserIds, String endReason, Instant endedAt) {
    public OneCardGameFinished {
        players = List.copyOf(players);
        winnerUserIds = List.copyOf(winnerUserIds);
    }
}
