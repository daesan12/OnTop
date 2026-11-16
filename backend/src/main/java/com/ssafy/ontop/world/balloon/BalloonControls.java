package com.ssafy.ontop.world.balloon;

import java.time.Duration;
import java.util.UUID;

public final class BalloonControls {
    private static final long EMPTY_DELAY = Duration.ofSeconds(3).toNanos();
    private static final long OFFER_LIFETIME = Duration.ofSeconds(10).toNanos();
    private static final long INPUT_LIFETIME = Duration.ofMillis(600).toNanos();

    private String mode;
    private String direction;
    private String altitude;
    private Offer offer;
    private Long emptySince;
    private Intent directionInput = Intent.STOPPED;
    private Intent altitudeInput = Intent.STOPPED;
    private long directionAt;
    private long altitudeAt;
    private boolean returning;

    BalloonControls(String mode, String host) {
        this.mode = mode;
        direction = host;
    }

    boolean split() { return mode.equals("split"); }
    boolean ready() { return !split() || direction != null && altitude != null; }

    void assignCopilot(String rider) {
        if (split() && altitude == null) altitude = rider;
    }

    void useSolo() {
        mode = "solo";
        altitude = null;
        offer = null;
    }

    int seat(String rider) {
        if (rider.equals(direction)) return 0;
        return rider.equals(altitude) ? 2 : -1;
    }

    boolean reserved(int seat) { return seat == 0 || split() && seat == 2; }

    boolean change(String rider, String action, String role, String peer, long at) {
        if (!role.equals("direction") && !(split() && role.equals("altitude"))) return false;
        boolean horizontal = role.equals("direction");
        String occupant = horizontal ? direction : altitude;
        if (offer != null && at >= offer.expiresAt) offer = null;
        switch (action) {
            case "claim" -> {
                if (occupant != null || seat(rider) >= 0) return false;
                assign(horizontal, rider);
            }
            case "leave" -> {
                if (!rider.equals(occupant)) return false;
                remove(rider, at);
            }
            case "offer" -> {
                if (!rider.equals(occupant) || peer == null || rider.equals(peer)) return false;
                offer = new Offer(UUID.randomUUID().toString(), role, rider, peer, at + OFFER_LIFETIME);
            }
            case "accept" -> {
                if (offer == null || !offer.role.equals(role) || !rider.equals(offer.to)
                        || !offer.from.equals(occupant) || !offer.id.equals(peer)) return false;
                if (seat(rider) >= 0) assign(!horizontal, occupant);
                assign(horizontal, rider);
            }
            case "return" -> {
                if (!rider.equals(occupant)) return false;
                returning = true;
            }
            default -> { return false; }
        }
        trackVacancy(at);
        return true;
    }

    private void assign(boolean horizontal, String rider) {
        if (horizontal) {
            direction = rider;
            directionInput = Intent.STOPPED;
        } else {
            altitude = rider;
            altitudeInput = Intent.STOPPED;
        }
        offer = null;
    }

    void remove(String rider, long at) {
        if (rider.equals(direction)) assign(true, null);
        if (rider.equals(altitude)) assign(false, null);
        if (offer != null && rider.equals(offer.to)) offer = null;
        trackVacancy(at);
    }

    private void trackVacancy(long at) {
        if (direction != null || altitude != null) emptySince = null;
        else if (emptySince == null) emptySince = at;
    }

    void steer(String rider, Intent intent, long at) {
        if (rider.equals(direction)) {
            directionInput = intent;
            directionAt = at;
        }
        if (split() && rider.equals(altitude)) {
            altitudeInput = intent;
            altitudeAt = at;
        }
    }

    Snapshot snapshot(long at) {
        Intent horizontal = at - directionAt < INPUT_LIFETIME ? directionInput : Intent.STOPPED;
        Intent vertical = !split() ? horizontal
                : at - altitudeAt < INPUT_LIFETIME ? altitudeInput : Intent.STOPPED;
        Long emptyMillis = emptySince == null ? null
                : Duration.ofNanos(Math.max(0, EMPTY_DELAY - (at - emptySince))).toMillis();
        return new Snapshot(mode, direction, altitude, emptyMillis,
                offer != null && at < offer.expiresAt ? offer : null,
                new Intent(horizontal.x, horizontal.z, vertical.lift), returning);
    }

    public record Intent(double x, double z, double lift) {
        static final Intent STOPPED = new Intent(0, 0, 0);
    }
    public record Offer(String id, String role, String from, String to,
            @com.fasterxml.jackson.annotation.JsonIgnore long expiresAt) { }
    public record Snapshot(String mode, String direction, String altitude, Long emptyMillis, Offer offer, Intent input,
            boolean returning) { }
}
