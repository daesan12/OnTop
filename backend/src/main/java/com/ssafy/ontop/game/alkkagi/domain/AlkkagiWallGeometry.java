package com.ssafy.ontop.game.alkkagi.domain;

/** 회전 직사각형 벽과 원형 알의 설치·재배치·원복 검사. */
final class AlkkagiWallGeometry {
    static boolean overlaps(double x, double y, double radius, AlkkagiMatch.WallView wall) {
        double dx = x - wall.x(), dy = y - wall.y();
        double c = Math.cos(wall.angle()), s = Math.sin(wall.angle());
        double localX = c * dx + s * dy, localY = -s * dx + c * dy;
        double ex = Math.max(0, Math.abs(localX) - wall.length() / 2);
        double ey = Math.max(0, Math.abs(localY) - wall.thickness() / 2);
        return ex * ex + ey * ey < radius * radius - 1e-9;
    }
}
