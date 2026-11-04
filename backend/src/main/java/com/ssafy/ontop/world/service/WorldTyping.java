package com.ssafy.ontop.world.service;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.function.LongSupplier;

/** Ephemeral channel presence only; never retains a chat draft or writes to the DB. Owned by the Hub lock. */
public final class WorldTyping {
    private static final long TTL = Duration.ofSeconds(5).toNanos();
    private static final long MINIMUM_UPDATE = Duration.ofSeconds(1).toNanos();
    private final LongSupplier now;
    private final Map<String, Entry> users = new HashMap<>();
    private final Map<String, Long> admitted = new HashMap<>();
    private final Map<String, Long> versions = new HashMap<>();

    public WorldTyping(LongSupplier now) { this.now = now; }

    public boolean update(String channelId, String userId, boolean typing) {
        long time = now.getAsLong();
        if (!typing) { return remove(userId) != null; }
        Long previous = admitted.get(userId);
        // Stop/start is a new state transition; only redundant active refreshes are throttled.
        // The existing WebSocket ingress guard still limits rapid toggling.
        if (users.containsKey(userId) && previous != null && time - previous < MINIMUM_UPDATE) { return false; }
        admitted.put(userId, time);
        users.put(userId, new Entry(channelId, time));
        versions.merge(channelId, 1L, Long::sum);
        return true;
    }

    public String remove(String userId) {
        Entry removed = users.remove(userId);
        if (removed == null) { return null; }
        versions.merge(removed.channelId(), 1L, Long::sum);
        return removed.channelId();
    }

    public String disconnected(String userId) {
        admitted.remove(userId);
        return remove(userId);
    }

    public State state(String channelId) {
        long time = now.getAsLong();
        users.entrySet().removeIf(entry -> time - entry.getValue().at() >= TTL);
        List<User> active = users.entrySet().stream()
                .filter(entry -> entry.getValue().channelId().equals(channelId))
                .map(entry -> new User(entry.getKey(), Math.max(1, (TTL - (time - entry.getValue().at())) / 1_000_000)))
                .sorted(java.util.Comparator.comparing(User::userId)).toList();
        return new State(channelId, versions.getOrDefault(channelId, 0L), active);
    }

    public void clear() { users.clear(); admitted.clear(); versions.clear(); }
    private record Entry(String channelId, long at) { }
    public record User(String userId, long expiresInMs) { }
    public record State(String channelId, long version, List<User> users) { }
}
