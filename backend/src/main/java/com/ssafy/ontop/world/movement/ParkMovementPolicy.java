package com.ssafy.ontop.world.movement;

import com.fasterxml.jackson.databind.JsonNode;
import com.jme3.math.Vector3f;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

/** Validated map-owned exclusions; client coordinates cannot define a correction region. */
final class ParkMovementPolicy {
    private static final double FURNITURE_CONTACT_GAP = .015;
    private static final double CONTAINMENT_TOLERANCE = 1e-6;

    private record Furniture(String id, double x, double z, double bottom, double top,
            double halfX, double halfZ, double cos, double sin) {
        double localX(double dx, double dz) {
            return dx * cos - dz * sin;
        }

        double localZ(double dx, double dz) {
            return dx * sin + dz * cos;
        }

        static Furniture fromBox(JsonNode box) {
            var center = box.path("center");
            var half = box.path("half");
            double y = center.get(1).asDouble(), halfY = half.get(1).asDouble();
            double yaw = box.path("yaw").asDouble();
            return new Furniture(box.path("id").asText(), center.get(0).asDouble(), center.get(2).asDouble(),
                    y - halfY, y + halfY, half.get(0).asDouble(), half.get(2).asDouble(),
                    Math.cos(yaw), Math.sin(yaw));
        }

        boolean contains(Furniture detail) {
            if (detail.bottom() < bottom - CONTAINMENT_TOLERANCE || detail.top() > top + CONTAINMENT_TOLERANCE) {
                return false;
            }
            double dx = detail.x() - x, dz = detail.z() - z;
            double cosRelative = Math.abs(detail.cos() * cos + detail.sin() * sin);
            double sinRelative = Math.abs(detail.sin() * cos - detail.cos() * sin);
            return Math.abs(localX(dx, dz)) + detail.halfX() * cosRelative + detail.halfZ() * sinRelative
                        <= halfX + CONTAINMENT_TOLERANCE
                    && Math.abs(localZ(dx, dz)) + detail.halfX() * sinRelative + detail.halfZ() * cosRelative
                        <= halfZ + CONTAINMENT_TOLERANCE;
        }
    }

    private final JsonNode data;
    private final List<Furniture> furniture = new ArrayList<>();
    private final Map<String, List<String>> furnitureDetailOwners = new HashMap<>();
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
            for (JsonNode box : data.path("boxes")) if (box.path("id").asText().matches("table-\\d+-(top|chair-[0-7])")) {
                var shape = Furniture.fromBox(box);
                require(Math.abs(shape.top() - shape.bottom() - furniturePolicy.path("movementHeight").asDouble())
                        < 1e-6,
                        "가구 차단 높이와 형상이 다릅니다.");
                furniture.add(shape);
            }
            require(!furniture.isEmpty(), "가구 차단 형상이 없습니다.");
            for (JsonNode box : data.path("boxes")) {
                if (!box.path("id").asText().startsWith("park-prop-")) {
                    continue;
                }
                var detail = Furniture.fromBox(box);
                var owners = furniture.stream().filter(owner -> owner.contains(detail)).map(Furniture::id).toList();
                if (!owners.isEmpty()) {
                    furnitureDetailOwners.put(detail.id(), owners);
                }
            }
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
    boolean managesCorrectionShape(String id, Predicate<String> active) {
        // An active furniture box already bounds its fully contained tabletop and leg shapes.
        return (!fountain.isMissingNode() && "fountain-basin".equals(id))
                || furniture.stream().anyMatch(box -> box.id().equals(id))
                || furnitureDetailOwners.getOrDefault(id, List.of()).stream().anyMatch(active);
    }

    /** Limit a horizontal step to the first active furniture boundary, before Bullet attempts to step up. */
    Vector3f limitFurnitureTravel(Vector3f position, Vector3f step, Predicate<String> active) {
        double firstHit = Double.POSITIVE_INFINITY;
        double tolerance = furniturePolicy.path("landingHeightTolerance").asDouble();
        for (Furniture box : furniture) {
            if (position.y - foot > box.top() + tolerance || position.y + foot < box.bottom()) {
                continue;
            }
            double dx = position.x - box.x(), dz = position.z - box.z();
            double x = box.localX(dx, dz), z = box.localZ(dx, dz);
            double hx = box.halfX() + radius, hz = box.halfZ() + radius;
            // An existing overlap belongs to the recovery path, and must not trap outward motion.
            if (Math.abs(x) < hx && Math.abs(z) < hz) {
                continue;
            }
            double vx = box.localX(step.x, step.z), vz = box.localZ(step.x, step.z);
            double start = Math.max(0, Math.max(slabTime(x, vx, hx, true), slabTime(z, vz, hz, true)));
            double end = Math.min(slabTime(x, vx, hx, false), slabTime(z, vz, hz, false));
            if (start <= 1 && start < firstHit && start < end && active.test(box.id())) {
                firstHit = start;
            }
        }
        if (firstHit > 1) {
            return step;
        }
        double distance = Math.hypot(step.x, step.z);
        double allowed = firstHit * distance - FURNITURE_CONTACT_GAP;
        return allowed <= 1e-5 ? Vector3f.ZERO : step.mult((float) (allowed / distance));
    }

    private static double slabTime(double origin, double delta, double halfSize, boolean entry) {
        if (Math.abs(delta) < 1e-8) {
            // A parallel segment outside the slab has no intersection.
            if (Math.abs(origin) >= halfSize) {
                return entry ? Double.POSITIVE_INFINITY : Double.NEGATIVE_INFINITY;
            }
            return entry ? Double.NEGATIVE_INFINITY : Double.POSITIVE_INFINITY;
        }
        double a = (-halfSize - origin) / delta, b = (halfSize - origin) / delta;
        return entry ? Math.min(a, b) : Math.max(a, b);
    }

    Vector3f slide(Vector3f p, Predicate<String> active) {
        var result = p.clone();
        for (int pass = 0; pass < 4; pass++) {
            var before = result.clone();
            for (Furniture b : furniture) {
                if (!active.test(b.id())) continue;
                if (p.y - foot > b.top() + furniturePolicy.path("landingHeightTolerance").asDouble() || p.y + foot < b.bottom()) continue;
                double dx = result.x - b.x(), dz = result.z - b.z();
                double x = b.localX(dx, dz), z = b.localZ(dx, dz);
                double hx = b.halfX() + radius, hz = b.halfZ() + radius;
                if (Math.abs(x) >= hx || Math.abs(z) >= hz) continue;
                double gap = furniturePolicy.path("exitGap").asDouble();
                if (hx - Math.abs(x) < hz - Math.abs(z)) x = (x < 0 ? -1 : 1) * (hx + gap);
                else z = (z < 0 ? -1 : 1) * (hz + gap);
                result.x = (float) (b.x() + x * b.cos() + z * b.sin());
                result.z = (float) (b.z() - x * b.sin() + z * b.cos());
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
        for (Furniture b : furniture) {
            if (!active.test(b.id())) continue;
            double tolerance = furniturePolicy.path("landingHeightTolerance").asDouble();
            if (feet <= b.bottom() + tolerance || feet > b.top() + tolerance) continue;
            double dx = p.x - b.x(), dz = p.z - b.z(), gap = furniturePolicy.path("exitGap").asDouble() * 2;
            if (Math.abs(b.localX(dx, dz)) < b.halfX() + radius + gap
                    && Math.abs(b.localZ(dx, dz)) < b.halfZ() + radius + gap) return false;
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
