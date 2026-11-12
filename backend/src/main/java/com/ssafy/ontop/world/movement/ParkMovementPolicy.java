package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.JsonNode;
import com.jme3.math.Vector3f;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Predicate;

/** Validated map-owned exclusions; client coordinates cannot define a correction region. */
final class ParkMovementPolicy {
    private final JsonNode data;
    private final List<JsonNode> furniture = new ArrayList<>();
    private final JsonNode furniturePolicy, fountain;
    private final double foot, radius;
    ParkMovementPolicy(JsonNode data) {
        this.data = data;
        var movement = data.path("movement");
        radius = movement.path("radius").asDouble();
        foot = movement.path("halfHeight").asDouble() + radius + movement.path("offset").asDouble();
        furniturePolicy = data.path("furniturePolicy"); fountain = data.path("fountainPolicy");
        if (!furniturePolicy.isMissingNode()) {
            require("no-climb".equals(furniturePolicy.path("kind").asText())
                    && "slide-out".equals(furniturePolicy.path("landing").asText())
                    && furniturePolicy.path("characterRadiusIncluded").isBoolean()
                    && !furniturePolicy.path("characterRadiusIncluded").asBoolean(), "가구 차단 정책이 다릅니다.");
            positive(furniturePolicy, "movementHeight", 5); positive(furniturePolicy, "exitGap", .2);
            positive(furniturePolicy, "landingHeightTolerance", .3);
            for (JsonNode box : data.path("boxes")) if (box.path("id").asText().matches("table-\\d+-(top|chair-[0-3])")) {
                require(Math.abs(box.path("half").get(1).asDouble() * 2 - furniturePolicy.path("movementHeight").asDouble()) < 1e-6,
                        "가구 차단 높이와 형상이 다릅니다.");
                furniture.add(box);
            }
            require(!furniture.isEmpty(), "가구 차단 형상이 없습니다.");
        }
        if (!fountain.isMissingNode()) {
            require("no-climb".equals(fountain.path("kind").asText()) && "cylinder".equals(fountain.path("shape").asText())
                    && "slide-out".equals(fountain.path("landing").asText()) && "fountain-basin".equals(fountain.path("id").asText())
                    && fountain.path("characterRadiusIncluded").isBoolean() && !fountain.path("characterRadiusIncluded").asBoolean(),
                    "분수 차단 정책이 다릅니다.");
            positive(fountain, "radius", 20); positive(fountain, "exitGap", .2);
            require(number(fountain, "top") > number(fountain, "bottom"), "분수 높이가 다릅니다.");
            number(fountain, "x"); number(fountain, "z");
            JsonNode hull = null;
            for (JsonNode candidate : data.path("hulls")) if ("fountain-basin".equals(candidate.path("id").asText())) hull = candidate;
            require(hull != null, "분수 충돌 hull이 없습니다.");
            var vertices = hull.path("vertices");
            for (int i = 0; i < vertices.size(); i += 3) {
                double x = vertices.get(i).asDouble(), y = vertices.get(i + 1).asDouble(), z = vertices.get(i + 2).asDouble();
                require(Math.abs(Math.hypot(x - fountain.path("x").asDouble(), z - fountain.path("z").asDouble())
                        - fountain.path("radius").asDouble()) < 1e-5
                        && (Math.abs(y - fountain.path("top").asDouble()) < 1e-5 || Math.abs(y - fountain.path("bottom").asDouble()) < 1e-5),
                        "분수 정책과 충돌 hull이 다릅니다.");
            }
        }
        for (String key : List.of("pavilionJumpSpeed", "pavilionTunedJumpSpeed")) if (data.has(key)) {
            positive(data, key, 12);
            require(data.path("pavilions").isArray() && !data.path("pavilions").isEmpty(), "팔각정 위치가 없습니다.");
            for (JsonNode site : data.path("pavilions")) {
                number(site, "x"); number(site, "z"); number(site, "floor"); positive(site, "scale", 5);
                if (site.has("spectatorBenchTop")) {
                    double rise = number(site, "spectatorBenchTop") - site.path("floor").asDouble();
                    require(rise > 0 && rise < 2, "팔각정 관전자 벤치 높이가 올바르지 않습니다.");
                }
            }
        }
    }
    boolean manages(String id) {
        return (!fountain.isMissingNode() && "fountain-basin".equals(id))
                || furniture.stream().anyMatch(box -> box.path("id").asText().equals(id));
    }
    Vector3f slide(Vector3f p, Predicate<String> active) {
        var result = p.clone();
        for (int pass = 0; pass < 4; pass++) {
            var before = result.clone();
            for (JsonNode b : furniture) {
                if (!active.test(b.path("id").asText())) continue;
                var center = b.path("center"); var half = b.path("half");
                double bottom = center.get(1).asDouble() - half.get(1).asDouble(), top = center.get(1).asDouble() + half.get(1).asDouble();
                if (p.y - foot > top + furniturePolicy.path("landingHeightTolerance").asDouble() || p.y + foot < bottom) continue;
                double c = Math.cos(b.path("yaw").asDouble()), s = Math.sin(b.path("yaw").asDouble());
                double dx = result.x - center.get(0).asDouble(), dz = result.z - center.get(2).asDouble();
                double x = dx * c - dz * s, z = dx * s + dz * c;
                double hx = half.get(0).asDouble() + radius, hz = half.get(2).asDouble() + radius;
                if (Math.abs(x) >= hx || Math.abs(z) >= hz) continue;
                double gap = furniturePolicy.path("exitGap").asDouble();
                if (hx - Math.abs(x) < hz - Math.abs(z)) x = (x < 0 ? -1 : 1) * (hx + gap);
                else z = (z < 0 ? -1 : 1) * (hz + gap);
                result.x = (float) (center.get(0).asDouble() + x * c + z * s);
                result.z = (float) (center.get(2).asDouble() - x * s + z * c);
            }
            if (!fountain.isMissingNode() && p.y - foot <= fountain.path("top").asDouble() + .12 && p.y + foot >= fountain.path("bottom").asDouble()) {
                double dx = result.x - fountain.path("x").asDouble(), dz = result.z - fountain.path("z").asDouble();
                double distance = Math.hypot(dx, dz), limit = fountain.path("radius").asDouble() + radius + fountain.path("exitGap").asDouble();
                if (distance < limit - 1e-6) {
                    result.x = (float) (fountain.path("x").asDouble() + (distance > 1e-8 ? dx / distance : 0) * limit);
                    result.z = (float) (fountain.path("z").asDouble() + (distance > 1e-8 ? dz / distance : 1) * limit);
                }
            }
            if (result.distanceSquared(before) < 1e-10f) break;
        }
        return result;
    }
    boolean allowsSupport(Vector3f p, Predicate<String> active) {
        double feet = p.y - foot;
        for (JsonNode b : furniture) {
            if (!active.test(b.path("id").asText())) continue;
            var center = b.path("center"); var half = b.path("half");
            double tolerance = furniturePolicy.path("landingHeightTolerance").asDouble();
            if (feet <= center.get(1).asDouble() - half.get(1).asDouble() + tolerance || feet > center.get(1).asDouble() + half.get(1).asDouble() + tolerance) continue;
            double dx = p.x - center.get(0).asDouble(), dz = p.z - center.get(2).asDouble();
            double c = Math.cos(b.path("yaw").asDouble()), s = Math.sin(b.path("yaw").asDouble()), gap = furniturePolicy.path("exitGap").asDouble() * 2;
            if (Math.abs(dx * c - dz * s) < half.get(0).asDouble() + radius + gap
                    && Math.abs(dx * s + dz * c) < half.get(2).asDouble() + radius + gap) return false;
        }
        return fountain.isMissingNode() || feet <= fountain.path("bottom").asDouble() + .12 || feet > fountain.path("top").asDouble() + .12
                || Math.hypot(p.x - fountain.path("x").asDouble(), p.z - fountain.path("z").asDouble())
                >= fountain.path("radius").asDouble() + radius + 2 * fountain.path("exitGap").asDouble();
    }
    double jumpSpeed(Vector3f p, boolean tuned) {
        String key = tuned ? "pavilionTunedJumpSpeed" : "pavilionJumpSpeed";
        if (data.has(key)) for (JsonNode site : data.path("pavilions")) {
            double feet = p.y - foot;
            boolean onBench = site.has("spectatorBenchTop")
                    && Math.abs(feet - site.path("spectatorBenchTop").asDouble()) < .15;
            if ((Math.abs(feet - site.path("floor").asDouble()) < .15 || onBench)
                    && Math.hypot(p.x - site.path("x").asDouble(), p.z - site.path("z").asDouble()) < 4.5 * site.path("scale").asDouble() + .3)
                return data.path(key).asDouble();
        }
        return tuned ? 8 : data.path("movement").path("jumpSpeed").asDouble();
    }
    private static double number(JsonNode node, String key) {
        var value = node.path(key); require(value.isNumber() && Double.isFinite(value.asDouble()), "정책 숫자가 올바르지 않습니다: " + key); return value.asDouble();
    }
    private static double positive(JsonNode node, String key, double max) {
        double value = number(node, key); require(value > 0 && value <= max, "정책 범위를 확인해주세요: " + key); return value;
    }
    private static void require(boolean valid, String message) { if (!valid) throw new IllegalArgumentException(message); }
}
