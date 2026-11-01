package com.ssafy.ontop.game.halligalli.service;

import java.time.Instant;
import java.util.List;

// 게임 규칙의 승패 확정 알림. 공동 1위가 있으면 승자가 여러 명이다. DB 정산·재화 지급 알림과 구분한다.
public record HalliGalliGameFinished(String gameId, String tableId, long version, List<Long> players,
        List<Long> winnerUserIds, String endReason, Instant endedAt) {
    public HalliGalliGameFinished {
        players = List.copyOf(players);
        winnerUserIds = List.copyOf(winnerUserIds);
    }
}
