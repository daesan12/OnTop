package com.ssafy.ontop.game.stonerumble.domain;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 서버 고정 시간 간격으로 판정한다. 클라이언트는 좌표·명중·승패를 제출하지 않는다. */
public final class StoneRumbleMatch {
    public static final double TILE_SIZE = StoneHexGrid.SPACING;
    public static final long STEP_DELAY = 1000;
    public static final long PIGEON_COOLDOWN = 1500;
    public static final long DROP_DURATION = 1200;
    public static final long COUNTDOWN_DURATION = 3000;
    public static final double DROP_HEIGHT = 41;
    public static final double PIGEON_SPEED = 20;
    public static final double KNOCKBACK_DISTANCE = TILE_SIZE;
    public static final long KNOCKBACK_DURATION = 400;
    public static final long SLIDE_DURATION = 300;
    public static final long SLIDE_COOLDOWN = 1000;
    public static final double SLIDE_DISTANCE = TILE_SIZE * 1.25;
    public static final double ELIMINATION_HEIGHT = -6.0;
    public static final int TOP_FLOOR = 8;
    public static final long MATCH_TIME_LIMIT = 300_000;
    public static final long DIVE_RECOVERY = 260;
    private static final int[] RADII = {8, 8, 8, 7, 7, 6, 6, 6, 4};
    private static final double[] HEIGHTS = {0, 4, 8, 12, 16, 20, 24, 28, 32};
    private static final int[][] SPAWNS = {{-2, 0}, {2, 0}, {0, -3}, {0, 3}, {-3, 3}, {3, -3}, {-4, 1}, {4, -1}};
    private static final long JUMP_BUFFER_MILLIS = 140;
    private final List<Player> players = new ArrayList<>();
    private final List<Tile> tiles = new ArrayList<>();
    private final List<Pigeon> pigeons = new ArrayList<>();
    private final List<PigeonImpactView> impacts = new ArrayList<>();
    private final Map<String, Tile> tileIndex = new LinkedHashMap<>();
    public static final long LOADING_TIMEOUT = 90_000;
    private static final long UNSCHEDULED = 9_007_199_254_740_991L;
    private long startsAt;
    private long landsAt;
    private final long loadingStartedAt;
    private final Set<String> readyUsers = new LinkedHashSet<>();
    private boolean released;
    private long now;
    private long pigeonSequence;
    private long endedAt;
    private String endReason;
    private long presentationVersion;
    private List<String> winners = List.of();

    public StoneRumbleMatch(List<Long> users, long createdAt) {
        if (users.size() < 2 || users.size() > 8 || users.stream().distinct().count() != users.size()
                || users.stream().anyMatch(id -> id == null || id <= 0)) {
            throw new IllegalArgumentException("참가자는 서로 다른 2~8명이어야 합니다.");
        }
        loadingStartedAt = createdAt;
        now = createdAt;
        for (int floor = 0; floor < RADII.length; floor++) {
            int radius = RADII[floor];
            for (int q = -radius; q <= radius; q++) {
                for (int r = -radius; r <= radius; r++) {
                    int ring = StoneHexGrid.ring(q, r);
                    if (ring > radius || floor == TOP_FLOOR && !isSpawn(q, r)) {
                        continue;
                    }
                    Tile tile = new Tile(tiles.size(), floor, q, r,
                            UNSCHEDULED);
                    tiles.add(tile);
                    tileIndex.put(key(floor, q, r), tile);
                }
            }
        }
        for (int i = 0; i < users.size(); i++) {
            int q = SPAWNS[i][0], r = SPAWNS[i][1];
            players.add(new Player(Long.toString(users.get(i)), StoneHexGrid.x(q, r), StoneHexGrid.z(r),
                    startsAt, landsAt));
        }
    }

    /** 플레이어 본인의 준비 보고만 엔진에서 전달한다. 마지막 보고 시각부터 낙하를 시작한다. */
    public void sceneReady(String userId, boolean ready, long at) {
        Player player = player(userId);
        if (finished() || !player.alive) { throw new IllegalArgumentException("GAME_FINISHED"); }
        if (released) { return; }
        if (ready) { readyUsers.add(userId); } else { readyUsers.remove(userId); }
        if (players.stream().filter(p -> p.alive).allMatch(p -> readyUsers.contains(p.userId))) {
            now = Math.max(now, at);
            released = true;
            landsAt = now + DROP_DURATION;
            startsAt = landsAt + COUNTDOWN_DURATION;
            for (Player p : players) { p.pigeonReadyAt = startsAt; p.slideReadyAt = landsAt; }
            for (Tile tile : tiles) {
                if (tile.floor == TOP_FLOOR) {
                    tile.breakAt = startsAt + STEP_DELAY;
                }
            }
        }
    }

    public void control(String userId, double x, double z, double aimX, double aimZ,
            boolean jump, boolean fire) {
        control(userId, x, z, aimX, aimZ, jump, fire, false);
    }

    public void control(String userId, double x, double z, double aimX, double aimZ,
            boolean jump, boolean fire, boolean slide) {
        Player player = player(userId);
        if (!Double.isFinite(x) || !Double.isFinite(z) || !Double.isFinite(aimX) || !Double.isFinite(aimZ)
                || Math.abs(x) > 1 || Math.abs(z) > 1 || Math.abs(aimX) > 1 || Math.abs(aimZ) > 1) {
            throw new IllegalArgumentException("INVALID_INPUT");
        }
        if (finished() || !player.alive) {
            throw new IllegalArgumentException("GAME_FINISHED");
        }
        if (!released || now < landsAt) {
            throw new IllegalArgumentException("NOT_ACTIVE");
        }
        double length = Math.max(1, Math.hypot(x, z));
        // 카메라를 조금씩 돌릴 때마다 25Hz 공개로 올라가지 않게 큰 방향 전환만 서두른다.
        if (Math.hypot(player.inputX - x / length, player.inputZ - z / length) > .5
                || now - player.inputAt > 350 && Math.hypot(x, z) > .01) {
            presentationVersion++;
        }
        player.inputX = x / length;
        player.inputZ = z / length;
        player.inputAt = now;
        double aimLength = Math.hypot(aimX, aimZ);
        if (aimLength > 0.01) {
            player.aimX = aimX / aimLength;
            player.aimZ = aimZ / aimLength;
        }
        if (jump) {
            player.jumpBufferedUntil = now + JUMP_BUFFER_MILLIS;
            applyBufferedJump(player);
        }
        if (slide && !player.diving && now >= player.knockUntil && now >= player.slideReadyAt
                && now >= player.slideUntil) {
            double directionLength = Math.hypot(player.inputX, player.inputZ);
            player.slideX = (directionLength > .01 ? player.inputX / directionLength : player.aimX) * SLIDE_DISTANCE;
            player.slideZ = (directionLength > .01 ? player.inputZ / directionLength : player.aimZ) * SLIDE_DISTANCE;
            player.diving = true;
            presentationVersion++;
            player.slideStartedAt = now;
            player.slideUntil = now + SLIDE_DURATION;
            player.slideReadyAt = now + SLIDE_COOLDOWN;
        }
        if (fire && now >= startsAt && now >= player.pigeonReadyAt) {
            presentationVersion++;
            pigeons.add(new Pigeon(++pigeonSequence, userId, player.x + player.aimX * 0.6,
                    player.y + 0.8, player.z + player.aimZ * 0.6,
                    player.aimX * PIGEON_SPEED, player.aimZ * PIGEON_SPEED, now));
            player.pigeonReadyAt = now + PIGEON_COOLDOWN;
        }
    }

    public void advance(long target) {
        if (target < now || finished()) {
            return;
        }
        if (!released) {
            now = target;
            if (now - loadingStartedAt >= LOADING_TIMEOUT) { finish("LOADING_TIMEOUT", List.of(), now); }
            return;
        }
        // 누적 지연을 무제한 반복해 공통 scheduler를 막지 않는다. 정산은 무효 결과로 처리한다.
        if (target - now > 5000) {
            finish("SIMULATION_LIMIT", List.of(), target);
            return;
        }
        while (now + 20 <= target && !finished()) {
            now += 20;
            for (Player player : players) {
                if (player.alive) {
                    move(player);
                }
            }
            collidePlayers();
            if (now < startsAt) {
                // 준비 이동으로 경기 시작 전에 발판 밖으로 떨어지지 않게 한다.
                for (Player player : players) {
                    if (player.alive) {
                        keepOnPreparationFloor(player);
                        if (player.y < HEIGHTS[TOP_FLOOR]) {
                            player.y = HEIGHTS[TOP_FLOOR];
                            player.vy = 0;
                            player.floor = TOP_FLOOR;
                            player.grounded = true;
                        }
                    }
                }
            }
            movePigeons();
            List<String> alive = players.stream().filter(p -> p.alive).map(p -> p.userId).toList();
            if (alive.size() <= 1) {
                finish(alive.isEmpty() ? "ALL_FALLEN" : "LAST_PLAYER_STANDING", alive, now);
            } else if (now >= startsAt + MATCH_TIME_LIMIT) {
                finish("MATCH_TIME_LIMIT", alive, now);
            }
        }
    }

    private static boolean isSpawn(int q, int r) {
        for (int[] spawn : SPAWNS) {
            if (spawn[0] == q && spawn[1] == r) {
                return true;
            }
        }
        return false;
    }

    private void move(Player player) {
        applyBufferedJump(player);
        if (player.diving) {
            player.slideUntil = Math.max(player.slideUntil, now + 40);
        }
        boolean recoiling = now <= player.knockUntil;
        boolean sliding = player.slideUntil > player.slideStartedAt && now <= player.slideUntil;
        double inputScale = now >= landsAt && !recoiling && !sliding && now - player.inputAt <= 350 ? 4.5 : 0;
        double oldY = player.y;
        player.x += player.inputX * inputScale * 0.02;
        player.z += player.inputZ * inputScale * 0.02;
        if (recoiling) {
            // 한 칸을 감속하며 밀고, 반대 입력으로 즉시 상쇄하지 못하게 한다.
            double before = Math.max(0, (double) (now - 20 - player.hitAt) / KNOCKBACK_DURATION);
            double after = Math.min(1, (double) (now - player.hitAt) / KNOCKBACK_DURATION);
            double portion = (1 - before) * (1 - before) - (1 - after) * (1 - after);
            player.x += player.knockX * portion;
            player.z += player.knockZ * portion;
        } else if (sliding) {
            double before = Math.min(1, Math.max(0, (double) (now - 20 - player.slideStartedAt) / SLIDE_DURATION));
            double after = Math.min(1, (double) (now - player.slideStartedAt) / SLIDE_DURATION);
            player.x += player.slideX * (after - before);
            player.z += player.slideZ * (after - before);
        }
        player.vy -= 22 * 0.02;
        player.y += player.vy * 0.02;
        player.grounded = false;
        if (player.vy <= 0) {
            for (int floor = TOP_FLOOR; floor >= 0; floor--) {
                if (oldY + 0.001 >= HEIGHTS[floor] && player.y <= HEIGHTS[floor]) {
                    Tile tile = tileAt(floor, player.x, player.z);
                    if (tile != null && tile.breakAt > now) {
                        player.y = HEIGHTS[floor];
                        player.vy = 0;
                        player.floor = floor;
                        player.grounded = true;
                        player.lastGroundedAt = now;
                        if (player.diving && now >= player.slideStartedAt + SLIDE_DURATION) {
                            player.diving = false;
                            player.slideUntil = now + DIVE_RECOVERY;
                            player.slideReadyAt = Math.max(player.slideReadyAt, player.slideUntil);
                        }
                        if (now >= startsAt) {
                            tile.breakAt = Math.min(tile.breakAt, now + STEP_DELAY);
                            tile.stepped = true;
                        }
                        break;
                    }
                }
            }
        }
        if (player.y < ELIMINATION_HEIGHT) {
            eliminate(player, now, false);
        }
    }

    private void applyBufferedJump(Player player) {
        if (now <= player.jumpBufferedUntil && (player.grounded || now - player.lastGroundedAt <= 80)
                && now >= player.slideUntil && now >= player.knockUntil) {
            player.jumpBufferedUntil = Long.MIN_VALUE;
            presentationVersion++;
            player.vy = 6.6;
            player.lastGroundedAt = Long.MIN_VALUE / 2;
            player.grounded = false;
        }
    }

    private void collidePlayers() {
        for (int i = 0; i < players.size(); i++) {
            for (int j = i + 1; j < players.size(); j++) {
                Player a = players.get(i), b = players.get(j);
                double dx = b.x - a.x, dz = b.z - a.z, distance = Math.hypot(dx, dz);
                if (!a.alive || !b.alive || Math.abs(a.y - b.y) > 0.8 || distance >= 0.7) {
                    continue;
                }
                if (distance < 0.001) {
                    dx = 1;
                    dz = 0;
                    distance = 1;
                }
                double shift = Math.max(0.01, (0.7 - Math.min(distance, 0.7)) / 2);
                a.x -= dx / distance * shift;
                a.z -= dz / distance * shift;
                b.x += dx / distance * shift;
                b.z += dz / distance * shift;
            }
        }
    }

    private void movePigeons() {
        impacts.removeIf(impact -> now - impact.at() > 1000);
        for (Pigeon pigeon : pigeons) {
            if (now - pigeon.bornAt > 1200) {
                pigeon.dead = true;
                continue;
            }
            double fromX = pigeon.x, fromZ = pigeon.z;
            pigeon.x += pigeon.vx * 0.02;
            pigeon.z += pigeon.vz * 0.02;
            Player struck = null;
            double firstContact = Double.POSITIVE_INFINITY;
            for (Player player : players) {
                if (!player.alive || player.userId.equals(pigeon.owner) || pigeon.dead
                        || Math.abs(player.y + 0.7 - pigeon.y) > 0.65 || now < player.protectedUntil) {
                    continue;
                }
                double contact = pigeonContact(fromX, fromZ, pigeon.x - fromX, pigeon.z - fromZ, player);
                if (contact < firstContact) {
                    firstContact = contact;
                    struck = player;
                }
            }
            if (struck != null) {
                presentationVersion++;
                long contactAt = now - 20 + Math.round(firstContact * 20);
                impacts.add(new PigeonImpactView(pigeon.id, pigeon.owner, struck.userId,
                        fromX + pigeon.vx * .02 * firstContact, pigeon.y,
                        fromZ + pigeon.vz * .02 * firstContact, pigeon.vx, pigeon.vz, pigeon.bornAt, contactAt));
                struck.diving = false;
                struck.slideUntil = now;
                struck.slideX = 0;
                struck.slideZ = 0;
                struck.knockX = pigeon.vx / PIGEON_SPEED * KNOCKBACK_DISTANCE;
                struck.knockZ = pigeon.vz / PIGEON_SPEED * KNOCKBACK_DISTANCE;
                struck.knockUntil = now + KNOCKBACK_DURATION;
                struck.protectedUntil = now + 450;
                struck.hitAt = now;
                pigeon.dead = true;
            }
        }
        pigeons.removeIf(p -> p.dead || now - p.bornAt > 1200);
    }

    /** 20ms 사이에 이동한 선분에서 처음 닿는 시각을 구해 빠른 비둘기의 스침도 판정한다. */
    private static double pigeonContact(double x, double z, double dx, double dz, Player player) {
        double offsetX = x - player.x, offsetZ = z - player.z;
        double a = dx * dx + dz * dz;
        double b = offsetX * dx + offsetZ * dz;
        double c = offsetX * offsetX + offsetZ * offsetZ - 0.6 * 0.6;
        if (c <= 0) {
            return 0;
        }
        double discriminant = b * b - a * c;
        if (discriminant < 0) {
            return Double.POSITIVE_INFINITY;
        }
        double contact = (-b - Math.sqrt(discriminant)) / a;
        return contact >= 0 && contact <= 1 ? contact : Double.POSITIVE_INFINITY;
    }

    public void depart(String userId, long at) {
        Player player = player(userId);
        if (finished() || !player.alive) {
            return;
        }
        eliminate(player, Math.max(now, at), true);
        List<String> alive = players.stream().filter(p -> p.alive).map(p -> p.userId).toList();
        if (alive.size() <= 1) {
            finish(alive.isEmpty() ? "ALL_FALLEN" : "LAST_PLAYER_STANDING", alive, Math.max(now, at));
        }
    }

    private void eliminate(Player player, long at, boolean forfeited) {
        player.diving = false;
        player.alive = false;
        player.grounded = false;
        player.forfeited = forfeited;
        player.eliminatedAt = at;
        player.inputX = 0;
        player.inputZ = 0;
        player.vy = 0;
        player.knockX = 0;
        player.knockZ = 0;
        player.slideX = 0;
        player.slideZ = 0;
        player.slideUntil = 0;
        pigeons.removeIf(pigeon -> pigeon.owner.equals(player.userId));
    }

    private void finish(String reason, List<String> winnerIds, long at) {
        if (!released) { startsAt = at; landsAt = at; }
        endReason = reason;
        winners = List.copyOf(winnerIds);
        endedAt = at;
        now = at;
    }

    private Player player(String userId) {
        return players.stream().filter(p -> p.userId.equals(userId)).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("ACCESS_DENIED"));
    }

    private Tile tileAt(int floor, double x, double z) {
        StoneHexGrid.Cell cell = StoneHexGrid.cell(x, z);
        return tileIndex.get(key(floor, cell.q(), cell.r()));
    }

    /** 카운트다운 중에는 육각 경기장의 실제 가장자리에 머물게 한다. */
    private void keepOnPreparationFloor(Player player) {
        if (tileAt(TOP_FLOOR, player.x, player.z) != null) {
            return;
        }
        Tile nearest = null;
        double distance = Double.POSITIVE_INFINITY;
        for (Tile tile : tiles) {
            if (tile.floor != TOP_FLOOR) {
                continue;
            }
            double candidate = Math.hypot(player.x - StoneHexGrid.x(tile.q, tile.r),
                    player.z - StoneHexGrid.z(tile.r));
            if (candidate < distance) {
                nearest = tile;
                distance = candidate;
            }
        }
        if (nearest != null) {
            double centerX = StoneHexGrid.x(nearest.q, nearest.r);
            double centerZ = StoneHexGrid.z(nearest.r);
            double scale = Math.min(1, (TILE_SIZE * 0.5 - 0.4) / Math.max(distance, 0.001));
            player.x = centerX + (player.x - centerX) * scale;
            player.z = centerZ + (player.z - centerZ) * scale;
        }
    }

    private static String key(int floor, int q, int r) {
        return floor + ":" + q + ":" + r;
    }

    public boolean finished() {
        return endReason != null;
    }

    /** 판정은 바꾸지 않고 입력 시작·점프·발사·명중을 빠르게 공개할 때 사용한다. */
    public long presentationVersion() {
        return presentationVersion;
    }

    public Snapshot snapshot() {
        return new Snapshot("STONE_RUMBLE", StoneHexGrid.LAYOUT, finished() ? "FINISHED" : "PLAYING", now, startsAt, endedAt,
                endReason, winners, tiles.stream().map(t -> new TileView(t.id, t.floor, t.q, t.r,
                        t.breakAt, t.stepped)).toList(),
                players.stream().map(p -> new PlayerView(p.userId, p.x, p.y, p.z, p.floor, p.alive, p.grounded,
                        p.aimX, p.aimZ, p.pigeonReadyAt, p.hitAt, p.eliminatedAt, p.forfeited,
                        p.slideStartedAt, p.slideUntil, p.slideReadyAt, p.slideX, p.slideZ,
                        rank(p), reward(p))).toList(),
                pigeons.stream().map(p -> new PigeonView(p.id, p.owner, p.x, p.y, p.z, p.vx, p.vz, p.bornAt)).toList(),
                landsAt, finished() ? "FINISHED" : !released ? "LOADING" : now < landsAt ? "DROPPING" : now < startsAt ? "COUNTDOWN" : "RUNNING",
                List.copyOf(readyUsers), List.copyOf(impacts));
    }

    private Integer rank(Player player) {
        if (!finished() || Set.of("SIMULATION_LIMIT", "LOADING_TIMEOUT").contains(endReason)) { return null; }
        if (player.alive) { return 1; }
        return 1 + (int) players.stream().filter(p -> p != player && (p.alive
                || !player.alive && p.eliminatedAt > player.eliminatedAt)).count();
    }

    private long reward(Player player) {
        Integer rank = rank(player);
        if (rank == null) { return 0; }
        int tied = (int) players.stream().filter(p -> p.alive == player.alive
                && (player.alive || p.eliminatedAt == player.eliminatedAt)).count();
        return StoneRumbleRewards.reward(players.size(), rank, tied);
    }

    public record Snapshot(String gameCode, String tileLayout, String status, long serverTime, long startsAt, long endedAt,
            String endReason, List<String> winnerUserIds, List<TileView> tiles, List<PlayerView> players,
            List<PigeonView> pigeons, long landsAt, String phase, List<String> readyUserIds,
            List<PigeonImpactView> impacts) { }
    public record TileView(int id, int floor, int q, int r, long breakAt, boolean stepped) { }
    public record PlayerView(String userId, double x, double y, double z, int floor, boolean alive,
            boolean grounded, double aimX, double aimZ, long pigeonReadyAt, long hitAt,
            long eliminatedAt, boolean forfeited, long slideStartedAt, long slideUntil, long slideReadyAt,
            double slideX, double slideZ, Integer rank, long rewardCoins) { }
    public record PigeonView(long id, String owner, double x, double y, double z, double vx, double vz, long bornAt) { }
    public record PigeonImpactView(long id, String owner, String targetUserId, double x, double y, double z,
            double vx, double vz, long bornAt, long at) { }

    private static final class Tile {
        final int id, floor, q, r;
        long breakAt;
        boolean stepped;
        Tile(int id, int floor, int q, int r, long breakAt) {
            this.id = id; this.floor = floor; this.q = q; this.r = r; this.breakAt = breakAt;
        }
    }

    private static final class Player {
        final String userId;
        double x, y = DROP_HEIGHT, z, vy, inputX, inputZ, aimX = 1, aimZ, knockX, knockZ, slideX, slideZ;
        int floor = TOP_FLOOR;
        boolean alive = true, grounded, forfeited, diving;
        long inputAt, pigeonReadyAt, protectedUntil, hitAt, eliminatedAt, knockUntil;
        long slideStartedAt, slideUntil, slideReadyAt;
        long lastGroundedAt = Long.MIN_VALUE / 2;
        long jumpBufferedUntil = Long.MIN_VALUE;
        Player(String userId, double x, double z, long startsAt, long landsAt) {
            this.userId = userId; this.x = x; this.z = z; this.pigeonReadyAt = startsAt;
            this.slideReadyAt = landsAt;
        }
    }

    private static final class Pigeon {
        final long id, bornAt;
        final String owner;
        final double y, vx, vz;
        double x, z;
        boolean dead;
        Pigeon(long id, String owner, double x, double y, double z, double vx, double vz, long bornAt) {
            this.id = id; this.owner = owner; this.x = x; this.y = y; this.z = z;
            this.vx = vx; this.vz = vz; this.bornAt = bornAt;
        }
    }
}
