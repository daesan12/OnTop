package com.ssafy.ontop.game.halligalli.service;

import com.ssafy.ontop.game.halligalli.domain.HalliGalliBellLog;
import java.time.Instant;
import java.util.List;

// 경기가 끝날 때 한 번 내는 참가자별 종 기록 요약. 행동 로그(GAME_PLAY_STATS)용이며 정산·승패와 무관하다.
public record HalliGalliBellStats(String gameId, String tableId, Instant endedAt,
        List<HalliGalliBellLog.Summary> players) {
    public HalliGalliBellStats {
        players = List.copyOf(players);
    }
}
