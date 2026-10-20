package com.ssafy.ontop.game.action;

// 상태나 손패를 넣지 않는 처리 확인이다. 실제 상태는 사용자별 상태 조회로 받는다.
public record GameActionResult(long userId, String gameId, String actionId, long version) {

    public GameActionResult {
        if (userId <= 0 || gameId == null || gameId.isBlank() || gameId.length() > 120
                || actionId == null || actionId.isBlank() || actionId.length() > 64
                || version < 0 || version > 9_007_199_254_740_991L) {
            throw new IllegalArgumentException("경기 처리 결과를 확인해주세요.");
        }
    }
}
