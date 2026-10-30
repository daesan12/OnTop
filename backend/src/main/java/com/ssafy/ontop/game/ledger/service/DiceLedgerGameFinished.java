package com.ssafy.ontop.game.ledger.service;

import java.time.Instant;
import java.util.List;

// 서버 승패 판정이다. 재화 지급·정산 커밋 알림은 아니다. totals는 players와 같은 좌석순이다.
public record DiceLedgerGameFinished(String gameId, String tableId, long version, List<Long> players,
        List<Long> totals, List<Long> winnerUserIds, String endReason, Instant endedAt) {
    public DiceLedgerGameFinished {
        players = List.copyOf(players);
        totals = List.copyOf(totals);
        winnerUserIds = List.copyOf(winnerUserIds);
    }
}
