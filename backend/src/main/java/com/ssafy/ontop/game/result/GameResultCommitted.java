package com.ssafy.ontop.game.result;

import java.util.Objects;

// 결과 저장 또는 정산 커밋 성공 뒤 본인별 결과를 발행한다. 클라이언트 입력으로 만들지 않는다.
public record GameResultCommitted(GameResultView result) {
    public GameResultCommitted {
        Objects.requireNonNull(result);
    }
}
