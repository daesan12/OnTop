package com.ssafy.ontop.world.balloon;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
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
    private static final Duration HOLD_LIFETIME = Duration.ofSeconds(30);
    public static final int MAX_CAPACITY = 4;
    private static final long IDLE_NANOS = Duration.ofSeconds(8).toNanos();
    private static final long MAX_RIDE_NANOS = Duration.ofMinutes(3).toNanos();
    private static final long MIN_UPDATE_NANOS = Duration.ofMillis(80).toNanos();

    private final Map<Ticket, Grant> grants = new HashMap<>();
    private final Map<String, Ride> rides = new HashMap<>();
    private final Map<String, Group> groups = new HashMap<>();
    private final Map<String, Hold> holds = new HashMap<>();
    // 행동 로그용 탑승 기록. 비행·결제·좌석 판정에는 쓰지 않는다. TableHub가 요청을 처리한 뒤 drainUsage로 가져간다.
    private final Map<String, Airborne> airborne = new HashMap<>();
    private final List<Usage> usage = new ArrayList<>();
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
        return start(channel, pilot, session, ticketId, player, position, now, at, 1, null);
    }

    public synchronized State start(String channel, String pilot, String session, UUID ticketId,
            Position player, Point position, Instant now, long at, int capacity, String leader) {
        return start(channel, pilot, session, ticketId, player, position, now, at, capacity, leader, null);
    }

    public synchronized State start(String channel, String pilot, String session, UUID ticketId,
            Position player, Point position, Instant now, long at, int capacity, String leader, String mode) {
        if (leader != null) return join(channel, pilot, session, ticketId, player, now, at, leader);
        Ride current = rides.get(pilot);
        if (current != null) {
            return current.matches(channel, session, ticketId) ? withParty(current.state, at) : null;
        }
        if (capacity < 1 || capacity > MAX_CAPACITY || groupOf(pilot) != null
                || mode != null && !mode.equals("solo") && !(mode.equals("split") && capacity >= 2)
                || !ticketAvailable(pilot, ticketId, now) || !atStation(player)
                || !inBounds(position) || !nearDock(position)) return null;
        var state = new State(channel, pilot, new Flight(position, true));
        rides.put(pilot, new Ride(session, ticketId, at, at, state));
        if (capacity > 1 || mode != null) {
            var group = new Group(pilot, capacity, mode);
            group.boarding = capacity > 1;
            groups.put(pilot, group);
        }
        holds.remove(pilot);
        return withParty(state, at);
    }

    public synchronized boolean holdSeat(String channel, String leader, String rider, UUID ticket, Instant now, long at) {
        Ride ride = rides.get(leader);
        Group group = groups.get(leader);
        if (ride == null || group == null || !group.boarding || !ride.state.channelId.equals(channel)
                || expired(ride, at) || rider.equals(leader) || rides.containsKey(rider)) return false;
        Passenger passenger = group.passengers.get(rider);
        if (passenger != null) return passenger.ticket.equals(ticket);
        if (groupOf(rider) != null) return false;
        holds.values().removeIf(hold -> !hold.deadline.isAfter(now));
        long held = holds.entrySet().stream()
                .filter(entry -> !entry.getKey().equals(rider) && entry.getValue().leader.equals(leader)).count();
        if (1 + group.passengers.size() + held >= group.capacity) return false;
        holds.put(rider, new Hold(leader, ticket, now.plus(HOLD_LIFETIME)));
        return true;
    }

    public synchronized void releaseSeat(String leader, String rider, UUID ticket) {
        Hold hold = holds.get(rider);
        if (hold != null && hold.leader.equals(leader) && hold.ticket.equals(ticket)) holds.remove(rider);
    }

    private State join(String channel, String rider, String session, UUID ticket, Position player,
            Instant now, long at, String leader) {
        Ride ride = rides.get(leader);
        Group group = groups.get(leader);
        if (ride == null || group == null || !ride.state.channelId.equals(channel) || expired(ride, at)) return null;
        Passenger current = group.passengers.get(rider);
        if (current != null) return current.matches(session, ticket) ? withParty(ride.state, at) : null;
        Hold hold = holds.get(rider);
        if (!group.boarding || hold == null || !hold.leader.equals(leader) || !hold.ticket.equals(ticket)
                || !hold.deadline.isAfter(now) || rides.containsKey(rider) || groupOf(rider) != null
                || 1 + group.passengers.size() >= group.capacity
                || !ticketAvailable(rider, ticket, now) || !atStation(player)) return null;
        if (group.controls != null) group.controls.assignCopilot(rider);
        CabinPose cabin = group.controls != null && group.controls.seat(rider) >= 0
                ? CabinPose.IDLE : initialSeat(group);
        group.passengers.put(rider, new Passenger(session, ticket, cabin));
        holds.remove(rider);
        return withParty(ride.state, at);
    }

    public synchronized State launch(String channel, String pilot, String session, UUID ticket, Instant now, long at) {
        return launch(channel, pilot, session, ticket, now, at, false);
    }

    public synchronized State launch(String channel, String pilot, String session, UUID ticket, Instant now, long at,
            boolean solo) {
        Ride ride = rides.get(pilot);
        Group group = groups.get(pilot);
        if (ride == null || group == null || !ride.matches(channel, session, ticket) || expired(ride, at)) return null;
        if (!group.boarding) return withParty(ride.state, at);
        if (holds.values().stream().anyMatch(hold -> hold.leader.equals(pilot) && hold.deadline.isAfter(now))) return null;
        if (group.controls != null) {
            if (solo) group.controls.useSolo();
            if (!group.controls.ready()) return null;
        }
        group.boarding = false;
        rides.put(pilot, new Ride(session, ticket, at, at, ride.state));
        int riders = 1 + group.passengers.size();
        String flightMode = flightMode(group, at);
        if (consume(pilot, ticket)) takeOff(channel, pilot, ticket, "PILOT", riders, flightMode, at);
        group.passengers.forEach((rider, passenger) -> {
            if (consume(rider, passenger.ticket)) {
                takeOff(channel, rider, passenger.ticket, "PASSENGER", riders, flightMode, at);
            }
        });
        return withParty(ride.state, at);
    }

    public synchronized State update(String channel, String pilot, String session, UUID ticketId,
            Flight next, long at) {
        return update(channel, pilot, session, ticketId, next, BalloonControls.Intent.STOPPED, at);
    }

    public synchronized State update(String channel, String pilot, String session, UUID ticketId,
            Flight next, BalloonControls.Intent input, long at) {
        Ride ride = rides.get(pilot);
        if (ride == null) return updatePassenger(channel, pilot, session, ticketId, next.cabin, input, at);
        if (!ride.matches(channel, session, ticketId) || expired(ride, at)) return null;
        long elapsed = at - ride.updatedAt;
        if (elapsed < MIN_UPDATE_NANOS) return withParty(ride.state, at);
        Group group = groups.get(pilot);
        if (group != null && group.boarding) {
            rides.put(pilot, new Ride(session, ticketId, ride.startedAt, at, ride.state));
            return withParty(ride.state, at);
        }
        double seconds = elapsed / 1_000_000_000.0;
        Point from = ride.state.flight.position;
        Point to = next.position;
        if (!inBounds(to) || !next.cabin.valid() || (!ride.state.flight.aboard && (next.aboard || !to.equals(from)))
                || Math.hypot(to.x - from.x, to.z - from.z) > 20 * seconds + 1.25
                || Math.abs(to.y - from.y) > 10 * seconds + .9) return null;
        if (group != null && group.controls != null && next.aboard) group.controls.steer(pilot, input, at);
        CabinPose cabin = group != null && seatUnavailable(group, pilot, next.cabin.seatIndex)
                ? ride.state.flight.cabin : next.cabin;
        var state = new State(channel, pilot, next.aboard ? new Flight(to, true, cabin) : new Flight(to, false));
        if (consume(pilot, ticketId)) {
            takeOff(channel, pilot, ticketId, "PILOT", group == null ? 1 : 1 + group.passengers.size(),
                    flightMode(group, at), at);
        }
        rides.put(pilot, new Ride(session, ticketId, ride.startedAt, at, state));
        return withParty(state, at);
    }

    public synchronized State finish(String pilot, String session, UUID ticketId) {
        return finish(pilot, session, ticketId, System.nanoTime());
    }

    public synchronized State finish(String pilot, String session, UUID ticketId, long at) {
        return finish(pilot, session, ticketId, at, "ENDED");
    }

    // reason은 행동 로그에만 쓰는 하차 사유다(ENDED·DISCONNECTED·CHANNEL_LEFT).
    public synchronized State finish(String pilot, String session, UUID ticketId, long at, String reason) {
        Ride ride = rides.get(pilot);
        if (ride == null) {
            Group group = groupOf(pilot);
            if (group == null) return null;
            Passenger passenger = group.passengers.get(pilot);
            if (!passenger.session.equals(session) || (ticketId != null && !passenger.ticket.equals(ticketId))) return null;
            group.passengers.remove(pilot);
            land(pilot, reason, at);
            if (group.controls != null) group.controls.remove(pilot, at);
            if (group.boarding && group.controls != null) {
                group.passengers.entrySet().stream().findFirst().ifPresent(entry -> {
                    group.controls.assignCopilot(entry.getKey());
                    if (group.controls.seat(entry.getKey()) >= 0) entry.getValue().cabin = CabinPose.IDLE;
                });
            }
            return withParty(rides.get(group.leader).state, at);
        }
        if (!ride.session.equals(session)
                || (ticketId != null && !ride.ticket.equals(ticketId))) return null;
        rides.remove(pilot);
        landParty(pilot, reason, "PILOT_ENDED", at);
        removeGroup(pilot);
        return ride.ended();
    }

    public synchronized List<State> snapshot(String channel, long at) {
        return rides.values().stream()
                .filter(ride -> ride.state.channelId.equals(channel) && !expired(ride, at))
                .map(ride -> withParty(ride.state, at)).toList();
    }

    public synchronized List<State> expire(Instant now, long at) {
        grants.entrySet().removeIf(entry -> !entry.getValue().deadline.isAfter(now));
        holds.values().removeIf(hold -> !hold.deadline.isAfter(now));
        List<State> ended = new ArrayList<>();
        rides.values().removeIf(ride -> {
            if (!expired(ride, at)) return false;
            ended.add(ride.ended());
            landParty(ride.state.pilotId, "EXPIRED", "EXPIRED", at);
            removeGroup(ride.state.pilotId);
            return true;
        });
        return ended;
    }

    public synchronized State control(String channel, String rider, String session, UUID ticket,
            String action, String role, String peer, long at) {
        Group group = groups.get(rider);
        if (group == null) group = groupOf(rider);
        if (group == null || group.controls == null || group.boarding) return null;
        Ride ride = rides.get(group.leader);
        Passenger passenger = group.passengers.get(rider);
        boolean ownsTicket = passenger == null ? ride.matches(channel, session, ticket) : passenger.matches(session, ticket);
        if (!ownsTicket || !ride.state.channelId.equals(channel) || expired(ride, at) || !ride.state.flight.aboard
                || action.equals("offer") && (peer == null || !peer.equals(group.leader) && !group.passengers.containsKey(peer))
                || !group.controls.change(rider, action, role, peer, at)) return null;
        if (group.controls.seat(rider) >= 0) {
            if (passenger != null) passenger.cabin = CabinPose.IDLE;
            else if (ride.state.flight.cabin.seatIndex >= 0) {
                State seated = ride.state;
                State standing = new State(seated.channelId, seated.pilotId, new Flight(seated.flight.position, true));
                ride = new Ride(ride.session, ride.ticket, ride.startedAt, ride.updatedAt, standing);
                rides.put(rider, ride);
            }
        }
        return withParty(ride.state, at);
    }

    private State updatePassenger(String channel, String rider, String session, UUID ticket, CabinPose next,
            BalloonControls.Intent input, long at) {
        Group group = groupOf(rider);
        if (group == null) return null;
        Ride ride = rides.get(group.leader);
        Passenger passenger = group.passengers.get(rider);
        if (!ride.state.channelId.equals(channel) || !passenger.matches(session, ticket) || expired(ride, at)) return null;
        if (!group.boarding && ride.state.flight.aboard && next.valid()
                && at - passenger.updatedAt >= MIN_UPDATE_NANOS) {
            if (!seatUnavailable(group, rider, next.seatIndex)) {
                passenger.cabin = next;
                passenger.updatedAt = at;
            }
            if (group.controls != null && group.controls.seat(rider) >= 0) {
                group.controls.steer(rider, input, at);
                passenger.updatedAt = at;
            }
        }
        return withParty(ride.state, at);
    }

    // 탑승권을 이번에 처음 썼으면 true다.
    private boolean consume(String rider, UUID ticketId) {
        var ticket = new Ticket(rider, ticketId);
        var grant = grants.get(ticket);
        if (grant == null || grant.used) return false;
        grants.put(ticket, new Grant(grant.deadline, true));
        return true;
    }

    /** 쌓인 탑승 기록을 꺼내고 비운다. 이륙(endReason 없음)과 하차(endReason 있음)가 일어난 순서다. */
    public synchronized List<Usage> drainUsage() {
        var drained = List.copyOf(usage);
        usage.clear();
        return drained;
    }

    private void takeOff(String channel, String rider, UUID ticket, String role, int riders, String mode, long at) {
        if (airborne.putIfAbsent(rider, new Airborne(channel, ticket, role, riders, mode, at)) == null) {
            usage.add(new Usage(channel, rider, ticket, role, riders, mode, null, 0, BalloonFareService.FARE));
        }
    }

    private void land(String rider, String reason, long at) {
        Airborne flying = airborne.remove(rider);
        if (flying != null) {
            usage.add(new Usage(flying.channel, rider, flying.ticket, flying.role, flying.riders, flying.mode, reason,
                    Math.max(0, at - flying.since), BalloonFareService.FARE));
        }
    }

    // 조종사가 끝나면 남은 동승자도 함께 내린다.
    private void landParty(String pilot, String pilotReason, String passengerReason, long at) {
        land(pilot, pilotReason, at);
        Group group = groups.get(pilot);
        if (group != null) group.passengers.keySet().forEach(rider -> land(rider, passengerReason, at));
    }

    private static String flightMode(Group group, long at) {
        if (group == null) return "single";
        return group.controls == null ? "party" : group.controls.snapshot(at).mode();
    }

    /** 열기구를 조종하거나 함께 타고 있거나 자리를 잡아 둔 사람. 다른 공원 활동과 겹치지 않게 확인한다. */
    public synchronized boolean aboard(String user) {
        return rides.containsKey(user) || holds.containsKey(user) || groupOf(user) != null;
    }

    private Group groupOf(String passenger) {
        return groups.values().stream().filter(group -> group.passengers.containsKey(passenger)).findFirst().orElse(null);
    }

    private void removeGroup(String leader) {
        groups.remove(leader);
        holds.values().removeIf(hold -> hold.leader.equals(leader));
    }

    private State withParty(State state, long at) {
        Group group = groups.get(state.pilotId);
        if (group == null) return state;
        Map<String, CabinPose> passengers = new LinkedHashMap<>();
        group.passengers.forEach((id, passenger) -> passengers.put(id, controlPose(group, id, passenger.cabin)));
        Flight flight = state.flight;
        if (flight.aboard) flight = new Flight(flight.position, true, controlPose(group, state.pilotId, flight.cabin));
        return new State(state.channelId, state.pilotId, flight,
                new Party(group.capacity, group.boarding, Map.copyOf(passengers),
                        group.controls == null ? null : group.controls.snapshot(at)));
    }

    private CabinPose controlPose(Group group, String rider, CabinPose cabin) {
        int seat = group.controls == null ? -1 : group.controls.seat(rider);
        return seat < 0 ? cabin : new CabinPose(0, 0, Math.PI, seat, false);
    }

    private boolean seatUnavailable(Group group, String rider, int seat) {
        return group.controls != null && group.controls.reserved(seat) || seatTaken(group, rider, seat);
    }

    private boolean seatTaken(Group group, String rider, int seat) {
        return seat >= 0 && ((!rider.equals(group.leader) && rides.get(group.leader).state.flight.cabin.seatIndex == seat)
                || group.passengers.entrySet().stream().anyMatch(entry ->
                        !entry.getKey().equals(rider) && entry.getValue().cabin.seatIndex == seat));
    }

    private CabinPose initialSeat(Group group) {
        for (int seat = 0; seat < MAX_CAPACITY; seat++) {
            if (!seatUnavailable(group, "", seat)) return new CabinPose(0, 0, Math.PI, seat, false);
        }
        return CabinPose.IDLE;
    }

    private static boolean expired(Ride ride, long at) {
        return at - ride.updatedAt >= IDLE_NANOS || at - ride.startedAt >= MAX_RIDE_NANOS;
    }

    boolean atStation(Position player) {
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
            Flight flight, Party party) {
        public State(String channelId, String pilotId, Flight flight) {
            this(channelId, pilotId, flight, null);
        }
    }
    public record Party(int capacity, boolean boarding, Map<String, CabinPose> passengers,
            BalloonControls.Snapshot controls) { }
    private static final class Group {
        final String leader;
        final int capacity;
        final Map<String, Passenger> passengers = new LinkedHashMap<>();
        final BalloonControls controls;
        boolean boarding = true;

        Group(String leader, int capacity, String mode) {
            this.leader = leader;
            this.capacity = capacity;
            controls = mode == null ? null : new BalloonControls(mode, leader);
        }
    }
    private static final class Passenger {
        final String session;
        final UUID ticket;
        CabinPose cabin;
        long updatedAt = Long.MIN_VALUE / 2;

        Passenger(String session, UUID ticket, CabinPose cabin) {
            this.session = session;
            this.ticket = ticket;
            this.cabin = cabin;
        }

        boolean matches(String sessionId, UUID id) {
            return session.equals(sessionId) && ticket.equals(id);
        }
    }
    /**
     * 행동 로그용 탑승 기록. endReason이 null이면 이륙, 있으면 하차다. riders는 이륙 때 함께 탄 인원,
     * mode는 single(혼자 탑승)·party(여럿, 조종 분담 없음)·solo·split(조종 방식)이다.
     */
    public record Usage(String channelId, String riderId, UUID ticket, String role, int riders, String mode,
            String endReason, long durationNanos, long fee) { }
    private record Airborne(String channel, UUID ticket, String role, int riders, String mode, long since) { }
    private record Hold(String leader, UUID ticket, Instant deadline) { }
    private record Ticket(String pilot, UUID id) { }
    private record Grant(Instant deadline, boolean used) { }
    private record Ride(String session, UUID ticket, long startedAt, long updatedAt, State state) {
        boolean matches(String channel, String sessionId, UUID id) {
            return state.channelId.equals(channel) && session.equals(sessionId) && ticket.equals(id);
        }
        State ended() { return new State(state.channelId, state.pilotId, null); }
    }
}
