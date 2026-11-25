package com.ssafy.ontop.game.stonerumble.domain;

/** 상대 이동을 뺀 비둘기 선분과 몸통 캡슐의 첫 접촉. 반환값은 선분의 0~1 위치다. */
final class StonePigeonCollision {
    private static final double EPSILON = 1e-10;

    private StonePigeonCollision() {
    }

    static double contact(double x, double y, double z, double dx, double dy, double dz,
            double ax, double ay, double az, double bx, double by, double bz, double radius) {
        double ux = bx - ax, uy = by - ay, uz = bz - az;
        double ox = x - ax, oy = y - ay, oz = z - az;
        double length = ux * ux + uy * uy + uz * uz;
        if (length < EPSILON) {
            return sphere(ox, oy, oz, dx, dy, dz, radius);
        }
        double projection = ux * ox + uy * oy + uz * oz;
        double nearest = Math.max(0, Math.min(1, projection / length));
        double nx = ox - ux * nearest, ny = oy - uy * nearest, nz = oz - uz * nearest;
        if (nx * nx + ny * ny + nz * nz <= radius * radius) {
            return 0;
        }
        double speed = dx * dx + dy * dy + dz * dz;
        double along = ux * dx + uy * dy + uz * dz;
        double toward = ox * dx + oy * dy + oz * dz;
        double a = length * speed - along * along;
        double b = length * toward - projection * along;
        double c = length * (ox * ox + oy * oy + oz * oz - radius * radius) - projection * projection;
        double first = Math.min(sphere(ox, oy, oz, dx, dy, dz, radius),
                sphere(x - bx, y - by, z - bz, dx, dy, dz, radius));
        double discriminant = b * b - a * c;
        if (a > EPSILON && discriminant >= 0) {
            double at = (-b - Math.sqrt(discriminant)) / a;
            double height = projection + at * along;
            if (at >= 0 && at <= 1 && height >= 0 && height <= length) {
                first = Math.min(first, at);
            }
        }
        return first;
    }

    private static double sphere(double x, double y, double z, double dx, double dy, double dz, double radius) {
        double c = x * x + y * y + z * z - radius * radius;
        if (c <= 0) {
            return 0;
        }
        double a = dx * dx + dy * dy + dz * dz;
        double b = x * dx + y * dy + z * dz;
        double discriminant = b * b - a * c;
        if (a < EPSILON || discriminant < 0) {
            return Double.POSITIVE_INFINITY;
        }
        double at = (-b - Math.sqrt(discriminant)) / a;
        return at >= 0 && at <= 1 ? at : Double.POSITIVE_INFINITY;
    }
}
