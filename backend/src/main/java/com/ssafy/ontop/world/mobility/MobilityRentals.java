package com.ssafy.ontop.world.mobility;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;

public final class MobilityRentals {
    public static final long SECOND = TimeUnit.SECONDS.toNanos(1);
    private static final double HALF_PAIR_SPACING = 1.7;

    private final MobilityWallet wallet;
    private final Map<String, JsonNode> stations = new HashMap<>();
    private final Map<String, Ride> active = new HashMap<>();
    private final Map<Long, String> accounts = new HashMap<>();

    public MobilityRentals(MobilityWallet wallet, JsonNode construction) {
        this.wallet = wallet;
        for (JsonNode station : construction) {
            String id = station.path("id").asText();
            if (id.matches("mobility-[a-z]+") && station.path("reachPosition").isArray()
                    && station.path("reachPosition").size() == 3 && station.path("yaw").isNumber()
                    && station.path("radius").asDouble() > 0 && station.path("heightTolerance").asDouble() > 0) {
                stations.put(id, station);
            }
        }
    }

    public boolean enabled() { return !stations.isEmpty(); }

    public boolean inReach(String stationId, VehicleKind vehicle, Position position) {
        var station = stations.get(stationId);
        if (station == null || position == null || position.swimming()) {
            return false;
        }
        var reach = station.path("reachPosition");
        double yaw = station.path("yaw").asDouble();
        double side = vehicle.side() * HALF_PAIR_SPACING;
        double x = reach.get(0).asDouble() + side * Math.cos(yaw);
        double z = reach.get(2).asDouble() - side * Math.sin(yaw);
        return Math.hypot(position.x() - x, position.z() - z) <= station.path("radius").asDouble()
                && Math.abs(position.y() - reach.get(1).asDouble()) <= station.path("heightTolerance").asDouble();
    }

    public Ride current(String user) { return active.get(user); }
    public List<Ride> active() { return List.copyOf(active.values()); }
    public boolean accountInUse(long account) { return accounts.containsKey(account); }

    public MobilityWallet.Payment start(String user, long account, String channel, String id,
            String station, VehicleKind vehicle) {
        var payment = wallet.charge(account, id, 1, vehicle.rate());
        if (payment == MobilityWallet.Payment.PAID) {
            active.put(user, new Ride(user, account, channel, id, station, vehicle, 1, System.nanoTime() + SECOND));
            accounts.put(account, user);
        }
        return payment;
    }

    public MobilityWallet.Payment extend(Ride ride) {
        long second = ride.seconds() + 1;
        var payment = wallet.charge(ride.account(), ride.id(), second, ride.vehicle().rate());
        if (payment != MobilityWallet.Payment.INSUFFICIENT) {
            active.put(ride.user(), new Ride(ride.user(), ride.account(), ride.channel(), ride.id(), ride.station(),
                    ride.vehicle(), second, ride.nextPaymentAt() + SECOND));
        }
        return payment;
    }

    public Ride end(String user) {
        var ride = active.remove(user);
        if (ride != null) {
            accounts.remove(ride.account(), user);
        }
        return ride;
    }

    public record Ride(String user, long account, String channel, String id, String station, VehicleKind vehicle,
            long seconds, long nextPaymentAt) {
        public long total() { return seconds * vehicle.rate(); }
    }
}
