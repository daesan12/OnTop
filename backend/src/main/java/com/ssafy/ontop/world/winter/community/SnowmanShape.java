package com.ssafy.ontop.world.winter.community;

/** 눈덩이의 다각형 꼭짓점끼리만 닿지 않도록 작은 구의 일부를 포갠다. */
public final class SnowmanShape {
    public static final double JOINT_INSET_RATIO = .45;

    private SnowmanShape() { }

    public record Stack(double baseY, double middleY, double headY, double height) { }

    public static Stack stack(double base, double middle, double head) {
        return stack(base, middle, head, JOINT_INSET_RATIO);
    }

    public static Stack stack(double base, double middle, double head, double jointInsetRatio) {
        double baseY = base;
        double middleY = baseY + base + middle - middle * jointInsetRatio;
        double headY = middleY + middle + head - head * jointInsetRatio;
        return new Stack(baseY, middleY, headY, headY + head);
    }
}
