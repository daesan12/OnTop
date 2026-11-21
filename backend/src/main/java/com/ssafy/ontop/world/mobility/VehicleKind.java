package com.ssafy.ontop.world.mobility;

public enum VehicleKind {
    BICYCLE(11, 1, -1, 20), SCOOTER(14, 1, 1, 10);

    private final int speed;
    private final int rate;
    private final int side;
    private final int billingSeconds;

    VehicleKind(int speed, int rate, int side, int billingSeconds) {
        this.speed = speed;
        this.rate = rate;
        this.side = side;
        this.billingSeconds = billingSeconds;
    }

    public int speed() { return speed; }
    public int rate() { return rate; }
    public int side() { return side; }
    public int billingSeconds() { return billingSeconds; }
}
