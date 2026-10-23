package com.ssafy.ontop.game.start;

import java.util.UUID;

/**
 * A가 호출하고 B가 구현하는 경기 시작 경계.
 * B는 전원 참가 기록과 기본 판돈 1엽전 예약을 원자적으로 커밋한 뒤에만 RESERVED를 반환한다.
 * 시작 시 보유 잔액은 차감하지 않고 예약분을 사용 가능 잔액에서 제외한다.
 * 실제 차감·예약 해제·승자 지급은 경기 종료 정산 트랜잭션에서 처리한다.
 * 같은 startAttemptId는 예약을 중복 반영하지 않으며 findStartResult는 저장된 결과만 조회한다.
 * REJECTED는 참가 기록·예약이 반영되지 않았음이 확정된 경우에만 반환한다.
 */
public interface GameStartGateway {

    GameStartResult startGame(GameStartCommand command);

    GameStartResult findStartResult(UUID startAttemptId);
}
