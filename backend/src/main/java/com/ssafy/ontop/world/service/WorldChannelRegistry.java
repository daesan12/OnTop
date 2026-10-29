package com.ssafy.ontop.world.service;

import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.DynamicChannelsProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.movement.MoveInput;
import com.ssafy.ontop.world.movement.ParkScene;
import com.ssafy.ontop.world.movement.WorldPhysics;
import com.ssafy.ontop.world.map.WorldMapRuntime;
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
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(WorldChannelRegistry.class);
    private long physicsTick;
    private TickTiming lastTiming = new TickTiming(0, 0, 0, 0, 0);
    public record TickTiming(long tick, long schedulerLagNanos, int steps, long processingNanos, int worldPatches) {}
    public synchronized TickTiming lastTickTiming() { return lastTiming; }

    /** Upper bound for a server-issued activity end: v5 is 1s buffer + 3.5s countdown + 180s play. */
    public static final Duration MAX_MINIGAME_ACTIVITY = Duration.ofSeconds(200);
    /** An ended session is remembered so its late start or end cannot change a newer session. */
    private static final long ENDED_MINIGAME_RETENTION_NANOS = Duration.ofMinutes(10).toNanos();

    private final Map<String, Room> rooms = new LinkedHashMap<>();
    private final Map<String, String> membership = new HashMap<>();
    // Per user, not per room: reconnects and channel moves keep an ongoing game's public activity.
    private final Map<String, MinigamePresence> minigames = new HashMap<>();
    private final Map<String, String> boardGames = new HashMap<>();
    private final long minimumMoveNanos;
    private final LongSupplier nanoTime;
    private final java.util.function.Supplier<ParkScene> scene;
    private long lastStep;
    private long lastPatch;
    private boolean clientPositions;

    @Autowired
    void configurePositionReports(@Value("${ontop.world.movement.client-position:false}") boolean enabled,
            org.springframework.core.env.Environment environment) {
        if (enabled && (!environment.acceptsProfiles(org.springframework.core.env.Profiles.of("local"))
                || environment.acceptsProfiles(org.springframework.core.env.Profiles.of("dev", "prod")))) {
            throw new IllegalArgumentException("위치 보고 실험은 local 프로필에서만 허용합니다.");
        }
        clientPositions = enabled;
    }

    public WorldChannelRegistry(WorldChannelProperties properties) {
        this(properties, Duration.ofMillis(50));
    }

    public WorldChannelRegistry(WorldChannelProperties properties,
            @Value("${ontop.world.movement.minimum-interval:50ms}") Duration minimumInterval) {
        this(properties, minimumInterval, System::nanoTime);
    }

    @Autowired
    public WorldChannelRegistry(WorldChannelProperties properties,
            @Value("${ontop.world.movement.minimum-interval:50ms}") Duration minimumInterval,
            WorldMapRuntime runtime, DynamicChannelsProperties dynamicChannels) {
        this(properties, minimumInterval, System::nanoTime, runtime::scene, dynamicChannels);
    }

    public WorldChannelRegistry(WorldChannelProperties properties, Duration minimumInterval, LongSupplier nanoTime) {
        this(properties, minimumInterval, nanoTime, ParkScene::load);
    }

    public WorldChannelRegistry(WorldChannelProperties properties, Duration minimumInterval, LongSupplier nanoTime,
            ParkScene scene) {
        this(properties, minimumInterval, nanoTime, () -> java.util.Objects.requireNonNull(scene));
    }

    private WorldChannelRegistry(WorldChannelProperties properties, Duration minimumInterval, LongSupplier nanoTime,
            java.util.function.Supplier<ParkScene> scene) {
        this(properties, minimumInterval, nanoTime, scene, DynamicChannelsProperties.disabled());
    }

    private WorldChannelRegistry(WorldChannelProperties properties, Duration minimumInterval, LongSupplier nanoTime,
            java.util.function.Supplier<ParkScene> scene, DynamicChannelsProperties dynamicChannels) {
        if (minimumInterval == null || minimumInterval.isNegative() || minimumInterval.isZero()
                || minimumInterval.compareTo(Duration.ofSeconds(60)) > 0) {
            throw new IllegalArgumentException("이동 전송 간격은 0 초과 60초 이하여야 합니다.");
        }
        minimumMoveNanos = minimumInterval.toNanos();
        this.nanoTime = nanoTime;
        this.scene = java.util.Objects.requireNonNull(scene);
        lastStep = lastPatch = nanoTime.getAsLong();
        List<Channel> initial = properties.channels();
        if (dynamicChannels.enabled()) {
            if (initial.isEmpty()) {
                initial = List.of(new Channel("channel-1", "운영 공원 1", dynamicChannels.capacity()));
            } else if (initial.size() != 1 || initial.getFirst().capacity() != dynamicChannels.capacity()) {
                throw new IllegalArgumentException("유동 채널은 정원이 일치하는 초기 채널 하나만 허용합니다.");
            }
        }
        for (Channel channel : initial) {
            rooms.put(channel.channelId(), new Room(channel, scene, this::activity));
        }
    }

    public synchronized List<Channel> definitions() {
        return rooms.values().stream().map(room -> room.definition).toList();
    }

    /** Called only after the matching tables and watch anchors have been prepared. */
    public synchronized void addChannel(Channel definition) {
        if (rooms.containsKey(definition.channelId())) {
            throw new IllegalArgumentException("이미 등록된 채널 ID입니다.");
        }
        rooms.put(definition.channelId(), new Room(definition, scene, this::activity));
    }

    public synchronized void removeEmptyChannel(String channelId) {
        Room room = rooms.get(channelId);
        if (room == null || !room.users.isEmpty() || room.physics != null || rooms.size() <= 1) {
            throw new IllegalStateException("사용 중이거나 마지막 채널은 정리할 수 없습니다.");
        }
        rooms.remove(channelId);
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
        long started = System.nanoTime();
        boolean cold = room.physics == null;
        if (cold) {
            room.physics = new WorldPhysics(scene.get(), clientPositions, nanoTime);
            room.physics.chairCounts(chairCounts(room.tables));
        }
        room.physics.add(userId);
        log.debug("공원 진입 물리 준비 cold={} elapsedMs={}", cold, (System.nanoTime() - started) / 1_000_000.0);
        room.users.add(userId);
        room.positions.put(userId, new Movement(snapshotPosition(room, userId), Long.MIN_VALUE));
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
        room.motions.remove(userId);
        room.moveBudgets.remove(userId);
        room.equipment.remove(userId);
        room.profiles.remove(userId);
        room.tableSeats.remove(userId);
        room.held.remove(userId);
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

    /**
     * Only committed minigame events change this public activity; no client setter exists. A positive
     * remaining time starts or extends the session, zero or less ends it. Session IDs only grow, so an
     * older session's late event and a start arriving after its own end are ignored. Returns the channel
     * state to broadcast when the visible activity changed, otherwise null.
     */
    public synchronized WorldState minigameActivity(String userId, long sessionId, Duration remaining) {
        long now = nanoTime.getAsLong();
        MinigamePresence previous = minigames.get(userId);
        boolean active = remaining != null && !remaining.isNegative() && !remaining.isZero();
        if (previous != null && (previous.sessionId() > sessionId
                || previous.sessionId() == sessionId && !previous.active() && active)) {
            return null;
        }
        long until = active ? now + Math.min(remaining.toNanos(), MAX_MINIGAME_ACTIVITY.toNanos()) : 0;
        boolean wasActive = previous != null && previous.active();
        minigames.put(userId, new MinigamePresence(sessionId, until, now));
        String channelId = membership.get(userId);
        if (channelId == null || wasActive == active) {
            return null;
        }
        Room room = rooms.get(channelId);
        room.worldVersion++;
        return room.worldState();
    }

    private boolean cooking(String userId) {
        MinigamePresence presence = minigames.get(userId);
        return presence != null && presence.active();
    }

    private String activity(String userId) {
        return cooking(userId) ? "BUNGEOPPANG" : boardGames.containsKey(userId) ? "GAME" : null;
    }

    /** Hub 현재 라운드의 확정 참가자 전체 투영. 오래된 사건으로 개별 값을 덮지 않는다. */
    public synchronized List<WorldState> boardGames(Map<String, String> current) {
        var changed = new java.util.HashSet<String>();
        var users = new java.util.HashSet<>(boardGames.keySet()); users.addAll(current.keySet());
        for (String user : users) {
            if (!java.util.Objects.equals(boardGames.get(user), current.get(user))) {
                String channel = membership.get(user);
                if (channel != null) { changed.add(channel); }
            }
        }
        boardGames.clear(); boardGames.putAll(current);
        return changed.stream().map(id -> { Room room = rooms.get(id); room.worldVersion++; return room.worldState(); }).toList();
    }

    /** 현재 승인 설정과 점유 좌석에서 계산한 공개 의자 수. 새 접속도 전체 목록을 받는다. */
    public synchronized void tables(String channelId, List<PublicTable> tables) {
        Room room = rooms.get(channelId);
        if (room == null) { return; }
        var copy = List.copyOf(tables);
        if (copy.equals(room.tables)) { return; }
        if (room.physics != null) {
            room.physics.chairCounts(chairCounts(copy)).forEach((user, moved) -> {
                Movement previous = room.positions.get(user);
                room.positions.put(user, new Movement(position(moved), previous.acceptedAtNanos()));
                room.motions.put(user, moved.motion());
            });
        }
        room.tables = copy;
        room.worldVersion++;
    }

    private static Map<String, Integer> chairCounts(List<PublicTable> tables) {
        Map<String, Integer> counts = new HashMap<>();
        for (var table : tables) { if (table.anchorId() != null) { counts.put(table.anchorId(), table.chairCount()); } }
        return counts;
    }

    public record PublicTable(String tableId, String anchorId, int chairCount) {
        public PublicTable {
            if (tableId == null || tableId.isBlank() || chairCount < 2 || chairCount > 4) {
                throw new IllegalArgumentException("공개 테이블 의자 설정이 올바르지 않습니다.");
            }
        }
    }

    public synchronized boolean hasMovementActivity(String userId) {
        String channelId = membership.get(userId);
        return channelId != null && rooms.get(channelId).physics.hasMovementActivity(userId, nanoTime.getAsLong());
    }

    public synchronized WorldState equipment(String userId, List<WorldAppearanceGateway.Equipment> equipment) {
        String channelId = membership.get(userId);
        if (channelId == null) { return null; }
        var copy = List.copyOf(equipment);
        if (copy.size() > 5 || copy.stream().map(WorldAppearanceGateway.Equipment::equipSlot).distinct().count()
                != copy.size()) {
            throw new IllegalArgumentException("장착 부위별 하나의 의상만 전송할 수 있습니다.");
        }
        Room room = rooms.get(channelId);
        if (copy.equals(room.equipment.get(userId))) { return null; }
        room.equipment.put(userId, copy);
        room.worldVersion++;
        return room.worldState();
    }

    public synchronized WorldState profile(String userId, WorldProfileGateway.Profile profile) {
        String channelId = membership.get(userId);
        if (channelId == null) {
            return null;
        }
        Room room = rooms.get(channelId);
        if (profile.equals(room.profiles.get(userId))) {
            return null;
        }
        room.profiles.put(userId, profile);
        room.worldVersion++;
        return room.worldState();
    }

    /** Hub 잠금 안에서 실제 좌석을 복사한다. 이동이 없어도 다음 월드 방송에 포함한다. */
    public synchronized void tableSeats(String channelId, Map<String, TableSeat> seats) {
        Room room = rooms.get(channelId);
        if (room == null) { return; }
        Map<String, TableSeat> present = new HashMap<>();
        seats.forEach((user, seat) -> {
            if (room.users.contains(user)) { present.put(user, java.util.Objects.requireNonNull(seat)); }
        });
        if (present.equals(room.tableSeats)) { return; }
        room.tableSeats.clear();
        room.tableSeats.putAll(present);
        room.worldVersion++;
        room.dirty = true;
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
        if (input.seq() > previous.position().lastInputSeq()
                && !room.moveBudgets.computeIfAbsent(userId, ignored -> new MoveBudget(now)).take(now, minimumMoveNanos)) {
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

    public synchronized WorldChange reportPosition(String userId,
            com.ssafy.ontop.world.movement.ClientPositionValidator.Candidate report) {
        if (!clientPositions) throw new ChannelException("UNSUPPORTED_MESSAGE_TYPE", "위치 보고 모드는 비활성화 상태입니다.");
        String channel = membership.get(userId);
        if (channel == null) throw new ChannelException("NOT_IN_CHANNEL", "먼저 채널에 입장해주세요.");
        Room room = rooms.get(channel);
        if (room.held.contains(userId) || room.tableSeats.containsKey(userId) || activity(userId) != null)
            throw new ChannelException("ACTIVITY_BUSY", "활동을 종료한 뒤 이동해주세요.");
        long now = nanoTime.getAsLong();
        Movement previous = room.positions.get(userId);
        if (report.seq() > previous.position().lastInputSeq()
                && !room.moveBudgets.computeIfAbsent(userId, ignored -> new MoveBudget(now)).take(now, minimumMoveNanos))
            throw new ChannelException("MOVE_TOO_FREQUENT", "위치 보고 간격을 확인해주세요.");
        var snapshot = room.physics.report(userId, report, now);
        Position position = position(snapshot);
        boolean changed = !position.equals(previous.position()) || !snapshot.motion().equals(room.motions.get(userId));
        room.positions.put(userId, new Movement(position, now));
        room.motions.put(userId, snapshot.motion());
        if (changed) { room.worldVersion++; room.dirty = true; }
        return new WorldChange(room.worldState(), changed);
    }

    public synchronized WorldChange serverMovement(String userId) {
        Room room = rooms.get(membership.get(userId));
        if (!clientPositions) return new WorldChange(room.worldState(), false);
        var snapshot = room.physics.serverMovement(userId);
        var previous = room.positions.get(userId);
        boolean changed = !snapshot.motion().equals(room.motions.get(userId));
        room.positions.put(userId, new Movement(position(snapshot), previous.acceptedAtNanos()));
        room.motions.put(userId, snapshot.motion());
        if (changed) { room.worldVersion++; room.dirty = true; }
        return new WorldChange(room.worldState(), changed);
    }
    public synchronized WorldChange disablePosition(String userId, long epoch) {
        if (!clientPositions) throw new ChannelException("UNSUPPORTED_MESSAGE_TYPE", "위치 보고 모드는 비활성화 상태입니다.");
        Room room = rooms.get(membership.get(userId));
        if (room == null) throw new ChannelException("NOT_IN_CHANNEL", "먼저 채널에 입장해주세요.");
        var snapshot = room.physics.disablePosition(userId, epoch);
        var previous = room.positions.get(userId);
        boolean changed = !snapshot.motion().equals(room.motions.get(userId));
        room.positions.put(userId, new Movement(position(snapshot), previous.acceptedAtNanos()));
        room.motions.put(userId, snapshot.motion());
        if (changed) { room.worldVersion++; room.dirty = true; }
        return new WorldChange(room.worldState(), changed);
    }

    public synchronized void holdFacility(String userId, WorldFacilityService.Pose pose) {
        Room room = rooms.get(membership.get(userId));
        room.physics.hold(userId, pose.x(), pose.y(), pose.z(), pose.yaw());
        room.held.add(userId);
        Movement previous = room.positions.get(userId);
        room.positions.put(userId, new Movement(snapshotPosition(room, userId), previous.acceptedAtNanos()));
        room.worldVersion++;
    }

    public synchronized WorldFacilityService.Pose facilityExit(String userId, WorldFacilityService.Lease lease) {
        Room room = rooms.get(membership.get(userId));
        for (var pose : List.of(lease.exit(), lease.returnPose())) {
            if (room.physics.canStand(pose.x(), pose.y(), pose.z())) {
                return pose;
            }
        }
        return null;
    }

    public synchronized void releaseFacility(String userId, WorldFacilityService.Pose pose) {
        holdFacility(userId, pose);
        rooms.get(membership.get(userId)).held.remove(userId);
    }

    /** Fixed simulation time, bounded catch-up. Client input frequency cannot add simulation steps. */
    public synchronized List<WorldState> advance(java.util.Set<String> seated) {
        return advance(seated, List.of());
    }

    public synchronized List<WorldState> advance(java.util.Set<String> seated,
            List<WorldFollowService.State> following) {
        Map<String, Map<String, String>> targets = new HashMap<>();
        for (var state : following) {
            Map<String, String> links = new HashMap<>();
            state.links().forEach(link -> links.put(link.followerId(), link.targetId()));
            targets.put(state.channelId(), links);
        }
        long now = nanoTime.getAsLong();
        int steps = (int) Math.min(3, Math.max(0, (now - lastStep) / WorldPhysics.STEP_NANOS));
        if (steps == 0) {
            return List.of();
        }
        long processingStarted = System.nanoTime();
        long schedulerLag = Math.max(0, now - lastStep - WorldPhysics.STEP_NANOS);
        for (int i = 0; i < steps; i++) {
            physicsTick++;
            long tick = now - (steps - i - 1) * WorldPhysics.STEP_NANOS;
            for (Room room : rooms.values()) {
                if (room.physics != null) {
                    var frozen = new java.util.HashSet<>(seated);
                    frozen.addAll(room.held);
                    if (clientPositions) room.users.stream().filter(user -> activity(user) != null).forEach(frozen::add);
                    room.physics.step(tick, frozen, targets.getOrDefault(room.definition.channelId(), Map.of()));
                }
            }
        }
        lastStep = now - lastStep > 3 * WorldPhysics.STEP_NANOS ? now : lastStep + steps * WorldPhysics.STEP_NANOS;
        expireMinigames(now);
        var changes = new java.util.ArrayList<WorldState>();
        for (Room room : rooms.values()) {
            if (room.physics == null) {
                continue;
            }
            boolean changed = false;
            for (String id : room.users) {
                Position next = snapshotPosition(room, id);
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
        lastTiming = new TickTiming(physicsTick, schedulerLag, steps, System.nanoTime() - processingStarted, changes.size());
        if (!changes.isEmpty()) {
            log.debug("공원 물리/방송 준비 tick={} steps={} schedulerLagMs={} processingMs={} patches={}",
                    physicsTick, steps, schedulerLag / 1_000_000.0, lastTiming.processingNanos() / 1_000_000.0, changes.size());
        }
        return List.copyOf(changes);
    }

    /** Ends activity at its server-issued deadline even without an end event, then forgets old endings. */
    private void expireMinigames(long now) {
        var iterator = minigames.entrySet().iterator();
        while (iterator.hasNext()) {
            var entry = iterator.next();
            MinigamePresence presence = entry.getValue();
            if (presence.active() && now - presence.untilNanos() >= 0) {
                entry.setValue(new MinigamePresence(presence.sessionId(), 0, now));
                String channelId = membership.get(entry.getKey());
                if (channelId != null) {
                    Room room = rooms.get(channelId);
                    room.worldVersion++;
                    room.dirty = true;
                }
            } else if (!presence.active() && now - presence.updatedNanos() >= ENDED_MINIGAME_RETENTION_NANOS) {
                iterator.remove();
            }
        }
    }

    private static Position position(WorldPhysics.Snapshot state) {
        return new Position(state.lastInputSeq(), state.x(), state.y(), state.z(), state.yaw(),
                state.moving(), state.running(), state.swimming());
    }

    private static Position snapshotPosition(Room room, String id) {
        var snapshot = room.physics.snapshot(id);
        room.motions.put(id, snapshot.motion());
        return position(snapshot);
    }

    @Override
    public synchronized Map<String, Integer> snapshot() {
        Map<String, Integer> counts = new LinkedHashMap<>();
        rooms.forEach((id, room) -> counts.put(id, room.users.size()));
        return Map.copyOf(counts);
    }

    public synchronized void clear() {
        membership.clear();
        minigames.clear();
        boardGames.clear();
        for (Room room : rooms.values()) {
            if (room.physics != null) {
                room.physics.close();
                room.physics = null;
            }
            if (!room.users.isEmpty()) {
                room.users.clear();
                room.positions.clear();
                room.motions.clear();
                room.moveBudgets.clear();
                room.equipment.clear();
                room.profiles.clear();
                room.tableSeats.clear();
                room.tables = List.of();
                room.held.clear();
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

    public record Avatar(String userId, Position position, List<WorldAppearanceGateway.Equipment> equipment,
            String nickname, String characterGender,
            @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.ALWAYS)
            TableSeat tableSeat,
            /** Public server-approved GAME/BUNGEOPPANG activity; no private game data. */
            @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.ALWAYS)
            String activity,
            @com.fasterxml.jackson.annotation.JsonInclude(com.fasterxml.jackson.annotation.JsonInclude.Include.NON_NULL)
            WorldPhysics.Motion motion) {
        public Avatar(String userId, Position position, List<WorldAppearanceGateway.Equipment> equipment,
                String nickname, String characterGender, TableSeat tableSeat, String activity) {
            this(userId, position, equipment, nickname, characterGender, tableSeat, activity, null);
        }
        public Avatar(String userId, Position position, List<WorldAppearanceGateway.Equipment> equipment,
                String nickname, String characterGender, TableSeat tableSeat) {
            this(userId, position, equipment, nickname, characterGender, tableSeat, null);
        }
        public Avatar(String userId, Position position, List<WorldAppearanceGateway.Equipment> equipment,
                String nickname, String characterGender) {
            this(userId, position, equipment, nickname, characterGender, null);
        }
        public Avatar(String userId, Position position, List<WorldAppearanceGateway.Equipment> equipment) {
            this(userId, position, equipment, null, null, null);
        }
    }

    public record TableSeat(String tableId, int seatNumber) {
        public TableSeat {
            if (tableId == null || tableId.isBlank() || seatNumber < 1 || seatNumber > 4) {
                throw new IllegalArgumentException("공개 착석 정보는 실제 테이블과 1~4번 좌석이어야 합니다.");
            }
        }
    }

    public record WorldState(String channelId, long version, List<Avatar> avatars, String mapVersion,
            List<PublicTable> tables) {

        public WorldState(String channelId, long version, List<Avatar> avatars, String mapVersion) {
            this(channelId, version, avatars, mapVersion, List.of());
        }

        public WorldState {
            avatars = List.copyOf(avatars);
            tables = List.copyOf(tables);
        }
    }

    public record WorldChange(WorldState state, boolean changed) {
    }

    private record Movement(Position position, long acceptedAtNanos) {
    }

    /** Same average admission rate, with four packets of TCP/scheduler jitter tolerance.
     * Accepted inputs still replace one intent; they cannot add physics time or movement steps. */
    private static final class MoveBudget {
        private double tokens = 4;
        private long previous;
        private MoveBudget(long now) { previous = now; }
        private boolean take(long now, long interval) {
            if (now > previous) { tokens = Math.min(4, tokens + (double) (now - previous) / interval); previous = now; }
            if (tokens < 1) { return false; }
            tokens--;
            return true;
        }
    }

    /** untilNanos 0 marks an ended session; updatedNanos dates that ending for retention. */
    private record MinigamePresence(long sessionId, long untilNanos, long updatedNanos) {
        boolean active() { return untilNanos != 0; }
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
        private final java.util.function.Supplier<ParkScene> scene;
        private final java.util.function.Function<String, String> activity;

        private final Channel definition;
        private final LinkedHashSet<String> users = new LinkedHashSet<>();
        private final Map<String, Movement> positions = new HashMap<>();
        private final Map<String, WorldPhysics.Motion> motions = new HashMap<>();
        private final Map<String, MoveBudget> moveBudgets = new HashMap<>();
        private final Map<String, List<WorldAppearanceGateway.Equipment>> equipment = new HashMap<>();
        private final Map<String, WorldProfileGateway.Profile> profiles = new HashMap<>();
        private final Map<String, TableSeat> tableSeats = new HashMap<>();
        private List<PublicTable> tables = List.of();
        private final java.util.Set<String> held = new java.util.HashSet<>();
        private long version;
        private long worldVersion;
        private WorldPhysics physics;
        private boolean dirty;

        private Room(Channel definition, java.util.function.Supplier<ParkScene> scene,
                java.util.function.Function<String, String> activity) {
            this.definition = definition;
            this.scene = scene;
            this.activity = activity;
        }

        private State state() {
            return new State(definition.channelId(), definition.name(), version, definition.capacity(), users.size(),
                    List.copyOf(users));
        }

        private WorldState worldState() {
            return new WorldState(definition.channelId(), worldVersion, users.stream()
                    .map(user -> new Avatar(user, positions.containsKey(user) ? positions.get(user).position() : null,
                            equipment.get(user), profiles.containsKey(user) ? profiles.get(user).nickname() : null,
                            profiles.containsKey(user) ? profiles.get(user).characterGender() : null,
                            tableSeats.get(user), activity.apply(user), motions.get(user)))
                    .toList(), scene.get().version(), tables);
        }
    }

    public com.ssafy.ontop.world.dto.WorldMapMetadata mapMetadata() {
        return scene.get().metadata();
    }
}
