package com.ssafy.ontop.game.result;

import java.time.Instant;

/** 게임 참가 자격 상실 알림. 경기 전체 종료나 재화 정산 완료 알림이 아니다. */
public record GameParticipantLeft(String eventId, String gameId, String tableId, String gameCode,
        long version, long userId, GameDepartureReason leaveReason, Instant leftAt) {
}
