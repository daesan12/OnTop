package com.ssafy.ontop.world.winter;

import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.DoubleUnaryOperator;
import java.util.function.Function;

/** TableHub 잠금 아래에서 눈 소지·명중·동결·탈출을 확정한다. 재화/경기 상태는 만들지 않는다. */
public final class SnowballService {
    public static final double RANGE = 16;
    public static final double ARC_HEIGHT = .55;
    public static final int FREEZE_SECONDS = 5;
    public static final int ESCAPE_PRESSES = 6;
    public static final int MAX_SNOWBALLS = 3;
    private final Map<String, Recent> recent = new HashMap<>();
    private final Map<String, Player> players = new HashMap<>();
    private final Map<String, Long> versions = new HashMap<>();
    private final Map<String, Preparation> preparations = new HashMap<>();
    private final Map<String, java.util.LinkedHashSet<String>> pickups = new HashMap<>();
    private final List<Flight> flights = new ArrayList<>();
    public static final int WINDUP_MILLIS = 300;

    public record Target(String userId, Position position) { }
    public record Event(String shotId, String channelId, String userId, String hitUserId,
                        double x, double y, double z, double endX, double endY, double endZ,
                        String sentAt, int durationMs) { }
    public record PlayerState(String userId, int snowballs, int hits, String freezeId,
                              String frozenUntil, int escapePresses) { }
    public record State(String channelId, long version, List<PlayerState> players) { }
    public record Aim(String channelId, String userId, double yaw, double x, double y, double z,
                      double endX, double endY, double endZ, double distance, String hitUserId) { }
    public record Windup(String motionId, String channelId, String userId, double yaw,
                         String startedAt, int durationMs) { }
    public record Impact(String shotId, String channelId, String userId, String hitUserId, String impactedAt) { }
    private record Flight(long arrivesAt, Event event, Player target) { }
    private record Preparation(String requestId, long at, Windup motion) { }
    private record Recent(String requestId, String channelId, long at, Event event) { }
    private static final class Player {
        final String channel;
        int snowballs;
        int hits;
        String freezeId = "";
        Instant frozenUntil;
        long frozenUntilNanos;
        long immuneUntil;
        final java.util.Set<String> escapeRequests = new java.util.HashSet<>();
        String lastKey = "";
        long lastPress;
        int presses;
        Player(String channel) { this.channel = channel; }
    }

    public static final class Rejected extends IllegalStateException {
        private final String code;
        public Rejected(String code, String message) { super(message); this.code = code; }
        public String code() { return code; }
    }

    private void changed(String channel) { versions.merge(channel, 1L, Long::sum); }

    private Player player(String channel, String user) {
        Player p = players.get(user);
        if (p == null || !p.channel.equals(channel)) {
            p = new Player(channel);
            players.put(user, p);
        }
        return p;
    }

    public State state(String channel) {
        return new State(channel, versions.getOrDefault(channel, 0L), players.entrySet().stream()
                .filter(e -> e.getValue().channel.equals(channel)).sorted(Map.Entry.comparingByKey())
                .map(e -> { Player p = e.getValue(); return new PlayerState(e.getKey(), p.snowballs, p.hits,
                        p.freezeId, p.frozenUntil == null ? null : p.frozenUntil.toString(), p.presses); }).toList());
    }

    public boolean frozen(String user, long now) {
        Player p = players.get(user);
        return p != null && p.frozenUntilNanos > now;
    }

    public State pickup(String requestId, String channel, String user, long now) {
        if (frozen(user, now)) { throw new Rejected("SNOWBALL_FROZEN", "얼음부터 깨고 눈을 주워주세요."); }
        Player p = player(channel, user);
        var seen = pickups.computeIfAbsent(user, ignored -> new java.util.LinkedHashSet<>());
        if (!seen.add(requestId)) { return state(channel); }
        if (seen.size() > 64) { seen.removeFirst(); }
        if (p.snowballs < MAX_SNOWBALLS) { p.snowballs++; changed(channel); }
        return state(channel);
    }

    public Event create(String requestId, String channelId, String userId, Position origin, double yaw,
                        Collection<Target> targets, DoubleUnaryOperator obstacle, long now, Instant sentAt) {
        Recent previous = recent.get(userId);
        if (previous != null && previous.requestId().equals(requestId) && previous.channelId().equals(channelId)) {
            return previous.event();
        }
        if (previous != null && now - previous.at() < 900_000_000L) {
            throw new Rejected("SNOWBALL_COOLDOWN", "잠시 뒤 다시 던져주세요.");
        }
        Player shooter = player(channelId, userId);
        Aim aim = preview(channelId, userId, origin, yaw, targets, obstacle, now);
        shooter.snowballs--;
        String hit = aim.hitUserId();
        changed(channelId);
        Event event = new Event(userId + ":" + requestId, channelId, userId, hit, aim.x(), aim.y(), aim.z(),
                aim.endX(), aim.endY(), aim.endZ(), sentAt.toString(),
                (int) Math.max(100, aim.distance() / 22 * 1000));
        recent.put(userId, new Recent(requestId, channelId, now, event));
        flights.add(new Flight(now + event.durationMs() * 1_000_000L, event,
                hit.isEmpty() ? null : player(channelId, hit)));
        return event;
    }

    /** 발사 시에는 탄약만 소비하고, 비행이 끝난 틱에 현재 대상 위치를 다시 확인한다. */
    public List<Impact> arrive(long now, Instant at, Function<String, Collection<Target>> targets) {
        var impacts = new ArrayList<Impact>();
        var changedChannels = new LinkedHashSet<String>();
        var positions = new HashMap<String, Collection<Target>>();
        var iterator = flights.iterator();
        while (iterator.hasNext()) {
            Flight flight = iterator.next();
            if (now < flight.arrivesAt()) { continue; }
            iterator.remove();
            Event event = flight.event();
            Player victim = flight.target();
            String hit = "";
            if (victim != null && players.get(event.hitUserId()) == victim
                    && !frozen(event.hitUserId(), now) && victim.immuneUntil <= now) {
                Position position = positions.computeIfAbsent(event.channelId(), targets).stream()
                        .filter(target -> target.userId().equals(event.hitUserId()))
                        .map(Target::position).findFirst().orElse(null);
                if (position != null && Math.hypot(position.x() - event.endX(), position.z() - event.endZ()) < .65
                        && Math.abs(position.y() - event.endY()) < 1) {
                    hit = event.hitUserId();
                    victim.hits++;
                    if (victim.hits == 3) {
                        victim.snowballs = 0;
                        victim.freezeId = UUID.randomUUID().toString();
                        victim.frozenUntil = at.plusSeconds(FREEZE_SECONDS);
                        victim.frozenUntilNanos = now + FREEZE_SECONDS * 1_000_000_000L;
                        victim.lastKey = ""; victim.presses = 0; victim.escapeRequests.clear();
                    }
                    changedChannels.add(event.channelId());
                }
            }
            impacts.add(new Impact(event.shotId(), event.channelId(), event.userId(), hit, at.toString()));
        }
        changedChannels.forEach(this::changed);
        return List.copyOf(impacts);
    }

    private void requireSnowball(String channel, String user, double yaw, long now) {
        if (!Double.isFinite(yaw) || Math.abs(yaw) > Math.PI) {
            throw new IllegalArgumentException("눈덩이를 던질 방향을 확인해주세요.");
        }
        if (frozen(user, now)) { throw new Rejected("SNOWBALL_FROZEN", "얼음부터 깨고 던져주세요."); }
        Player p = players.get(user);
        if (p == null || !p.channel.equals(channel) || p.snowballs == 0) {
            throw new Rejected("SNOWBALL_REQUIRED", "바닥의 눈더미에서 눈을 먼저 주워주세요.");
        }
    }

    /** 준비 동작은 재화·명중 상태를 바꾸지 않는다. 실제 발사는 기존 create에서 다시 검증한다. */
    public Windup prepare(String requestId, String channel, String user, double yaw, long now, Instant at) {
        requireSnowball(channel, user, yaw, now);
        Preparation previous = preparations.get(user);
        if (previous != null && previous.requestId().equals(requestId)) { return previous.motion(); }
        Recent shot = recent.get(user);
        if (previous != null && now - previous.at() < 900_000_000L
                || shot != null && now - shot.at() < 900_000_000L) {
            throw new Rejected("SNOWBALL_COOLDOWN", "잠시 뒤 다시 던져주세요.");
        }
        Windup motion = new Windup(user + ":" + requestId, channel, user, yaw, at.toString(), WINDUP_MILLIS);
        preparations.put(user, new Preparation(requestId, now, motion));
        return motion;
    }

    /** 실발사와 같은 벽 차단·대상 선택 계산이며 소지량·명중·버전을 변경하지 않는다. */
    public Aim preview(String channelId, String userId, Position origin, double yaw,
                       Collection<Target> targets, DoubleUnaryOperator obstacle, long now) {
        requireSnowball(channelId, userId, yaw, now);
        double dx = Math.sin(yaw), dz = Math.cos(yaw);
        double distance = Math.clamp(obstacle.applyAsDouble(yaw), 0, RANGE);
        String hit = "";
        for (Target target : targets) {
            Player victim = players.get(target.userId());
            if (target.userId().equals(userId) || frozen(target.userId(), now)
                    || victim != null && victim.immuneUntil > now) { continue; }
            Position p = target.position();
            double x = p.x() - origin.x(), z = p.z() - origin.z();
            double along = x * dx + z * dz, side = Math.abs(x * dz - z * dx);
            double flightY = origin.y() + .35 + ARC_HEIGHT * Math.sin(Math.PI * along / RANGE);
            if (along > .6 && along < distance && side < .65 && Math.abs(p.y() - flightY) < 1) {
                distance = along; hit = target.userId();
            }
        }
        return new Aim(channelId, userId, yaw, origin.x(), origin.y() + .35, origin.z(),
                origin.x() + dx * distance, origin.y() + .35 + ARC_HEIGHT * Math.sin(Math.PI * distance / RANGE),
                origin.z() + dz * distance, distance, hit);
    }

    public State escape(String requestId, String channel, String user, String freezeId, String key, long now) {
        Player p = players.get(user);
        if (p == null || !p.channel.equals(channel) || !frozen(user, now) || !p.freezeId.equals(freezeId)) {
            throw new Rejected("SNOWBALL_FREEZE_MISMATCH", "현재 얼어 있는 상태를 확인해주세요.");
        }
        if (!List.of("A", "D").contains(key)) { throw new IllegalArgumentException("탈출 키를 확인해주세요."); }
        if (p.escapeRequests.contains(requestId)) { return state(channel); }
        if (p.escapeRequests.size() >= 128) { throw new Rejected("SNOWBALL_ESCAPE_TOO_FREQUENT", "잠시 뒤 다시 눌러주세요."); }
        p.escapeRequests.add(requestId);
        if (p.presses > 0 && now - p.lastPress < 30_000_000L) { return state(channel); }
        p.presses = key.equals(p.lastKey) || p.presses > 0 && now - p.lastPress >= 1_000_000_000L ? 1 : p.presses + 1;
        p.lastKey = key; p.lastPress = now;
        if (p.presses >= ESCAPE_PRESSES) { thaw(p, now); }
        changed(channel);
        return state(channel);
    }

    private void thaw(Player p, long now) {
        p.hits = 0; p.freezeId = ""; p.frozenUntil = null; p.frozenUntilNanos = 0;
        p.lastKey = ""; p.presses = 0; p.immuneUntil = now + 1_500_000_000L;
    }

    public List<String> expire(long now) {
        var thawed = new ArrayList<String>();
        for (var entry : players.entrySet()) {
            Player p = entry.getValue();
            if (p.frozenUntil != null && p.frozenUntilNanos <= now) {
                thaw(p, now); changed(p.channel); thawed.add(entry.getKey());
            }
        }
        return List.copyOf(thawed);
    }

    public void disconnected(String userId) {
        preparations.remove(userId);
        recent.remove(userId);
        pickups.remove(userId);
        flights.removeIf(flight -> flight.event().userId().equals(userId) || flight.event().hitUserId().equals(userId));
        Player p = players.remove(userId);
        if (p != null) { changed(p.channel); }
    }
}
