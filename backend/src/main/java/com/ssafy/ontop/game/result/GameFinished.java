package com.ssafy.ontop.game.result;

import java.time.Instant;
import java.util.List;

/** 네 엔진의 최종 판정 계약. DB 저장·예약금 해제·정산은 별도 소비자가 담당한다. */
public record GameFinished(String eventId, String gameId, String tableId, String gameCode, long version,
        List<Participant> participants, String endReason, Instant endedAt) {
    public GameFinished {
        participants = List.copyOf(participants);
    }

    public record Participant(long userId, Result result, GameDepartureReason leaveReason, Instant leftAt) {
    }

    public enum Result { WIN, LOSE, DRAW, FORFEIT }
}
