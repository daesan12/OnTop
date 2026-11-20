package com.ssafy.ontop.world.winter;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.service.WorldFacilityService.Pose;
import java.util.ArrayList;
import java.util.List;

/** 생성된 최신 맵의 고정 항로. 클라이언트 좌표나 조종 입력은 받지 않는다. */
public record SleighRoute(long durationMs, List<Pose> points) {
    public SleighRoute {
        points = List.copyOf(points);
        if (durationMs < 10_000 || durationMs > 120_000 || points.size() < 3 || points.size() > 2000
                || points.stream().anyMatch(p -> !Double.isFinite(p.x()) || !Double.isFinite(p.y())
                        || !Double.isFinite(p.z())) || distance(points.getFirst(), points.getLast()) > .01) {
            throw new IllegalArgumentException("썰매 순환 항로를 확인해주세요.");
        }
    }

    public static SleighRoute from(JsonNode node) {
        if (node.isMissingNode()) return null;
        var points = new ArrayList<Pose>();
        for (JsonNode p : node.path("points")) {
            for (String key : List.of("x", "y", "z")) {
                if (!p.path(key).isNumber()) throw new IllegalArgumentException("썰매 항로 좌표가 필요합니다.");
            }
            points.add(new Pose(p.path("x").asDouble(), p.path("y").asDouble(), p.path("z").asDouble(), 0));
        }
        return new SleighRoute(node.path("durationMs").asLong(), points);
    }

    public Pose pose(long elapsedMs) {
        int count = points.size() - 1;
        double u = Math.clamp((double) elapsedMs / durationMs * count, 0, count);
        int i = Math.min(count - 1, (int) u);
        double f = u - i;
        Pose a = points.get(i), b = points.get(i + 1);
        Pose before = points.get(Math.max(0, i - 2)), after = points.get(Math.min(count, i + 3));
        double dx = after.x() - before.x(), dz = after.z() - before.z();
        return new Pose(a.x() + (b.x() - a.x()) * f, a.y() + (b.y() - a.y()) * f,
                a.z() + (b.z() - a.z()) * f, Math.hypot(dx, dz) < .01 ? Math.PI : Math.atan2(dx, dz));
    }

    private static double distance(Pose a, Pose b) {
        return Math.sqrt(Math.pow(a.x() - b.x(), 2) + Math.pow(a.y() - b.y(), 2) + Math.pow(a.z() - b.z(), 2));
    }
}
