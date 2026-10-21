package com.ssafy.ontop.game.state;

// 경기 담당이 상태 반영을 확정한 뒤 발행하는 내부 알림. 개인 상태나 클라이언트 수신자 목록을 담지 않는다.
public record GameStateChanged(String gameId, long version) {

    public GameStateChanged {
        if (gameId == null || gameId.isBlank() || gameId.length() > 120 || version < 0) {
            throw new IllegalArgumentException("경기 상태 변경 알림을 확인해주세요.");
        }
    }
}
