package com.ssafy.ontop.game.result;

import java.time.Instant;

/** 공개 캐릭터 연출 사건. 경기 결과·이탈 영속화 이벤트와 분리한다. */
public record GameDefeatConfirmed(String eventId, String gameId, String tableId, String gameCode,
        long version, long userId, Kind kind, int remainingBefore, Instant occurredAt,
        GameDepartureReason leaveReason) {
    public GameDefeatConfirmed(String eventId, String gameId, String tableId, String gameCode,
            long version, long userId, Kind kind, int remainingBefore, Instant occurredAt) {
        this(eventId, gameId, tableId, gameCode, version, userId, kind, remainingBefore, occurredAt,
                kind == Kind.FORFEIT ? GameDepartureReason.EXPLICIT_LEAVE : null);
    }

    public enum Kind {
        FORFEIT, DEFEAT
    }
}
