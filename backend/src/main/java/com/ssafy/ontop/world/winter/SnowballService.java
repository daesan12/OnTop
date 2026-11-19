package com.ssafy.ontop.world.winter;

import com.ssafy.ontop.world.service.WorldChannelRegistry.Position;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.DoubleUnaryOperator;

/** TableHub 잠금 아래에서 눈 소지·명중·동결·탈출을 확정한다. 재화/경기 상태는 만들지 않는다. */
public final class SnowballService {
    public static final double RANGE = 16;
    public static final int FREEZE_SECONDS = 5;
    public static final int ESCAPE_PRESSES = 6;
    private final Map<String, Recent> recent = new HashMap<>();
    private final Map<String, Player> players = new HashMap<>();
    private final Map<String, Long> versions = new HashMap<>();

    public record Target(String userId, Position position) { }
    public record Event(String shotId, String channelId, String userId, String hitUserId,
                        double x, double y, double z, double endX, double endY, double endZ,
                        String sentAt, int durationMs) { }
    public record PlayerState(String userId, int snowballs, int hits, String freezeId,
                              String frozenUntil, int escapePresses) { }
    public record State(String channelId, long version, List<PlayerState> players) { }
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

    public State pickup(String channel, String user, long now) {
        if (frozen(user, now)) { throw new Rejected("SNOWBALL_FROZEN", "얼음부터 깨고 눈을 주워주세요."); }
        Player p = player(channel, user);
        if (p.snowballs == 0) { p.snowballs = 1; changed(channel); }
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
        if (!Double.isFinite(yaw) || Math.abs(yaw) > Math.PI) {
            throw new IllegalArgumentException("눈덩이를 던질 방향을 확인해주세요.");
        }
        Player shooter = player(channelId, userId);
        if (frozen(userId, now)) { throw new Rejected("SNOWBALL_FROZEN", "얼음부터 깨고 던져주세요."); }
        if (shooter.snowballs == 0) { throw new Rejected("SNOWBALL_REQUIRED", "바닥의 눈더미에서 눈을 먼저 주워주세요."); }
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
            double flightY = origin.y() + .35 + .7 * Math.sin(Math.PI * along / RANGE);
            if (along > .6 && along < distance && side < .65 && Math.abs(p.y() - flightY) < 1) {
                distance = along; hit = target.userId();
            }
        }
        shooter.snowballs = 0;
        if (!hit.isEmpty()) {
            Player victim = player(channelId, hit);
            victim.hits++;
            if (victim.hits == 3) {
                victim.snowballs = 0;
                victim.freezeId = UUID.randomUUID().toString();
                victim.frozenUntil = sentAt.plusSeconds(FREEZE_SECONDS);
                victim.frozenUntilNanos = now + FREEZE_SECONDS * 1_000_000_000L;
                victim.lastKey = ""; victim.presses = 0; victim.escapeRequests.clear();
            }
        }
        changed(channelId);
        Event event = new Event(userId + ":" + requestId, channelId, userId, hit, origin.x(), origin.y() + .35, origin.z(),
                origin.x() + dx * distance, origin.y() + .35 + .7 * Math.sin(Math.PI * distance / RANGE),
                origin.z() + dz * distance, sentAt.toString(), (int) Math.max(100, distance / 22 * 1000));
        recent.put(userId, new Recent(requestId, channelId, now, event));
        return event;
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
        recent.remove(userId);
        Player p = players.remove(userId);
        if (p != null) { changed(p.channel); }
    }
}
