package com.ssafy.ontop.game.action;

public interface GameActionGateway {

    // 경기 잠금 안에서 참가 자격·턴·버전·입력을 검사하고 행동 ID 중복 제거와 변경을 함께 수행한다.
    // 같은 사용자/경기/actionId의 같은 내용은 기존 결과, 다른 내용은 충돌로 처리한다.
    GameActionResult apply(GameActionCommand command);

    enum Rejection {
        ACCESS_DENIED, INVALID_ACTION, NOT_YOUR_TURN, STALE_VERSION, ACTION_ID_CONFLICT
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
