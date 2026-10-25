package com.ssafy.ontop.world.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.movement.ParkScene;
import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.LongSupplier;

/** TableHub의 잠금 안에서만 호출한다. 영구 저장이나 다른 JVM 간 점유 공유는 하지 않는다. */
public final class WorldFacilityService {

    private final Catalog catalog;
    private final Map<String, Lease> users = new HashMap<>();
    private final Map<String, Long> versions = new HashMap<>();
    private final Map<String, Long> aimTimes = new HashMap<>();
    private final Map<String, LinkedHashMap<String, String>> attempts = new HashMap<>();
    private final Clock clock;
    private final LongSupplier nanos;

    public WorldFacilityService() {
        this(load(), Clock.systemUTC(), System::nanoTime);
    }

    public WorldFacilityService(Catalog catalog, Clock clock, LongSupplier nanos) {
        this.catalog = catalog;
        this.clock = clock;
        this.nanos = nanos;
    }

    public Catalog catalog() {
        return catalog;
    }

    public Lease current(String userId) {
        return users.get(userId);
    }

    public State state(String channelId) {
        return new State(channelId, versions.getOrDefault(channelId, 0L), catalog.mapVersion(), users.values().stream()
                .filter(lease -> lease.channelId().equals(channelId)).sorted(
                        java.util.Comparator.comparing(Lease::facilityId).thenComparingInt(Lease::seatIndex)).toList());
    }

    public Definition definition(String facilityId) {
        return catalog.facilities().stream().filter(item -> item.facilityId().equals(facilityId)).findFirst()
                .orElseThrow(() -> failure("FACILITY_NOT_FOUND", "등록되지 않은 시설입니다."));
    }

    public Lease use(String userId, String channelId, String requestId, String facilityId, int seatIndex,
            WorldChannelRegistry.Position position) {
        Definition definition = definition(facilityId);
        if (seatIndex < 0 || seatIndex >= definition.seats().size()) {
            throw failure("FACILITY_SEAT_INVALID", "좌석 번호를 확인해주세요.");
        }
        var previous = attempts.computeIfAbsent(userId, ignored -> new LinkedHashMap<>());
        Lease current = users.get(userId);
        if (previous.containsKey(requestId)) {
            if (current != null && current.leaseId().equals(previous.get(requestId))
                    && current.facilityId().equals(facilityId) && current.seatIndex() == seatIndex) {
                return current;
            }
            throw failure("FACILITY_STALE_REQUEST", "완료된 이용 요청입니다. 현재 상태를 조회해주세요.");
        }
        if (current != null) {
            throw failure("FACILITY_BUSY", "먼저 현재 시설 이용을 종료해주세요.");
        }
        if (position == null || Math.hypot(position.x() - definition.center().x(),
                position.z() - definition.center().z()) > definition.radius()) {
            throw failure("FACILITY_OUT_OF_RANGE", "시설 가까이에서 이용해주세요.");
        }
        if (Math.abs(position.y() - definition.center().y()) > definition.heightTolerance()) {
            throw failure("FACILITY_HEIGHT_MISMATCH", "시설과 같은 높이에서 이용해주세요.");
        }
        if (position.swimming()) {
            throw failure("FACILITY_ACTIVITY_CONFLICT", "수영 중에는 시설을 이용할 수 없습니다.");
        }
        if (users.values().stream().anyMatch(lease -> lease.channelId().equals(channelId)
                && lease.facilityId().equals(facilityId) && lease.seatIndex() == seatIndex)) {
            throw failure("FACILITY_OCCUPIED", "이미 이용 중인 시설입니다.");
        }
        Lease lease = new Lease(UUID.randomUUID().toString(), channelId, userId, facilityId, definition.kind(),
                seatIndex, clock.instant(), definition.seats().get(seatIndex), definition.exit(),
                new Pose(position.x(), position.y(), position.z(), position.yaw()),
                definition.seats().get(seatIndex).yaw(), definition.kind().equals("TELESCOPE")
                        ? catalog.initialPitch() : 0, 0);
        users.put(userId, lease);
        previous.put(requestId, lease.leaseId());
        if (previous.size() > 128) {
            previous.remove(previous.keySet().iterator().next());
        }
        changed(channelId);
        return lease;
    }

    public Lease requireOwner(String userId, String leaseId) {
        Lease lease = users.get(userId);
        if (lease == null || !lease.leaseId().equals(leaseId)) {
            throw failure("FACILITY_LEASE_MISMATCH", "현재 본인의 이용 식별자가 아닙니다.");
        }
        return lease;
    }

    public Lease aim(String userId, String leaseId, long sequence, double yaw, double pitch) {
        Lease lease = requireOwner(userId, leaseId);
        if (!lease.kind().equals("TELESCOPE")) {
            throw failure("FACILITY_AIM_NOT_ALLOWED", "망원경 이용 중에만 방향을 변경할 수 있습니다.");
        }
        if (!Double.isFinite(yaw) || !Double.isFinite(pitch) || yaw < -Math.PI || yaw > Math.PI
                || pitch < catalog.minPitch() || pitch > catalog.maxPitch()) {
            throw failure("FACILITY_AIM_INVALID", "방향 범위를 확인해주세요.");
        }
        if (sequence <= lease.lastAimSeq()) {
            return lease;
        }
        long now = nanos.getAsLong();
        Long last = aimTimes.get(userId);
        if (last != null && now - last < catalog.aimIntervalMs() * 1_000_000L) {
            throw failure("FACILITY_AIM_TOO_FREQUENT", "방향 전송 간격을 확인해주세요.");
        }
        Lease next = new Lease(lease.leaseId(), lease.channelId(), userId, lease.facilityId(), lease.kind(),
                lease.seatIndex(), lease.startedAt(), lease.pose(), lease.exit(), lease.returnPose(), yaw, pitch,
                sequence);
        users.put(userId, next);
        aimTimes.put(userId, now);
        changed(lease.channelId());
        return next;
    }

    public Lease release(String userId) {
        Lease lease = users.remove(userId);
        aimTimes.remove(userId);
        if (lease != null) {
            changed(lease.channelId());
        }
        return lease;
    }

    public void disconnected(String userId) {
        release(userId);
        attempts.remove(userId);
    }

    public void clear() {
        users.clear();
        versions.clear();
        aimTimes.clear();
        attempts.clear();
    }

    private void changed(String channelId) {
        versions.merge(channelId, 1L, Long::sum);
    }

    private static Catalog load() {
        try (var input = WorldFacilityService.class.getResourceAsStream("/world/facilities.json")) {
            if (input == null) {
                throw new IOException("Missing facility catalog");
            }
            Catalog catalog = new ObjectMapper().readValue(input, Catalog.class);
            if (!catalog.mapVersion().equals(ParkScene.load().version()) || catalog.facilities().isEmpty()
                    || catalog.facilities().stream().map(Definition::facilityId).distinct().count()
                            != catalog.facilities().size()) {
                throw new IllegalStateException("시설과 충돌 맵 버전을 확인해주세요.");
            }
            return catalog;
        } catch (IOException exception) {
            throw new IllegalStateException("시설 설정을 읽을 수 없습니다.", exception);
        }
    }

    private static FacilityException failure(String code, String message) {
        return new FacilityException(code, message);
    }

    public record Pose(double x, double y, double z, double yaw) {
    }

    public record Definition(String facilityId, String kind, Pose center, double radius, double heightTolerance,
            List<Pose> seats, Pose exit) {
    }

    public record Catalog(String mapVersion, String configSha256, long aimIntervalMs, double minPitch,
            double maxPitch, double initialPitch, List<Definition> facilities, List<String> excluded) {
    }

    public record Lease(String leaseId, String channelId, String userId, String facilityId, String kind, int seatIndex,
            Instant startedAt, Pose pose, Pose exit, @com.fasterxml.jackson.annotation.JsonIgnore Pose returnPose,
            double yaw, double pitch, long lastAimSeq) {
    }

    public record State(String channelId, long version, String mapVersion, List<Lease> occupancies) {
    }

    public static final class FacilityException extends RuntimeException {
        private final String code;

        private FacilityException(String code, String message) {
            super(message);
            this.code = code;
        }

        public String code() {
            return code;
        }
    }
}
