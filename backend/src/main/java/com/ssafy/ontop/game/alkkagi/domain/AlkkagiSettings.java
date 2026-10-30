package com.ssafy.ontop.game.alkkagi.domain;

/** 원작 수치가 아닌 로컬 물리 검증값. 공원 물리 설정과 공유하지 않는다. */
public record AlkkagiSettings(double halfWidth, double halfHeight, double stepSeconds,
        double deceleration, double restitution, double maximumImpulse, double stopSpeed,
        int settleSteps, int maximumSimulationSteps, long turnMillis, long matchMillis) {

    public AlkkagiSettings {
        if (!Double.isFinite(halfWidth) || !Double.isFinite(halfHeight) || halfWidth < 4.5 || halfHeight < 5
                || !Double.isFinite(stepSeconds) || stepSeconds < 0.001 || stepSeconds > 0.02
                || !Double.isFinite(deceleration) || deceleration <= 0
                || !Double.isFinite(restitution) || restitution < 0 || restitution > 1
                || !Double.isFinite(maximumImpulse) || maximumImpulse <= 0 || maximumImpulse > 30
                || !Double.isFinite(stopSpeed) || stopSpeed <= 0 || stopSpeed > 0.1
                || settleSteps < 1 || maximumSimulationSteps < settleSteps
                || turnMillis < 1 || matchMillis < turnMillis) {
            throw new IllegalArgumentException("알까기 물리 설정을 확인해주세요.");
        }
    }

    public static AlkkagiSettings provisional() {
        // 빠른 타격 후 짧게 감속한다. 원작 실측이 아닌 사용자 손맛 검수용 설정이다.
        return new AlkkagiSettings(4.5, 5, 1.0 / 120, 18.0, 0.55, 12, 0.025,
                24, 3600, 30_000, 720_000);
    }
}
