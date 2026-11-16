package com.ssafy.ontop.world.mobility;

public enum VehicleKind {
    BICYCLE(11, 1, -1), SCOOTER(14, 2, 1);

    private final int speed;
    private final int rate;
    private final int side;

    VehicleKind(int speed, int rate, int side) {
        this.speed = speed;
        this.rate = rate;
        this.side = side;
    }

    public int speed() { return speed; }
    public int rate() { return rate; }
    public int side() { return side; }
}
