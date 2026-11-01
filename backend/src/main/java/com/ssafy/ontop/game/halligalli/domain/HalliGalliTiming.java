package com.ssafy.ontop.game.halligalli.domain;

import java.time.Duration;

// 턴 제한 5초는 확정값이다. 종 성공 결과 연출 1초는 팀 확정 전 제안값이라 엔진 설정에서 바꿀 수 있게 둔다.
public record HalliGalliTiming(Duration turnLimit, Duration resultPause) {
    public static final HalliGalliTiming DEFAULT = new HalliGalliTiming(Duration.ofSeconds(5), Duration.ofSeconds(1));

    public HalliGalliTiming {
        if (turnLimit == null || resultPause == null || turnLimit.isNegative() || turnLimit.isZero()
                || resultPause.isNegative()) {
            throw new IllegalArgumentException("할리갈리 턴·연출 시간을 확인해주세요.");
        }
    }
}
