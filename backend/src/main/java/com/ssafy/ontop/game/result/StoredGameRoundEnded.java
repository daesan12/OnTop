package com.ssafy.ontop.game.result;

import java.util.Objects;

/** DB에 커밋된 결과 스냅샷에서만 생성한다. 공개 WebSocket 요청 메시지가 아니다. */
public record StoredGameRoundEnded(String tableId, GameResultView result) {
    public StoredGameRoundEnded {
        Objects.requireNonNull(result);
        if (tableId == null || tableId.isBlank() || tableId.length() > 120) {
            throw new IllegalArgumentException("저장된 경기 테이블을 확인하세요.");
        }
    }
}
