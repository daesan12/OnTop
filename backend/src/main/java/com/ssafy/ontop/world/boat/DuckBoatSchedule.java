package com.ssafy.ontop.world.boat;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 채널별 오리배 대기 팀과 운항. 팀은 혼자 또는 둘이며, 둘이면 초대를 수락해야 준비가 끝난다.
 * 준비된 팀만 먼저 온 순서로 출발하고, 직전 출발과 10초 간격을 둔다. 모든 시각은 epoch 밀리초다.
 * TableHub 잠금 안에서만 호출한다.
 */
public final class DuckBoatSchedule {
    public static final int BOATS = 4;
    public static final int TEAMS = 2;
    public static final int CAPACITY = 2;
    /** 대기 자리 수. 시설 좌석 0..3은 대기 자리(팀*2 + 자리), 그 뒤로 배마다 두 좌석이다. */
    public static final int QUEUE_SEATS = TEAMS * CAPACITY;
    public static final int FARE = 30;
    public static final long SPACING_MS = 10_000;
    public static final long INVITE_MS = 15_000;
    public static final long CHOICE_MS = 10_000;

    public enum Phase { READY, INVITING, CHOOSING }

    private final DuckBoatRoute route;
    private final Map<String, Channel> channels = new HashMap<>();
    private final Map<String, String> members = new HashMap<>();

    public DuckBoatSchedule(DuckBoatRoute route) {
        this.route = route;
    }

    public DuckBoatRoute route() {
        return route;
    }

    public static int queueSeat(int slot, int spot) {
        return slot * CAPACITY + spot;
    }

    public static int boatSeat(int boat, int seat) {
        return QUEUE_SEATS + boat * CAPACITY + seat;
    }

    public record Rider(String userId, int seat) { }

    public record Departure(String channelId, int boat, long departedAt, List<Rider> riders) { }

    public record Arrival(String channelId, int boat, List<String> riders) { }

    /** 초대가 거절·만료돼 초대한 사람이 다음 행동을 고르는 중이다. */
    public record InviteClosed(String channelId, String inviterId, String partnerId) { }

    /** 다음 행동을 고르지 않아 대기에서 빠질 사람. */
    public record ChoiceExpired(String channelId, String inviterId) { }

    public record Events(List<Departure> departures, List<Arrival> arrivals, List<InviteClosed> invitesClosed,
            List<ChoiceExpired> choicesExpired) {
        public static final Events NONE = new Events(List.of(), List.of(), List.of(), List.of());

        public boolean isEmpty() {
            return departures.isEmpty() && arrivals.isEmpty() && invitesClosed.isEmpty() && choicesExpired.isEmpty();
        }
    }

    public record TripView(int boat, long departedAt) { }

    /** members는 대기 자리 순서(0: 초대한 사람). departAt은 준비된 팀에만 있다. */
    public record TeamView(int slot, List<String> members, Phase phase, String partnerId, Long deadline,
            Long departAt) { }

    public record View(int fare, long lapMillis, List<TeamView> teams, List<TripView> trips) { }

    /** 초대한 팀의 정보. 자리 번호는 수락한 사람이 설 대기 자리다. */
    public record Invite(String channelId, String inviterId, int slot, long deadline) { }

    private static final class Team {
        private final int slot;
        private final long joinedAt;
        private final String[] members = new String[CAPACITY];
        private Phase phase;
        private String partnerId;
        private long deadline;

        private Team(int slot, long joinedAt) {
            this.slot = slot;
            this.joinedAt = joinedAt;
        }

        private int size() {
            int count = 0;
            for (String member : members) {
                if (member != null) count++;
            }
            return count;
        }
    }

    private static final class Trip {
        private final int boat;
        private final long departedAt;
        private final Map<String, Integer> riders = new LinkedHashMap<>();

        private Trip(int boat, long departedAt) {
            this.boat = boat;
            this.departedAt = departedAt;
        }
    }

    private static final class Channel {
        private final List<Team> teams = new ArrayList<>();
        private final List<Trip> trips = new ArrayList<>();
        private long lastDeparture = Long.MIN_VALUE / 4;
    }

    /** 빈 팀 자리가 있으면 그 번호, 없으면 -1. */
    public int freeSlot(String channelId) {
        Channel channel = channels.get(channelId);
        for (int slot = 0; slot < TEAMS; slot++) {
            int candidate = slot;
            if (channel == null || channel.teams.stream().noneMatch(t -> t.slot == candidate)) return slot;
        }
        return -1;
    }

    /** 팀을 만든다. partnerId가 있으면 초대 중, 없으면 바로 준비된 혼자 팀이다. */
    public void join(String channelId, String userId, int slot, String partnerId, long now) {
        if (members.containsKey(userId) || userId.equals(partnerId)) {
            throw new IllegalStateException("이미 오리배를 이용 중입니다.");
        }
        Channel channel = channels.computeIfAbsent(channelId, ignored -> new Channel());
        if (slot < 0 || slot >= TEAMS || channel.teams.stream().anyMatch(t -> t.slot == slot)) {
            throw new IllegalStateException("오리배 대기열이 가득 찼습니다.");
        }
        Team team = new Team(slot, now);
        team.members[0] = userId;
        if (partnerId == null) {
            team.phase = Phase.READY;
        } else {
            team.phase = Phase.INVITING;
            team.partnerId = partnerId;
            team.deadline = now + INVITE_MS;
        }
        channel.teams.add(team);
        members.put(userId, channelId);
    }

    /** partnerId에게 온, 아직 유효한 초대. */
    public Invite invite(String inviterId, String partnerId) {
        Team team = team(inviterId);
        if (team == null || team.phase != Phase.INVITING || !partnerId.equals(team.partnerId)
                || !inviterId.equals(team.members[0])) {
            return null;
        }
        return new Invite(members.get(inviterId), inviterId, team.slot, team.deadline);
    }

    /** 수락한 사람을 초대한 팀의 두 번째 자리에 넣는다. */
    public void accept(String inviterId, String partnerId) {
        if (members.containsKey(partnerId)) {
            throw new IllegalStateException("이미 오리배를 이용 중입니다.");
        }
        Invite invite = invite(inviterId, partnerId);
        if (invite == null) {
            throw new IllegalStateException("초대가 끝났습니다.");
        }
        Team team = team(inviterId);
        team.members[1] = partnerId;
        team.phase = Phase.READY;
        team.partnerId = null;
        members.put(partnerId, invite.channelId());
    }

    /** 거절하면 초대한 사람이 다음 행동을 고른다. */
    public boolean decline(String inviterId, String partnerId, long now) {
        if (invite(inviterId, partnerId) == null) {
            return false;
        }
        choose(team(inviterId), now);
        return true;
    }

    private void choose(Team team, long now) {
        team.phase = Phase.CHOOSING;
        team.deadline = now + CHOICE_MS;
    }

    /** 초대를 접고 혼자 탄다. 초대 중이거나 고르는 중일 때만 쓴다. */
    public void solo(String inviterId) {
        Team team = forming(inviterId);
        team.phase = Phase.READY;
        team.partnerId = null;
    }

    /** 다른 사람을 다시 초대한다. */
    public void reinvite(String inviterId, String partnerId, long now) {
        Team team = forming(inviterId);
        if (inviterId.equals(partnerId) || members.containsKey(partnerId)) {
            throw new IllegalStateException("초대할 수 없는 상대입니다.");
        }
        team.phase = Phase.INVITING;
        team.partnerId = partnerId;
        team.deadline = now + INVITE_MS;
    }

    private Team forming(String inviterId) {
        Team team = team(inviterId);
        if (team == null || team.phase == Phase.READY || !inviterId.equals(team.members[0])) {
            throw new IllegalStateException("팀을 고를 수 있는 상태가 아닙니다.");
        }
        return team;
    }

    /** 대기 중인 팀에서 이 사람이 선 자리. 없으면 -1. */
    public int queueSeat(String userId) {
        Team team = team(userId);
        if (team == null) return -1;
        for (int spot = 0; spot < CAPACITY; spot++) {
            if (userId.equals(team.members[spot])) return queueSeat(team.slot, spot);
        }
        return -1;
    }

    /** 대기 중인 팀에서 초대받은 사람(아직 수락 전). */
    public String pendingPartner(String inviterId) {
        Team team = team(inviterId);
        return team != null && team.phase == Phase.INVITING && inviterId.equals(team.members[0])
                ? team.partnerId : null;
    }

    /** 이 사람에게 아직 유효한 초대를 보낸 사람들. */
    public List<String> invitersOf(String partnerId) {
        var inviters = new ArrayList<String>();
        for (Channel channel : channels.values()) {
            for (Team team : channel.teams) {
                if (team.phase == Phase.INVITING && partnerId.equals(team.partnerId)) inviters.add(team.members[0]);
            }
        }
        return inviters;
    }

    private Team team(String userId) {
        String channelId = members.get(userId);
        if (channelId == null) return null;
        for (Team team : channels.get(channelId).teams) {
            for (String member : team.members) {
                if (userId.equals(member)) return team;
            }
        }
        return null;
    }

    /**
     * 대기 팀이나 운항 중인 배에서 이 사람만 뺀다. 남은 한 사람은 혼자 팀으로 계속 기다린다.
     * 혼자 남은 사람이 초대받은 쪽이면 그대로 준비된 팀이다. 모두 내린 배는 운항을 끝낸다.
     */
    public boolean leave(String userId) {
        String channelId = members.remove(userId);
        if (channelId == null) {
            return false;
        }
        Channel channel = channels.get(channelId);
        for (var iterator = channel.teams.iterator(); iterator.hasNext(); ) {
            Team team = iterator.next();
            for (int spot = 0; spot < CAPACITY; spot++) {
                if (userId.equals(team.members[spot])) team.members[spot] = null;
            }
            if (team.size() == 0) {
                iterator.remove();
            } else if (team.members[0] == null) {
                // 초대한 사람이 빠지면 함께 기다리던 사람이 혼자 준비된 팀이 된다.
                team.phase = Phase.READY;
                team.partnerId = null;
            }
        }
        for (var iterator = channel.trips.iterator(); iterator.hasNext(); ) {
            Trip trip = iterator.next();
            if (trip.riders.remove(userId) != null && trip.riders.isEmpty()) {
                iterator.remove();
            }
        }
        return true;
    }

    public boolean waiting(String userId) {
        return team(userId) != null;
    }

    /** 운항 중이면 [출발 시각, 좌석, 배]. */
    public long[] ride(String userId) {
        String channelId = members.get(userId);
        if (channelId == null) {
            return null;
        }
        for (Trip trip : channels.get(channelId).trips) {
            Integer seat = trip.riders.get(userId);
            if (seat != null) {
                return new long[] {trip.departedAt, seat, trip.boat};
            }
        }
        return null;
    }

    public boolean sailing(String channelId) {
        Channel channel = channels.get(channelId);
        return channel != null && !channel.trips.isEmpty();
    }

    public View view(String channelId) {
        Channel channel = channels.get(channelId);
        if (channel == null) {
            return new View(FARE, route.lapMillis(), List.of(), List.of());
        }
        Map<Team, Long> departures = departures(channel);
        var teams = channel.teams.stream().sorted(Comparator.comparingInt(t -> t.slot)).map(team -> new TeamView(
                team.slot, java.util.Arrays.asList(team.members.clone()), team.phase, team.partnerId,
                team.phase == Phase.READY ? null : team.deadline, departures.get(team))).toList();
        return new View(FARE, route.lapMillis(), teams, channel.trips.stream()
                .sorted(Comparator.comparingInt(t -> t.boat)).map(t -> new TripView(t.boat, t.departedAt)).toList());
    }

    /** 준비된 팀을 먼저 온 순서로 놓고, 차례로 출발할 수 있는 가장 이른 시각을 정한다. */
    private Map<Team, Long> departures(Channel channel) {
        var ready = channel.teams.stream().filter(t -> t.phase == Phase.READY)
                .sorted(Comparator.comparingLong((Team t) -> t.joinedAt).thenComparingInt(t -> t.slot)).toList();
        var arrivals = new ArrayList<>(channel.trips.stream().map(t -> t.departedAt + route.lapMillis()).sorted().toList());
        var result = new LinkedHashMap<Team, Long>();
        long previous = channel.lastDeparture;
        for (Team team : ready) {
            long at = departAt(team.joinedAt, previous, arrivals, route.lapMillis(), route.laneMillis());
            result.put(team, at);
            previous = at;
            arrivals.add(at + route.lapMillis());
            arrivals.sort(null);
        }
        return result;
    }

    /**
     * 직전 출발과 10초 간격, 빈 배, 돌아오는 배와 같은 진입로를 쓰지 않는 시각 중 가장 이른 때.
     * 도착 순간 같은 자리에서 출발하는 것은 허용한다.
     */
    static long departAt(long readySince, long previousDeparture, List<Long> arrivals, long lapMillis, long laneMillis) {
        long at = Math.max(readySince, previousDeparture + SPACING_MS);
        for (int guard = 0; guard < 4 * BOATS + 4; guard++) {
            long candidate = at;
            int busy = 0;
            long nextFree = Long.MAX_VALUE;
            for (long arrival : arrivals) {
                if (arrival > candidate) {
                    busy++;
                    nextFree = Math.min(nextFree, arrival);
                }
            }
            if (busy >= BOATS) {
                candidate = nextFree;
            }
            for (long arrival : arrivals) {
                if (candidate > arrival - 2 * laneMillis && candidate < arrival) {
                    candidate = arrival;
                }
            }
            if (candidate == at) {
                return at;
            }
            at = candidate;
        }
        return at;
    }

    public Events advance(long now) {
        var departures = new ArrayList<Departure>();
        var arrivals = new ArrayList<Arrival>();
        var closed = new ArrayList<InviteClosed>();
        var expired = new ArrayList<ChoiceExpired>();
        for (var entry : channels.entrySet()) {
            String channelId = entry.getKey();
            Channel channel = entry.getValue();
            for (var iterator = channel.trips.iterator(); iterator.hasNext(); ) {
                Trip trip = iterator.next();
                if (now - trip.departedAt >= route.lapMillis()) {
                    iterator.remove();
                    trip.riders.keySet().forEach(members::remove);
                    arrivals.add(new Arrival(channelId, trip.boat, List.copyOf(trip.riders.keySet())));
                }
            }
            for (Team team : channel.teams) {
                if (team.phase == Phase.INVITING && now >= team.deadline) {
                    closed.add(new InviteClosed(channelId, team.members[0], team.partnerId));
                    team.partnerId = null;
                    choose(team, now);
                } else if (team.phase == Phase.CHOOSING && now >= team.deadline) {
                    expired.add(new ChoiceExpired(channelId, team.members[0]));
                }
            }
            var due = departures(channel).entrySet().stream().findFirst().orElse(null);
            if (due != null && now >= due.getValue()) {
                Team team = due.getKey();
                int boat = 0;
                while (true) {
                    int candidate = boat;
                    if (channel.trips.stream().noneMatch(t -> t.boat == candidate)) break;
                    boat++;
                }
                Trip trip = new Trip(boat, now);
                var riders = new ArrayList<Rider>();
                for (String member : team.members) {
                    if (member == null) continue;
                    trip.riders.put(member, riders.size());
                    riders.add(new Rider(member, riders.size()));
                }
                channel.teams.remove(team);
                channel.trips.add(trip);
                channel.lastDeparture = now;
                departures.add(new Departure(channelId, boat, now, List.copyOf(riders)));
            }
        }
        // 대기 팀과 운항이 모두 비면 겹칠 배가 없으므로 출발 기록도 함께 지운다.
        channels.values().removeIf(c -> c.teams.isEmpty() && c.trips.isEmpty());
        return new Events(List.copyOf(departures), List.copyOf(arrivals), List.copyOf(closed), List.copyOf(expired));
    }

    public void clear() {
        channels.clear();
        members.clear();
    }
}
