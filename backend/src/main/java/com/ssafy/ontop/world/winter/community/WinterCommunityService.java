package com.ssafy.ontop.world.winter.community;

import com.ssafy.ontop.notes.domain.NoteText;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Clock;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.LongSupplier;
import java.util.function.Supplier;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;

/** 공원 위치·충돌은 기존 권한자, 영구 기록은 저장소, 굴리는 도중의 눈은 채널별로 담당한다. */
public final class WinterCommunityService {
    private static final Logger log = LoggerFactory.getLogger(WinterCommunityService.class);
    private final Supplier<WinterCommunityStore> stores;
    private final WinterWorld world;
    private final Clock clock;
    private final LongSupplier nanos;
    private final Map<String, Channel> channels = new HashMap<>();
    private long version = System.currentTimeMillis();
    private long previousTick;

    private static final class Hold {
        long seen;
        double x;
        double z;
        String operation;
        Hold(WinterCommunity.Player player, long now, String operation) {
            seen = now; x = player.x(); z = player.z(); this.operation = operation;
        }
    }

    private static final class Ball {
        final String id = UUID.randomUUID().toString();
        double x;
        double y;
        double z;
        double radius = .25;
        long touched;
        String reserved = "";
        final Map<String, Hold> pushing = new LinkedHashMap<>();
        Ball(double x, double y, double z, long now) { this.x = x; this.y = y; this.z = z; touched = now; }
    }

    private static final class Channel {
        final Map<String, Ball> balls = new LinkedHashMap<>();
        final Map<String, WinterCommunity.Snowman> snowmen = new LinkedHashMap<>();
        final Map<String, String> beginnings = new LinkedHashMap<>();
        final java.util.Set<String> installed = new HashSet<>();
        long version;
    }

    public WinterCommunityService(Supplier<WinterCommunityStore> stores, WinterWorld world, Clock clock,
            LongSupplier nanos) {
        this.stores = stores;
        this.world = world;
        this.clock = clock;
        this.nanos = nanos;
    }

    private WinterCommunityStore store() {
        var store = stores.get();
        if (store == null) {
            throw new WinterCommunityException(503, "WINTER_STORAGE_UNAVAILABLE", "겨울 공원 기록을 연결하지 못했어요.");
        }
        return store;
    }

    private static String operation(String value) {
        try { return UUID.fromString(value).toString(); }
        catch (IllegalArgumentException | NullPointerException failure) {
            throw new WinterCommunityException(400, "WINTER_OPERATION_INVALID", "등록 요청을 다시 확인해주세요.");
        }
    }

    private String actorKey(long user, String purpose) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(store().actorSalt(), "HmacSHA256"));
            return HexFormat.of().formatHex(mac.doFinal((purpose + ":" + user).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("겨울 기록 식별 키 생성 실패", failure);
        }
    }

    public WinterCommunity.TreeStatus treeStatus(long user, String channel) {
        world.player(user, channel);
        return store().treeStatus();
    }

    public WinterCommunity.TreePage tree(long user, String channel, Long before) {
        var player = world.player(user, channel);
        world.requireTree(player, channel);
        if (before != null && before <= 0) {
            throw new WinterCommunityException(400, "WINTER_CURSOR_INVALID", "편지 목록을 다시 열어주세요.");
        }
        return store().tree(before, 12);
    }

    public WinterCommunity.TreeReceipt postTree(long user, String channel, String request, String text,
            Boolean anonymous) {
        var player = world.player(user, channel);
        world.requireTree(player, channel);
        requireFree(player);
        if (anonymous == null) {
            throw new WinterCommunityException(400, "WINTER_VISIBILITY_REQUIRED", "익명 또는 닉네임 공개를 선택해주세요.");
        }
        var body = new NoteText(text);
        if (!anonymous && (player.nickname() == null || player.nickname().isBlank())) {
            throw new WinterCommunityException(409, "WINTER_PROFILE_LOADING", "닉네임을 불러오는 중이에요. 잠시 후 다시 남겨주세요.");
        }
        var receipt = store().postTree(actorKey(user, "tree"), operation(request), body.value(), anonymous,
                anonymous ? null : player.nickname(), clock.instant());
        world.publishTree(receipt.status());
        return receipt;
    }

    private void initialize(String channel) {
        boolean loaded;
        synchronized (this) { loaded = channels.containsKey(channel); }
        var saved = loaded ? List.<WinterCommunity.Snowman>of() : store().snowmen(channel);
        synchronized (this) {
            if (!channels.containsKey(channel)) {
                var state = new Channel();
                saved.forEach(snowman -> state.snowmen.put(snowman.id(), snowman));
                state.version = ++version;
                channels.put(channel, state);
            }
        }
        List<WinterCommunity.Snowman> pending;
        synchronized (this) {
            var state = channels.get(channel);
            pending = state.snowmen.values().stream().filter(snowman -> !state.installed.contains(snowman.id())).toList();
        }
        for (var snowman : pending) {
            world.install(snowman);
            synchronized (this) { channels.get(channel).installed.add(snowman.id()); }
        }
    }

    public WinterCommunity.BuildingState building(long user, String channel) {
        world.player(user, channel);
        initialize(channel);
        synchronized (this) { return snapshot(channel); }
    }

    public WinterCommunity.BuildingState hold(long user, String channel, String action, String request, String ballId) {
        var player = world.player(user, channel);
        initialize(channel);
        synchronized (this) {
            var state = channels.get(channel);
            String identity = player.userId();
            Ball held = state.balls.values().stream().filter(ball -> ball.pushing.containsKey(identity)).findFirst().orElse(null);
            long now = nanos.getAsLong();
            String holdOperation = operation(request);
            if ("RELEASE".equals(action)) {
                if (held != null && held.id.equals(ballId) && held.pushing.get(identity).operation.equals(holdOperation)) {
                    held.pushing.remove(identity); held.touched = now; state.version = ++version;
                }
            } else if ("KEEP".equals(action)) {
                requireRoll(player);
                if (held == null || !held.id.equals(ballId) || !held.pushing.get(identity).operation.equals(holdOperation)) {
                    throw new WinterCommunityException(409, "WINTER_HOLD_ENDED", "눈 굴리기를 다시 시작해주세요.");
                }
                held.pushing.get(identity).seen = now;
            } else if ("BEGIN".equals(action)) {
                requireRoll(player);
                String start = identity + ":" + holdOperation;
                if (state.beginnings.containsKey(start)) { return snapshot(channel); }
                if (held == null) {
                    Ball target;
                    if (ballId != null && !ballId.isBlank()) {
                        target = state.balls.get(ballId);
                        if (target == null || !target.reserved.isEmpty() || distance(player, target) > target.radius + 2.2) {
                            throw new WinterCommunityException(409, "WINTER_BALL_OUT_OF_RANGE", "가까이 있는 눈덩이를 바라봐주세요.");
                        }
                    } else {
                        if (player.pileId().isEmpty()) {
                            throw new WinterCommunityException(403, "WINTER_SNOW_REQUIRED", "쌓인 눈 가까이에서 Q를 꾹 눌러주세요.");
                        }
                        if (state.balls.size() >= WinterCommunity.MAX_BALLS) {
                            throw new WinterCommunityException(409, "WINTER_BALL_LIMIT", "굴린 눈을 모아 눈사람을 먼저 완성해주세요.");
                        }
                        double x = player.x() + Math.sin(player.yaw()) * 1.1;
                        double z = player.z() + Math.cos(player.yaw()) * 1.1;
                        var surface = world.surface(channel, x, z, .25);
                        if (!surface.clear() || state.balls.values().stream().anyMatch(ball -> Math.hypot(ball.x - x, ball.z - z) < ball.radius + .45)) {
                            throw new WinterCommunityException(409, "WINTER_ROLL_BLOCKED", "조금 넓은 눈밭을 향해 시작해주세요.");
                        }
                        target = new Ball(x, surface.y(), z, now);
                        state.balls.put(target.id, target);
                    }
                    target.pushing.put(identity, new Hold(player, now, holdOperation));
                    target.touched = now;
                    state.beginnings.put(start, target.id);
                    if (state.beginnings.size() > 256) { state.beginnings.remove(state.beginnings.keySet().iterator().next()); }
                    state.version = ++version;
                } else {
                    held.pushing.get(identity).operation = holdOperation;
                    held.pushing.get(identity).seen = now;
                    state.beginnings.put(start, held.id);
                }
            } else {
                throw new WinterCommunityException(400, "WINTER_ACTION_INVALID", "눈 굴리기 동작을 확인해주세요.");
            }
            var result = snapshot(channel);
            world.publish(result);
            return result;
        }
    }

    /** 실제 서버 보행 거리만 눈 크기에 반영한다. 키 반복·클라이언트 좌표는 받지 않는다. */
    @Scheduled(fixedDelay = 100)
    public synchronized void tick() {
        long now = nanos.getAsLong();
        double dt = previousTick == 0 ? .1 : Math.min(.25, Math.max(0, (now - previousTick) / 1e9));
        previousTick = now;
        for (var item : channels.entrySet()) {
            try { tick(item.getKey(), item.getValue(), now, dt); }
            catch (RuntimeException failure) {
                log.warn("겨울 눈 굴리기 갱신 지연 channel={}", item.getKey(), failure);
            }
        }
    }

    private void tick(String channel, Channel state, long now, double dt) {
        if (state.balls.isEmpty()) { return; }
        var players = new HashMap<String, WinterCommunity.Player>();
        world.players(channel).forEach(player -> players.put(player.userId(), player));
        boolean changed = false;
        var iterator = state.balls.values().iterator();
        while (iterator.hasNext()) {
            var ball = iterator.next();
            if (!ball.reserved.isEmpty()) { continue; }
            int previous = ball.pushing.size();
            ball.pushing.entrySet().removeIf(entry -> {
                var player = players.get(entry.getKey());
                return player == null || !player.free() || player.inputBusy() || now - entry.getValue().seen > 2_000_000_000L
                        || distance(player, ball) > ball.radius + 3;
            });
            changed |= previous != ball.pushing.size();
            if (ball.pushing.isEmpty()) {
                if (now - ball.touched > 900_000_000_000L) { iterator.remove(); changed = true; }
                continue;
            }
            String leader = ball.pushing.keySet().iterator().next();
            var player = players.get(leader);
            double travel = 0;
            double snowTravel = 0;
            int snowWorkers = 0;
            for (var pushing : ball.pushing.entrySet()) {
                var p = players.get(pushing.getKey());
                var hold = pushing.getValue();
                double moved = Math.hypot(p.x() - hold.x, p.z() - hold.z);
                if (moved <= 2) {
                    travel += moved;
                    if (!p.pileId().isEmpty()) { snowTravel += moved; }
                }
                hold.x = p.x(); hold.z = p.z();
                if (!p.pileId().isEmpty()) { snowWorkers++; }
            }
            double radius = Math.min(WinterCommunity.MAX_RADIUS, ball.radius + .035 * dt * Math.min(3, snowWorkers) + snowTravel * .035);
            double wantedX = player.x() + Math.sin(player.yaw()) * (radius + .8);
            double wantedZ = player.z() + Math.cos(player.yaw()) * (radius + .8);
            double length = Math.hypot(wantedX - ball.x, wantedZ - ball.z);
            double fraction = travel > .003 ? Math.min(1, (travel + .05) / Math.max(.001, length)) : 0;
            double x = ball.x + (wantedX - ball.x) * fraction, z = ball.z + (wantedZ - ball.z) * fraction;
            if (Math.abs(radius - ball.radius) > .0001 || Math.hypot(x - ball.x, z - ball.z) > .002) {
                var surface = world.surface(channel, x, z, radius);
                if (surface.clear() && Math.abs(surface.y() - ball.y) < .45
                        && state.balls.values().stream().noneMatch(other -> other != ball
                            && Math.hypot(other.x - x, other.z - z) < other.radius + radius + .02)) {
                    ball.x = x; ball.y = surface.y(); ball.z = z; ball.radius = radius; changed = true;
                }
            }
            ball.touched = now;
        }
        if (changed) { state.version = ++version; world.publish(snapshot(channel)); }
    }

    public WinterCommunity.Snowman finish(long user, String channel, String request, List<String> ids,
            WinterCommunity.Decoration decoration, double x, double z, double yaw) {
        var player = world.player(user, channel);
        if (ids == null || ids.size() != 3 || ids.stream().anyMatch(Objects::isNull) || ids.stream().distinct().count() != 3
                || !Double.isFinite(x) || !Double.isFinite(z) || !Double.isFinite(yaw)) {
            throw new WinterCommunityException(400, "WINTER_ASSEMBLY_INVALID", "크기가 다른 눈덩이 세 개를 모아주세요.");
        }
        String operation = operation(request), actor = actorKey(user, "snow"), reservation = actor + operation;
        String hash = requestHash(ids, decoration, x, z, yaw);
        initialize(channel);
        var previous = store().previousSnowman(actor, operation, hash);
        if (previous.isPresent()) {
            if (!previous.get().channelId().equals(channel)) {
                throw new WinterCommunityException(409, "WINTER_OPERATION_CONFLICT", "이전 공원의 등록 요청이에요.");
            }
            complete(channel, ids, reservation, previous.get());
            return previous.get();
        }
        WinterCommunity.Snowman candidate;
        synchronized (this) {
            requireFree(player);
            var state = channels.get(channel);
            var balls = new ArrayList<Ball>();
            for (String id : ids) {
                var ball = state.balls.get(id);
                if (ball == null || !ball.pushing.isEmpty() || !ball.reserved.isEmpty() && !ball.reserved.equals(reservation)
                        || distance(player, ball) > 7) {
                    throw new WinterCommunityException(409, "WINTER_BALL_UNAVAILABLE", "눈을 놓고 가까이에 세 개를 모아주세요.");
                }
                balls.add(ball);
            }
            balls.sort(Comparator.comparingDouble((Ball ball) -> ball.radius).reversed());
            double base = balls.get(0).radius, middle = Math.min(balls.get(1).radius, base * .78);
            double head = Math.min(balls.get(2).radius, middle * .72);
            if (base < .65 || middle < .4 || head < .25) {
                throw new WinterCommunityException(409, "WINTER_BALL_TOO_SMALL", "큰 눈 지름 1.3m, 중간 눈 0.8m, 작은 눈 0.5m 이상 모아주세요.");
            }
            base = Math.floor(base * 1000) / 1000;
            middle = Math.floor(middle * 1000) / 1000;
            head = Math.floor(head * 1000) / 1000;
            var surface = world.surface(channel, x, z, base);
            final double bodyRadius = base;
            if (!surface.clear() || !surface.buildingZone() || Math.hypot(player.x() - x, player.z() - z) > 4
                    || world.players(channel).stream().anyMatch(p -> Math.abs(p.y() - surface.y()) < 7
                        && Math.hypot(p.x() - x, p.z() - z) < bodyRadius + .5)
                    || state.balls.values().stream().anyMatch(ball -> !ids.contains(ball.id)
                        && Math.hypot(ball.x - x, ball.z - z) < bodyRadius + ball.radius + .1)) {
                throw new WinterCommunityException(409, "WINTER_PLACEMENT_BLOCKED", "광장 양옆 눈밭의 비어 있는 자리를 골라주세요.");
            }
            candidate = new WinterCommunity.Snowman(UUID.randomUUID().toString(), channel, decoration.name(),
                    x, surface.y(), z, yaw, base, middle, head, decoration.hat(), decoration.scarf(), decoration.face(),
                    clock.instant().toString());
            balls.forEach(ball -> ball.reserved = reservation);
        }
        try {
            var saved = store().saveSnowman(actor, operation, hash, candidate);
            complete(channel, ids, reservation, saved);
            return saved;
        } catch (WinterCommunityException failure) {
            synchronized (this) {
                channels.get(channel).balls.values().stream().filter(ball -> ball.reserved.equals(reservation))
                        .forEach(ball -> ball.reserved = "");
            }
            throw failure;
        }
        // DB 통신 결과가 불명이면 예약을 유지한다. 같은 키 재시도에서 저장 결과부터 확인하여 이중 사용을 막는다.
    }

    private void complete(String channel, List<String> ids, String reservation, WinterCommunity.Snowman saved) {
        synchronized (this) {
            var state = channels.get(channel);
            for (String id : ids) {
                var ball = state.balls.get(id);
                if (ball != null && ball.reserved.equals(reservation)) { state.balls.remove(id); }
            }
            state.snowmen.put(saved.id(), saved);
            state.version = ++version;
        }
        world.install(saved);
        synchronized (this) { channels.get(channel).installed.add(saved.id()); }
        synchronized (this) { world.publish(snapshot(channel)); }
    }

    private WinterCommunity.BuildingState snapshot(String channel) {
        var state = channels.get(channel);
        var balls = state.balls.values().stream().map(ball -> new WinterCommunity.SnowBall(ball.id, ball.x, ball.y,
                ball.z, ball.radius, List.copyOf(ball.pushing.keySet()), !ball.reserved.isEmpty())).toList();
        return new WinterCommunity.BuildingState(channel, state.version, clock.instant().toString(), balls,
                List.copyOf(state.snowmen.values()));
    }

    private static double distance(WinterCommunity.Player player, Ball ball) {
        return Math.hypot(player.x() - ball.x, player.z() - ball.z);
    }

    private static void requireFree(WinterCommunity.Player player) {
        if (!player.free()) {
            throw new WinterCommunityException(409, "WINTER_ACTIVITY_CONFLICT", "공원 바닥에서 다른 활동을 마친 뒤 이용해주세요.");
        }
    }

    private static void requireRoll(WinterCommunity.Player player) {
        requireFree(player);
        if (player.inputBusy()) {
            throw new WinterCommunityException(409, "WINTER_ACTIVITY_CONFLICT", "대화창을 닫고 눈을 굴려주세요.");
        }
    }

    private static String requestHash(List<String> ids, WinterCommunity.Decoration decoration, double x, double z, double yaw) {
        try {
            String value = String.join(",", ids.stream().sorted().toList()) + "\0" + decoration.name() + "\0"
                    + decoration.hat() + "\0" + decoration.scarf() + "\0" + decoration.face() + "\0" + x + ":" + z + ":" + yaw;
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException failure) {
            throw new IllegalStateException("겨울 등록 요청 확인 실패", failure);
        }
    }
}
