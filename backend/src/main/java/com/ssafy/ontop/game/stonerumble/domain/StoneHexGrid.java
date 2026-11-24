package com.ssafy.ontop.game.stonerumble.domain;

/** FE의 layout.ts와 같은 꼭짓점이 위아래를 향하는 육각 축 좌표다. */
final class StoneHexGrid {
    static final String LAYOUT = "HEX_AXIAL_V2";
    static final double SPACING = 2.6;
    private static final double ROOT_THREE = Math.sqrt(3);

    private StoneHexGrid() {
    }

    static double x(int q, int r) {
        return SPACING * (q + r * 0.5);
    }

    static double z(int r) {
        return SPACING * ROOT_THREE * 0.5 * r;
    }

    static int ring(int q, int r) {
        return Math.max(Math.max(Math.abs(q), Math.abs(r)), Math.abs(q + r));
    }

    static Cell cell(double x, double z) {
        double r = z / (SPACING * ROOT_THREE * 0.5);
        double q = x / SPACING - r * 0.5;
        double s = -q - r;
        int roundedQ = (int) Math.floor(q + 0.5);
        int roundedR = (int) Math.floor(r + 0.5);
        int roundedS = (int) Math.floor(s + 0.5);
        double qError = Math.abs(roundedQ - q);
        double rError = Math.abs(roundedR - r);
        double sError = Math.abs(roundedS - s);
        if (qError > rError && qError > sError) {
            roundedQ = -roundedR - roundedS;
        } else if (rError > sError) {
            roundedR = -roundedQ - roundedS;
        }
        return new Cell(roundedQ, roundedR);
    }

    record Cell(int q, int r) {
    }
}
