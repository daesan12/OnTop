package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.movement.MoveInput;
import com.ssafy.ontop.world.movement.ParkScene;
import com.ssafy.ontop.world.movement.WorldPhysics;
import java.time.Duration;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.function.LongSupplier;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class WorldChannelRegistry implements ChannelPresence {

    private final Map<String, Room> rooms = new LinkedHashMap<>();
    private final Map<String, String> membership = new HashMap<>();
    private final long minimumMoveNanos;
    private final LongSupplier nanoTime;
    private long lastStep;
    private long lastPatch;

    public WorldChannelRegistry(WorldChannelProperties properties) {
        this(properties, Duration.ofMillis(50));
    }

    @Autowired
    public WorldChannelRegistry(WorldChannelProperties properties,
            @Value("${ontop.world.movement.minimum-interval:50ms}") Duration minimumInterval) {
        this(properties, minimumInterval, System::nanoTime);
    }

    public WorldChannelRegistry(WorldChannelProperties properties, Duration minimumInterval, LongSupplier nanoTime) {
        if (minimumInterval == null || minimumInterval.isNegative() || minimumInterval.isZero()
                || minimumInterval.compareTo(Duration.ofSeconds(60)) > 0) {
            throw new IllegalArgumentException("이동 전송 간격은 0 초과 60초 이하여야 합니다.");
        }
        minimumMoveNanos = minimumInterval.toNanos();
        this.nanoTime = nanoTime;
        lastStep = lastPatch = nanoTime.getAsLong();
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
        if (room.physics == null) {
            room.physics = new WorldPhysics();
        }
        room.physics.add(userId);
        room.users.add(userId);
        room.positions.put(userId, new Movement(position(room.physics.snapshot(userId)), Long.MIN_VALUE));
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
        room.physics.remove(userId);
        if (room.users.isEmpty()) {
            room.physics.close();
            room.physics = null;
        }
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

    public synchronized Position positionOf(String userId) {
        String channelId = membership.get(userId);
        if (channelId == null) {
            return null;
        }
        Movement movement = rooms.get(channelId).positions.get(userId);
        return movement == null ? null : movement.position();
    }

    public synchronized WorldState worldState(String channelId) {
        return rooms.get(channelId).worldState();
    }

    /** Trusted server fixture relocation; never used by the WebSocket movement handler. */
    public synchronized WorldChange move(String userId, Position position) {
        String channelId = membership.get(userId);
        if (channelId == null) {
            throw new ChannelException("NOT_IN_CHANNEL", "먼저 채널에 입장해주세요.");
        }
        Room room = rooms.get(channelId);
        Movement previous = room.positions.get(userId);
        if (previous != null && previous.acceptedAtNanos() != Long.MIN_VALUE
                && position.sequence() <= previous.position().sequence()) {
            return new WorldChange(room.worldState(), false);
        }
        long now = nanoTime.getAsLong();
        if (previous != null && previous.acceptedAtNanos() != Long.MIN_VALUE
                && now - previous.acceptedAtNanos() < minimumMoveNanos) {
            throw new ChannelException("MOVE_TOO_FREQUENT", "이동 전송 간격을 확인해주세요.");
        }
        room.positions.put(userId, new Movement(position, now));
        room.worldVersion++;
        return new WorldChange(room.worldState(), true);
    }

    public synchronized WorldChange input(String userId, MoveInput input) {
        String channelId = membership.get(userId);
        if (channelId == null) {
            throw new ChannelException("NOT_IN_CHANNEL", "먼저 채널에 입장해주세요.");
        }
        Room room = rooms.get(channelId);
        long now = nanoTime.getAsLong();
        Movement previous = room.positions.get(userId);
        if (input.seq() > previous.position().lastInputSeq() && previous.acceptedAtNanos() != Long.MIN_VALUE
                && now - previous.acceptedAtNanos() < minimumMoveNanos) {
            throw new ChannelException("MOVE_TOO_FREQUENT", "이동 입력 전송 간격을 확인해주세요.");
        }
        boolean changed = room.physics.input(userId, input, now);
        if (changed) {
            Position p = previous.position();
            room.positions.put(userId, new Movement(new Position(input.seq(), p.x(), p.y(), p.z(), p.yaw(),
                    p.moving(), p.running(), p.swimming()), now));
            room.worldVersion++;
            room.dirty = true;
        }
        return new WorldChange(room.worldState(), changed);
    }

    public synchronized void stopMovement(String userId) {
        String channelId = membership.get(userId);
        if (channelId != null) {
            rooms.get(channelId).physics.stop(userId);
        }
    }

    /** Fixed simulation time, bounded catch-up. Client input frequency cannot add simulation steps. */
    public synchronized List<WorldState> advance(java.util.Set<String> seated) {
        long now = nanoTime.getAsLong();
        int steps = (int) Math.min(3, Math.max(0, (now - lastStep) / WorldPhysics.STEP_NANOS));
        if (steps == 0) {
            return List.of();
        }
        for (int i = 0; i < steps; i++) {
            long tick = now - (steps - i - 1) * WorldPhysics.STEP_NANOS;
            for (Room room : rooms.values()) {
                if (room.physics != null) {
                    room.physics.step(tick, seated);
                }
            }
        }
        lastStep = now - lastStep > 3 * WorldPhysics.STEP_NANOS ? now : lastStep + steps * WorldPhysics.STEP_NANOS;
        var changes = new java.util.ArrayList<WorldState>();
        for (Room room : rooms.values()) {
            if (room.physics == null) {
                continue;
            }
            boolean changed = false;
            for (String id : room.users) {
                Position next = position(room.physics.snapshot(id));
                Movement previous = room.positions.get(id);
                if (!next.equals(previous.position())) {
                    room.positions.put(id, new Movement(next, previous.acceptedAtNanos()));
                    changed = true;
                }
            }
            if (changed) {
                room.worldVersion++;
                room.dirty = true;
            }
            if (room.dirty && now - lastPatch >= 100_000_000L) {
                changes.add(room.worldState());
                room.dirty = false;
            }
        }
        if (now - lastPatch >= 100_000_000L) {
            lastPatch = now;
        }
        return List.copyOf(changes);
    }

    private static Position position(WorldPhysics.Snapshot state) {
        return new Position(state.lastInputSeq(), state.x(), state.y(), state.z(), state.yaw(),
                state.moving(), state.running(), state.swimming());
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
            if (room.physics != null) {
                room.physics.close();
                room.physics = null;
            }
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

    public record Position(long lastInputSeq, double x, double y, double z, double yaw,
            boolean moving, boolean running, boolean swimming) {
        public Position(long seq, double x, double y, double z, double yaw) {
            this(seq, x, y, z, yaw, false, false, false);
        }
        public long sequence() { return lastInputSeq; }

        public Position {
            if (lastInputSeq < 0 || lastInputSeq > 9_007_199_254_740_991L || !Double.isFinite(x)
                    || !Double.isFinite(y) || !Double.isFinite(z) || !Double.isFinite(yaw)) {
                throw new IllegalArgumentException("유효한 이동 순번·좌표·회전각이 필요합니다.");
            }
        }
    }

    public record Avatar(String userId, Position position) {
    }

    public record WorldState(String channelId, long version, List<Avatar> avatars, String mapVersion) {

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
        private WorldPhysics physics;
        private boolean dirty;

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
                    .toList(), ParkScene.load().version());
        }
    }
}
