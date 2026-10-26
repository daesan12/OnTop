package com.ssafy.ontop.feedback.config;

import java.util.Set;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("ontop.feedback")
public record FeedbackProperties(Set<Long> administratorIds, Double x, Double y, Double z) {
    public FeedbackProperties {
        administratorIds = administratorIds == null ? Set.of() : Set.copyOf(administratorIds);
        if (administratorIds.stream().anyMatch(id -> id == null || id <= 0)) {
            throw new IllegalArgumentException("소리함 관리자는 양수 회원 ID로 지정합니다.");
        }
        x = x == null ? -10.8 : x;
        y = y == null ? 0.8 : y;
        z = z == null ? 14.5 : z;
        if (!Double.isFinite(x) || !Double.isFinite(y) || !Double.isFinite(z)) {
            throw new IllegalArgumentException("소리함 위치는 유한한 좌표여야 합니다.");
        }
    }
}
