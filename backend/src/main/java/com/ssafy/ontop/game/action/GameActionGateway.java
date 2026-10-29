package com.ssafy.ontop.game.action;

public interface GameActionGateway {

    // 경기 잠금 안에서 참가 자격·턴·버전·입력을 검사하고 행동 ID 중복 제거와 변경을 함께 수행한다.
    // 같은 사용자/경기/actionId의 같은 내용은 기존 결과, 다른 내용은 충돌로 처리한다.
    GameActionResult apply(GameActionCommand command);

    // 턴·상태 버전과 무관한 본인의 명시적 기권. 기존 입력 전용 구현체는 거절한다.
    default GameForfeitResult forfeit(GameForfeitCommand command) {
        throw new Rejected(Rejection.INVALID_ACTION);
    }

    enum Rejection {
        ACCESS_DENIED, INVALID_ACTION, NOT_YOUR_TURN, STALE_VERSION, ACTION_ID_CONFLICT, FORBIDDEN_MOVE,
        GAME_FINISHED, NOT_ACTIVE
    }

    final class Rejected extends RuntimeException {
        private final Rejection reason;

        public Rejected(Rejection reason) {
            super(java.util.Objects.requireNonNull(reason).name());
            this.reason = reason;
        }

        public Rejection reason() {
            return reason;
        }
    }
}
