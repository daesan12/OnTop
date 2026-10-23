package com.ssafy.ontop.minigame.service;

import java.util.OptionalLong;

/**
 * 서버에서 검증·보관한 해당 사용자/세션의 최종 성공 개수만 반환한다.
 * 클라이언트 점수·경과 시간 추측을 검증 결과로 취급하지 않는다.
 * 결과는 최종 확정된 불변 값이어야 하며 이 조회에서 보상을 지급하지 않는다.
 */
public interface VerifiedMinigameResultSource {
    OptionalLong findCompletedCount(long userId, long minigameSessionId);
}
