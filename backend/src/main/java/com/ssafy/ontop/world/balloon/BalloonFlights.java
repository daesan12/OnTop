package com.ssafy.ontop.world.balloon;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Component;

/** Channel-only visual state. The physics actor stays at the station. */
@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public final class BalloonFlights {
    private static final Duration TICKET_LIFETIME = Duration.ofMinutes(5);
    private static final long IDLE_NANOS = Duration.ofSeconds(8).toNanos();
    private static final long MAX_RIDE_NANOS = Duration.ofMinutes(3).toNanos();
    private static final long MIN_UPDATE_NANOS = Duration.ofMillis(80).toNanos();

    private final Map<Ticket, Grant> grants = new HashMap<>();
    private final Map<String, Ride> rides = new HashMap<>();
    private final JsonNode station;
    private final double mapHalf;

    public BalloonFlights(WorldMapRuntime map) {
        var prepared = map.prepared().orElse(null);
        JsonNode anchor = null;
        if (prepared != null) {
            for (JsonNode candidate : prepared.constructionSites()) {
                if ("balloon".equals(candidate.path("id").asText())) {
                    anchor = candidate;
                    break;
                }
            }
        }
        station = anchor;
        mapHalf = prepared == null ? 0 : prepared.collisionData().path("world").path("halfSize").asDouble();
    }

    public synchronized void authorize(String pilot, UUID id, Instant paidAt, Instant now) {
        Instant deadline = paidAt.plus(TICKET_LIFETIME);
        if (deadline.isAfter(now)) grants.putIfAbsent(new Ticket(pilot, id), new Grant(deadline, false));
    }

    public synchronized boolean ticketAvailable(String pilot, UUID id, Instant now) {
        var grant = grants.get(new Ticket(pilot, id));
        return grant != null && !grant.used && grant.deadline.isAfter(now);
    }

    public synchronized State start(String channel, String pilot, String session, UUID ticketId,
            Position player, Point position, Instant now, long at) {
        Ride current = rides.get(pilot);
        if (current != null) {
            return current.matches(channel, session, ticketId) ? current.state : null;
        }
        var ticket = new Ticket(pilot, ticketId);
        var grant = grants.get(ticket);
        if (grant == null || grant.used || !grant.deadline.isAfter(now)
                || !atStation(player) || !inBounds(position) || !nearDock(position)) return null;
        var state = new State(channel, pilot, new Flight(position, true));
        rides.put(pilot, new Ride(session, ticketId, at, at, state));
        return state;
    }

    public synchronized State update(String channel, String pilot, String session, UUID ticketId,
            Flight next, long at) {
        Ride ride = rides.get(pilot);
        if (ride == null || !ride.matches(channel, session, ticketId) || expired(ride, at)) return null;
        long elapsed = at - ride.updatedAt;
        if (elapsed < MIN_UPDATE_NANOS) return ride.state;
        double seconds = elapsed / 1_000_000_000.0;
        Point from = ride.state.flight.position;
        Point to = next.position;
        if (!inBounds(to) || !next.cabin.valid() || (!ride.state.flight.aboard && (next.aboard || !to.equals(from)))
                || Math.hypot(to.x - from.x, to.z - from.z) > 20 * seconds + 1.25
                || Math.abs(to.y - from.y) > 10 * seconds + .9) return null;
        var state = new State(channel, pilot, next.aboard ? next : new Flight(to, false));
        var ticket = new Ticket(pilot, ticketId);
        var grant = grants.get(ticket);
        if (grant != null && !grant.used) grants.put(ticket, new Grant(grant.deadline, true));
        rides.put(pilot, new Ride(session, ticketId, ride.startedAt, at, state));
        return state;
    }

    public synchronized State finish(String pilot, String session, UUID ticketId) {
        Ride ride = rides.get(pilot);
        if (ride == null || !ride.session.equals(session)
                || (ticketId != null && !ride.ticket.equals(ticketId))) return null;
        rides.remove(pilot);
        return ride.ended();
    }

    public synchronized List<State> snapshot(String channel, long at) {
        return rides.values().stream()
                .filter(ride -> ride.state.channelId.equals(channel) && !expired(ride, at))
                .map(ride -> ride.state).toList();
    }

    public synchronized List<State> expire(Instant now, long at) {
        grants.entrySet().removeIf(entry -> !entry.getValue().deadline.isAfter(now));
        List<State> ended = new ArrayList<>();
        rides.values().removeIf(ride -> {
            if (!expired(ride, at)) return false;
            ended.add(ride.ended());
            return true;
        });
        return ended;
    }

    private static boolean expired(Ride ride, long at) {
        return at - ride.updatedAt >= IDLE_NANOS || at - ride.startedAt >= MAX_RIDE_NANOS;
    }

    private boolean atStation(Position player) {
        if (station == null || player == null || player.swimming()) return false;
        JsonNode reach = station.path("reachPosition");
        return Math.hypot(player.x() - reach.get(0).asDouble(), player.z() - reach.get(2).asDouble())
                <= station.path("radius").asDouble()
                && Math.abs(player.y() - reach.get(1).asDouble()) <= station.path("heightTolerance").asDouble();
    }

    private boolean nearDock(Point point) {
        JsonNode center = station.path("position");
        return Math.hypot(point.x - center.get(0).asDouble(), point.z - center.get(2).asDouble()) <= 8
                && Math.abs(point.y - center.get(1).asDouble()) <= 4;
    }

    private boolean inBounds(Point point) {
        return Math.abs(point.x) <= mapHalf - 8 && Math.abs(point.z) <= mapHalf - 8
                && point.y >= -2 && point.y <= 72;
    }

    public record Point(double x, double y, double z) { }
    public record CabinPose(double x, double z, double yaw, int seatIndex, boolean moving) {
        public static final CabinPose IDLE = new CabinPose(0, 0, Math.PI, -1, false);

        boolean valid() {
            return Math.hypot(x, z) <= 1.38 && Math.abs(yaw) <= Math.PI
                    && seatIndex >= -1 && seatIndex <= 3 && (seatIndex == -1 || !moving);
        }
    }
    public record Flight(Point position, boolean aboard, CabinPose cabin) {
        public Flight(Point position, boolean aboard) {
            this(position, aboard, CabinPose.IDLE);
        }
    }
    public record State(String channelId, String pilotId,
            @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.ALWAYS)
            Flight flight) { }
    private record Ticket(String pilot, UUID id) { }
    private record Grant(Instant deadline, boolean used) { }
    private record Ride(String session, UUID ticket, long startedAt, long updatedAt, State state) {
        boolean matches(String channel, String sessionId, UUID id) {
            return state.channelId.equals(channel) && session.equals(sessionId) && ticket.equals(id);
        }
        State ended() { return new State(state.channelId, state.pilotId, null); }
    }
}
