package com.ssafy.ontop.world.config;

import java.util.Map;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "ontop.world.proximity")
public record WorldProximityProperties(Double chatRadius, Double watchRadius, Map<String, Point> tables) {

    public WorldProximityProperties {
        chatRadius = chatRadius == null ? 20.0 : chatRadius;
        watchRadius = watchRadius == null ? 20.0 : watchRadius;
        if (!Double.isFinite(chatRadius) || chatRadius <= 0 || !Double.isFinite(watchRadius) || watchRadius <= 0) {
            throw new IllegalArgumentException("근거리 반경은 유한한 양수여야 합니다.");
        }
        tables = tables == null ? Map.of() : Map.copyOf(tables);
        if (tables.keySet().stream().anyMatch(String::isBlank)) {
            throw new IllegalArgumentException("테이블 ID가 필요합니다.");
        }
    }

    public record Point(Double x, Double z) {
        public Point {
            if (x == null || z == null || !Double.isFinite(x) || !Double.isFinite(z)) {
                throw new IllegalArgumentException("테이블 좌표는 유한해야 합니다.");
            }
        }
    }
}
