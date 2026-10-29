package com.ssafy.ontop.game.result;

/** Gateway에서 본인 저장 결과를 검증해 읽은 사실. 정산 실행 요청이 아니다. */
public record GameResultLoaded(GameResultView result) {
    public GameResultLoaded { java.util.Objects.requireNonNull(result); }
}
