package com.ssafy.ontop.game.reconnect;

import java.util.Optional;

/** 참가비 예약이 아직 해제되지 않은 사용자의 경기 기록을 읽는다. 상태를 변경하지 않는다. */
@FunctionalInterface
public interface ActiveGameLookup {
    Optional<ActiveGameRecord> findByUserId(long userId);
}
