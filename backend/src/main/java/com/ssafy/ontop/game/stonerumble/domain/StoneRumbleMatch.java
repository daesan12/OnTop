package com.ssafy.ontop.game.stonerumble.domain;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** 서버 고정 시간 간격으로 판정한다. 클라이언트는 좌표·명중·승패를 제출하지 않는다. */
public final class StoneRumbleMatch {
    public static final double TILE_SIZE = 2.6;
    public static final long STEP_DELAY = 1200;
    public static final long PIGEON_COOLDOWN = 1500;
    public static final long DROP_DURATION = 1200;
    public static final long COUNTDOWN_DURATION = 3000;
    public static final double DROP_HEIGHT = 33;
    public static final double PIGEON_SPEED = 20;
    public static final double KNOCKBACK_DISTANCE = TILE_SIZE;
    public static final long KNOCKBACK_DURATION = 400;
    public static final long SLIDE_DURATION = 300;
    public static final long SLIDE_COOLDOWN = 1000;
    public static final double SLIDE_DISTANCE = TILE_SIZE;
    public static final double ELIMINATION_HEIGHT = -6.0;
    private static final int[] RADII = {8, 7, 6};
    private static final double[] HEIGHTS = {0, 12, 24};
    private final List<Player> players = new ArrayList<>();
    private final List<Tile> tiles = new ArrayList<>();
    private final List<Pigeon> pigeons = new ArrayList<>();
    private final Map<String, Tile> tileIndex = new LinkedHashMap<>();
    public static final long LOADING_TIMEOUT = 90_000;
    private static final long UNSCHEDULED = 9_007_199_254_740_991L;
    private long startsAt;
    private long landsAt;
    private final long loadingStartedAt;
    private final Set<String> readyUsers = new LinkedHashSet<>();
    private boolean released;
    private int collapseFloor = 2, collapseRing = RADII[2];
    private long nextCollapseAt;
    private long now;
    private long pigeonSequence;
    private long endedAt;
    private String endReason;
    private List<String> winners = List.of();

    public StoneRumbleMatch(List<Long> users, long createdAt) {
        if (users.size() < 2 || users.size() > 8 || users.stream().distinct().count() != users.size()
                || users.stream().anyMatch(id -> id == null || id <= 0)) {
            throw new IllegalArgumentException("참가자는 서로 다른 2~8명이어야 합니다.");
        }
        loadingStartedAt = createdAt;
        now = createdAt;
        for (int floor = 0; floor < 3; floor++) {
            int radius = RADII[floor];
            for (int q = -radius; q <= radius; q++) {
                for (int r = -radius; r <= radius; r++) {
                    Tile tile = new Tile(tiles.size(), floor, q, r,
                            UNSCHEDULED);
                    tiles.add(tile);
                    tileIndex.put(key(floor, q, r), tile);
                }
            }
        }
        int[][] spawns = {{-2, 0}, {2, 0}, {0, -3}, {0, 3}, {-3, 3}, {3, -3}, {-4, 1}, {4, -1}};
        for (int i = 0; i < users.size(); i++) {
            int q = spawns[i][0], r = spawns[i][1];
            players.add(new Player(Long.toString(users.get(i)), q * TILE_SIZE, r * TILE_SIZE, startsAt, landsAt));
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
            nextCollapseAt = startsAt + 10_000;
            for (Player p : players) { p.pigeonReadyAt = startsAt; p.slideReadyAt = landsAt; }
            collapseOuterRing();
        }
    }

    /** 위층의 남은 테두리부터 한 겹씩 없앤 후 다음 층으로 내려간다. */
    private void collapseOuterRing() {
        while (collapseFloor >= 0) {
            int floor = collapseFloor, ring = collapseRing;
            var border = tiles.stream().filter(t -> t.floor == floor
                    && Math.max(Math.abs(t.q), Math.abs(t.r)) == ring).toList();
            if (border.stream().noneMatch(t -> t.breakAt > now)) {
                if (now >= nextCollapseAt) { nextCollapseAt += 6000; }
                nextCollapseRing();
                continue;
            }
            for (Tile tile : border) { tile.breakAt = Math.min(tile.breakAt, nextCollapseAt); }
            break;
        }
    }

    private void nextCollapseRing() {
        if (--collapseRing < 0 && --collapseFloor >= 0) { collapseRing = RADII[collapseFloor]; }
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
        player.inputX = x / length;
        player.inputZ = z / length;
        player.inputAt = now;
        double aimLength = Math.hypot(aimX, aimZ);
        if (aimLength > 0.01) {
            player.aimX = aimX / aimLength;
            player.aimZ = aimZ / aimLength;
        }
        if (jump && player.grounded && now >= player.slideUntil) {
            player.vy = 7;
            player.grounded = false;
        }
        if (slide && now >= player.knockUntil && now >= player.slideReadyAt) {
            double directionLength = Math.hypot(player.inputX, player.inputZ);
            player.slideX = (directionLength > .01 ? player.inputX / directionLength : player.aimX) * SLIDE_DISTANCE;
            player.slideZ = (directionLength > .01 ? player.inputZ / directionLength : player.aimZ) * SLIDE_DISTANCE;
            player.slideStartedAt = now;
            player.slideUntil = now + SLIDE_DURATION;
            player.slideReadyAt = now + SLIDE_COOLDOWN;
        }
        if (fire && now >= startsAt && now >= player.pigeonReadyAt) {
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
            collapseOuterRing();
            for (Player player : players) {
                if (player.alive) {
                    move(player);
                }
            }
            collidePlayers();
            if (now < startsAt) {
                // 준비 이동으로 경기 시작 전에 발판 밖으로 떨어지지 않게 한다.
                double limit = (RADII[2] + .5) * TILE_SIZE - .4;
                for (Player player : players) {
                    if (player.alive) {
                        player.x = Math.max(-limit, Math.min(limit, player.x));
                        player.z = Math.max(-limit, Math.min(limit, player.z));
                        if (player.y < HEIGHTS[2]) {
                            player.y = HEIGHTS[2];
                            player.vy = 0;
                            player.floor = 2;
                            player.grounded = true;
                        }
                    }
                }
            }
            movePigeons();
            List<String> alive = players.stream().filter(p -> p.alive).map(p -> p.userId).toList();
            if (alive.size() <= 1) {
                finish(alive.isEmpty() ? "ALL_FALLEN" : "LAST_PLAYER_STANDING", alive, now);
            }
        }
    }

    private void move(Player player) {
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
            double before = Math.max(0, (double) (now - 20 - player.slideStartedAt) / SLIDE_DURATION);
            double after = Math.min(1, (double) (now - player.slideStartedAt) / SLIDE_DURATION);
            player.x += player.slideX * (after - before);
            player.z += player.slideZ * (after - before);
        }
        player.vy -= 18 * 0.02;
        player.y += player.vy * 0.02;
        player.grounded = false;
        if (player.vy <= 0) {
            for (int floor = 2; floor >= 0; floor--) {
                if (oldY + 0.001 >= HEIGHTS[floor] && player.y <= HEIGHTS[floor]) {
                    Tile tile = tileAt(floor, player.x, player.z);
                    if (tile != null && tile.breakAt > now) {
                        player.y = HEIGHTS[floor];
                        player.vy = 0;
                        player.floor = floor;
                        player.grounded = true;
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
        return tileIndex.get(key(floor, (int) Math.floor(x / TILE_SIZE + .5),
                (int) Math.floor(z / TILE_SIZE + .5)));
    }

    private static String key(int floor, int q, int r) {
        return floor + ":" + q + ":" + r;
    }

    public boolean finished() {
        return endReason != null;
    }

    public Snapshot snapshot() {
        return new Snapshot("STONE_RUMBLE", finished() ? "FINISHED" : "PLAYING", now, startsAt, endedAt,
                endReason, winners, tiles.stream().map(t -> new TileView(t.id, t.floor, t.q, t.r,
                        t.breakAt, t.stepped)).toList(),
                players.stream().map(p -> new PlayerView(p.userId, p.x, p.y, p.z, p.floor, p.alive, p.grounded,
                        p.aimX, p.aimZ, p.pigeonReadyAt, p.hitAt, p.eliminatedAt, p.forfeited,
                        p.slideStartedAt, p.slideUntil, p.slideReadyAt, p.slideX, p.slideZ,
                        rank(p), reward(p))).toList(),
                pigeons.stream().map(p -> new PigeonView(p.id, p.owner, p.x, p.y, p.z, p.vx, p.vz)).toList(),
                landsAt, finished() ? "FINISHED" : !released ? "LOADING" : now < landsAt ? "DROPPING" : now < startsAt ? "COUNTDOWN" : "RUNNING",
                List.copyOf(readyUsers));
    }

    private Integer rank(Player player) {
        if (!finished() || Set.of("SIMULATION_LIMIT", "LOADING_TIMEOUT").contains(endReason)) { return null; }
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

    public record Snapshot(String gameCode, String status, long serverTime, long startsAt, long endedAt,
            String endReason, List<String> winnerUserIds, List<TileView> tiles, List<PlayerView> players,
            List<PigeonView> pigeons, long landsAt, String phase, List<String> readyUserIds) { }
    public record TileView(int id, int floor, int q, int r, long breakAt, boolean stepped) { }
    public record PlayerView(String userId, double x, double y, double z, int floor, boolean alive,
            boolean grounded, double aimX, double aimZ, long pigeonReadyAt, long hitAt,
            long eliminatedAt, boolean forfeited, long slideStartedAt, long slideUntil, long slideReadyAt,
            double slideX, double slideZ, Integer rank, long rewardCoins) { }
    public record PigeonView(long id, String owner, double x, double y, double z, double vx, double vz) { }

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
        int floor = 2;
        boolean alive = true, grounded, forfeited;
        long inputAt, pigeonReadyAt, protectedUntil, hitAt, eliminatedAt, knockUntil;
        long slideStartedAt, slideUntil, slideReadyAt;
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
