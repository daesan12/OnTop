package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import java.time.Duration;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

@Service
@Profile("local")
public class WorldChannelRegistry implements ChannelPresence {

    private final Map<String, Room> rooms = new LinkedHashMap<>();
    private final Map<String, String> membership = new HashMap<>();
    private final long minimumMoveNanos;
    private final LongSupplier nanoTime;

    public WorldChannelRegistry(WorldChannelProperties properties) {
        this(properties, Duration.ofMillis(100));
    }

    @Autowired
    public WorldChannelRegistry(WorldChannelProperties properties,
            @Value("${ontop.world.movement.minimum-interval:100ms}") Duration minimumInterval) {
        this(properties, minimumInterval, System::nanoTime);
    }

    public WorldChannelRegistry(WorldChannelProperties properties, Duration minimumInterval, LongSupplier nanoTime) {
        if (minimumInterval == null || minimumInterval.isNegative() || minimumInterval.isZero()
                || minimumInterval.compareTo(Duration.ofSeconds(60)) > 0) {
            throw new IllegalArgumentException("이동 전송 간격은 0 초과 60초 이하여야 합니다.");
        }
        minimumMoveNanos = minimumInterval.toNanos();
        this.nanoTime = nanoTime;
        for (Channel channel : properties.channels()) {
            rooms.put(channel.channelId(), new Room(channel));
        }
    }

    public synchronized Change join(String userId, String channelId) {
        Room room = rooms.get(channelId);
        if (room == null) {
            throw new ChannelException("CHANNEL_NOT_FOUND", "등록되지 않은 채널입니다.");
        }
        String current = membership.get(userId);
        if (current != null) {
            if (!current.equals(channelId)) {
                throw new ChannelException("ALREADY_IN_CHANNEL", "먼저 현재 채널에서 퇴장해주세요.");
            }
            return new Change(room.state(), false);
        }
        if (room.users.size() >= room.definition.capacity()) {
            throw new ChannelException("CHANNEL_FULL", "채널의 빈자리가 없습니다.");
        }
        room.users.add(userId);
        membership.put(userId, channelId);
        room.version++;
        room.worldVersion++;
        return new Change(room.state(), true);
    }

    public synchronized State leave(String userId) {
        State state = disconnect(userId);
        if (state == null) {
            throw new ChannelException("NOT_IN_CHANNEL", "입장한 채널이 없습니다.");
        }
        return state;
    }

    public synchronized State disconnect(String userId) {
        String channelId = membership.remove(userId);
        if (channelId == null) {
            return null;
        }
        Room room = rooms.get(channelId);
        room.users.remove(userId);
        room.positions.remove(userId);
        room.version++;
        room.worldVersion++;
        return room.state();
    }

    public synchronized boolean isInChannel(String userId, String channelId) {
        return channelId.equals(membership.get(userId));
    }

    public synchronized String channelOf(String userId) {
        return membership.get(userId);
    }

    public synchronized WorldState worldState(String channelId) {
        return rooms.get(channelId).worldState();
    }

    public synchronized WorldChange move(String userId, Position position) {
        String channelId = membership.get(userId);
        if (channelId == null) {
            throw new ChannelException("NOT_IN_CHANNEL", "먼저 채널에 입장해주세요.");
        }
        Room room = rooms.get(channelId);
        Movement previous = room.positions.get(userId);
        if (previous != null && position.sequence() <= previous.position().sequence()) {
            return new WorldChange(room.worldState(), false);
        }
        long now = nanoTime.getAsLong();
        if (previous != null && now - previous.acceptedAtNanos() < minimumMoveNanos) {
            throw new ChannelException("MOVE_TOO_FREQUENT", "이동 전송 간격을 확인해주세요.");
        }
        room.positions.put(userId, new Movement(position, now));
        room.worldVersion++;
        return new WorldChange(room.worldState(), true);
    }

    @Override
    public synchronized Map<String, Integer> snapshot() {
        Map<String, Integer> counts = new LinkedHashMap<>();
        rooms.forEach((id, room) -> counts.put(id, room.users.size()));
        return Map.copyOf(counts);
    }

    public synchronized void clear() {
        membership.clear();
        for (Room room : rooms.values()) {
            if (!room.users.isEmpty()) {
                room.users.clear();
                room.positions.clear();
                room.version++;
                room.worldVersion++;
            }
        }
    }

    public record Change(State state, boolean changed) {
    }

    public record Position(long sequence, double x, double y, double z, double yaw) {

        public Position {
            if (sequence < 0 || sequence > 9_007_199_254_740_991L || !Double.isFinite(x)
                    || !Double.isFinite(y) || !Double.isFinite(z) || !Double.isFinite(yaw)) {
                throw new IllegalArgumentException("유효한 이동 순번·좌표·회전각이 필요합니다.");
            }
        }
    }

    public record Avatar(String userId, Position position) {
    }

    public record WorldState(String channelId, long version, List<Avatar> avatars) {

        public WorldState {
            avatars = List.copyOf(avatars);
        }
    }

    public record WorldChange(WorldState state, boolean changed) {
    }

    private record Movement(Position position, long acceptedAtNanos) {
    }

    public record State(String channelId, String name, long version, int capacity, int currentUsers,
            List<String> userIds) {

        public State {
            userIds = List.copyOf(userIds);
        }
    }

    public static final class ChannelException extends RuntimeException {

        private final String code;

        private ChannelException(String code, String message) {
            super(message);
            this.code = code;
        }

        public String code() {
            return code;
        }
    }

    private static final class Room {

        private final Channel definition;
        private final LinkedHashSet<String> users = new LinkedHashSet<>();
        private final Map<String, Movement> positions = new HashMap<>();
        private long version;
        private long worldVersion;

        private Room(Channel definition) {
            this.definition = definition;
        }

        private State state() {
            return new State(definition.channelId(), definition.name(), version, definition.capacity(), users.size(),
                    List.copyOf(users));
        }

        private WorldState worldState() {
            return new WorldState(definition.channelId(), worldVersion, users.stream()
                    .map(user -> new Avatar(user, positions.containsKey(user) ? positions.get(user).position() : null))
                    .toList());
        }
    }
}
