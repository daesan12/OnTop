package com.ssafy.ontop.world.mobility;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

public final class MobilityRentals {
    public static final long SECOND = TimeUnit.SECONDS.toNanos(1);
    private static final Logger log = LoggerFactory.getLogger(MobilityRentals.class);
    private static final double HALF_PAIR_SPACING = 1.7;

    private final MobilityWallet wallet;
    private final Map<String, JsonNode> stations = new HashMap<>();
    private final ThreadPoolExecutor workers = new ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(32), Thread.ofPlatform().daemon(true).name("mobility-payment-", 0).factory());

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

    public Charge submit(long account, String id, long second, VehicleKind vehicle, long deadline,
            Consumer<MobilityWallet.Payment> complete) {
        var charge = new Charge(account, id, second, vehicle.rate(), deadline, complete);
        try {
            workers.execute(charge);
            return charge;
        } catch (RejectedExecutionException rejected) {
            return null;
        }
    }

    public void shutdown() {
        // The hub has already cancelled outstanding charges. Let a commit that won the race finish.
        workers.shutdown();
    }

    private enum Decision { OPEN, CANCELLED, COMMITTING }

    public final class Charge implements Runnable {
        private final AtomicReference<Decision> decision = new AtomicReference<>(Decision.OPEN);
        private final long account;
        private final String id;
        private final long second;
        private final int price;
        private final long deadline;
        private final Consumer<MobilityWallet.Payment> complete;

        private Charge(long account, String id, long second, int price, long deadline,
                Consumer<MobilityWallet.Payment> complete) {
            this.account = account;
            this.id = id;
            this.second = second;
            this.price = price;
            this.deadline = deadline;
            this.complete = complete;
        }

        public boolean cancel() {
            if (decision.compareAndSet(Decision.OPEN, Decision.CANCELLED)) {
                workers.remove(this);
            }
            return decision.get() == Decision.CANCELLED;
        }

        private boolean authorizeCommit() {
            return System.nanoTime() - deadline < 0 && decision.compareAndSet(Decision.OPEN, Decision.COMMITTING);
        }

        @Override
        public void run() {
            if (decision.get() == Decision.CANCELLED) {
                return;
            }
            MobilityWallet.Payment result;
            try {
                result = System.nanoTime() - deadline >= 0 ? MobilityWallet.Payment.CANCELLED
                        : wallet.charge(account, id, second, price, this::authorizeCommit);
            } catch (MobilityWallet.PaymentCancelled cancelled) {
                result = MobilityWallet.Payment.CANCELLED;
            } catch (RuntimeException failure) {
                log.warn("탈것 대여 결제 실패", failure);
                result = MobilityWallet.Payment.FAILED;
            }
            complete.accept(result);
        }
    }
}
