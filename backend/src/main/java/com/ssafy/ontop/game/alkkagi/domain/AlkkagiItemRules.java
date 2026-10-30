package com.ssafy.ontop.game.alkkagi.domain;

/** 밸런스가 확정되지 않은 항목의 로컬 검수용 설정. 운영 규칙이 아니다. */
public record AlkkagiItemRules(double wallLength, double wallThickness, double wallMargin,
        double relocateDistance, double powerMultiplier, double growScale, double shrinkScale,
        double defendMassMultiplier, int effectOpponentTurns) {
    public AlkkagiItemRules {
        if (!range(wallLength, .5, 3) || !range(wallThickness, .1, .5) || !range(wallMargin, .02, .4)
                || !range(relocateDistance, .5, 3) || !range(powerMultiplier, 1.05, 2)
                || !range(growScale, 1.05, 1.5) || !range(shrinkScale, .5, .95)
                || !range(defendMassMultiplier, 1.1, 4) || effectOpponentTurns < 1 || effectOpponentTurns > 3)
            throw new IllegalArgumentException("INVALID_ITEM_RULES");
    }
    private static boolean range(double value, double min, double max) {
        return Double.isFinite(value) && value >= min && value <= max;
    }
    public static AlkkagiItemRules localPreview() {
        return new AlkkagiItemRules(1.6, .18, .12, 2, 1.5, 1.25, .8, 2, 1);
    }
}
