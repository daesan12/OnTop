package com.ssafy.ontop.game.alkkagi.domain;

/** 회전 직사각형 벽과 원형 알의 설치·재배치·원복 검사. */
final class AlkkagiWallGeometry {
    /** Separating-axis test for two rotated rectangles; touching edges are allowed. */
    static boolean overlaps(AlkkagiMatch.WallView a, AlkkagiMatch.WallView b) {
        double dx=b.x()-a.x(), dy=b.y()-a.y();
        double ac=Math.cos(a.angle()), as=Math.sin(a.angle()), bc=Math.cos(b.angle()), bs=Math.sin(b.angle());
        double[][] axes={{ac,as},{-as,ac},{bc,bs},{-bs,bc}};
        for (double[] axis : axes) {
            double ux=axis[0], uy=axis[1];
            double ar=Math.abs(ux*ac+uy*as)*a.length()/2+Math.abs(-ux*as+uy*ac)*a.thickness()/2;
            double br=Math.abs(ux*bc+uy*bs)*b.length()/2+Math.abs(-ux*bs+uy*bc)*b.thickness()/2;
            if (Math.abs(dx*ux+dy*uy)>=ar+br-1e-9) return false;
        }
        return true;
    }

    static boolean overlaps(double x, double y, double radius, AlkkagiMatch.WallView wall) {
        double dx = x - wall.x(), dy = y - wall.y();
        double c = Math.cos(wall.angle()), s = Math.sin(wall.angle());
        double localX = c * dx + s * dy, localY = -s * dx + c * dy;
        double ex = Math.max(0, Math.abs(localX) - wall.length() / 2);
        double ey = Math.max(0, Math.abs(localY) - wall.thickness() / 2);
        return ex * ex + ey * ey < radius * radius - 1e-9;
    }
}
