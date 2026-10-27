package com.ssafy.ontop.game.result;

import java.time.Instant;

/** 공개 캐릭터 연출 사건. 경기 결과·이탈 영속화 이벤트와 분리한다. */
public record GameDefeatConfirmed(String eventId, String gameId, String tableId, String gameCode,
        long version, long userId, Kind kind, int remainingBefore, Instant occurredAt) {
    public enum Kind { FORFEIT, DEFEAT }
}
