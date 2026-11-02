package com.ssafy.ontop.game.alkkagi.domain;

/** 조작 응답·출발 속도·충돌 질량을 분리한 로컬 실험 모델. 원작 계수가 아니다. */
public record AlkkagiPhysics(Profile small, Profile middle, Profile king, double inputBoost) {
    public AlkkagiPhysics {
        if (small == null || middle == null || king == null || !Double.isFinite(inputBoost)
                || inputBoost < 0 || inputBoost > 1) throw new IllegalArgumentException("INVALID_PHYSICS");
    }
    public record Profile(double radius, double mass, double maximumSpeed) {
        public Profile {
            if (!Double.isFinite(radius) || radius <= 0 || !Double.isFinite(mass) || mass <= 0
                    || !Double.isFinite(maximumSpeed) || maximumSpeed <= 0 || maximumSpeed > 50)
                throw new IllegalArgumentException("INVALID_PIECE_PROFILE");
        }
    }
    public static AlkkagiPhysics experimental() {
        return new AlkkagiPhysics(new Profile(.24,.8,12), new Profile(.32,2.4,11),
                new Profile(.43,6.4,10), .5);
    }
    public Profile profile(String type) {
        return switch (type) {
            case "士", "兵", "卒" -> small;
            case "漢", "楚" -> king;
            case "車", "馬", "象", "包" -> middle;
            default -> throw new IllegalArgumentException("UNKNOWN_PIECE_TYPE");
        };
    }
    public double response(double power) {
        if (!Double.isFinite(power) || power < 0 || power > 1) throw new IllegalArgumentException("INVALID_POWER");
        // sqrt와 달리 원점 기울기가 유한해서 아주 짧은 드래그가 급발사되지 않는다.
        return power * (1 + inputBoost * (1 - power));
    }
    public double maximumSpeed(double referenceImpulse, Profile profile) {
        // 기존 로컬 TUNE 필드 maximumImpulse는 호환상 유지. 12가 기본 속도 배율1이다.
        return profile.maximumSpeed() * (referenceImpulse / 12);
    }
    public double launchImpulse(double referenceImpulse, double power, Profile profile) {
        return profile.mass() * maximumSpeed(referenceImpulse, profile) * response(power);
    }
}
