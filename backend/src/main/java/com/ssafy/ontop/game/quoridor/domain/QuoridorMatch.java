package com.ssafy.ontop.game.quoridor.domain;

import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Cell;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Goal;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Orientation;
import com.ssafy.ontop.game.quoridor.domain.QuoridorBoard.Wall;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;

/** 엔진의 경기 잠금 안에서만 변경한다. 기권한 말은 제거하고 이미 설치한 장벽은 보존한다. */
public final class QuoridorMatch {
    private final List<Long> users;
    private final List<Cell> positions = new ArrayList<>();
    private final List<Goal> goals;
    private final List<Wall> walls = new ArrayList<>();
    private final int[] remaining;
    private final boolean[] active;
    private int turn;
    private long version = 1;
    private Long winner;
    private Instant endedAt;
    private String endReason;
    private Instant turnDeadline;

    public QuoridorMatch(List<Long> users, int firstPlayer) {
        this(users, firstPlayer, Instant.now());
    }

    public QuoridorMatch(List<Long> users, int firstPlayer, Instant startedAt) {
        if (users == null || !List.of(2, 4).contains(users.size()) || new HashSet<>(users).size() != users.size()
                || users.stream().anyMatch(user -> user == null || user <= 0)
                || firstPlayer < 0 || firstPlayer >= users.size()) {
            throw new IllegalArgumentException("길목 한 수는 서로 다른 2명 또는 4명이 참가합니다.");
        }
        this.users = List.copyOf(users);
        positions.add(new Cell(4, 0));
        if (users.size() == 4) {
            positions.add(new Cell(8, 4));
        }
        positions.add(new Cell(4, 8));
        if (users.size() == 4) {
            positions.add(new Cell(0, 4));
        }
        goals = users.size() == 2 ? List.of(Goal.SOUTH, Goal.NORTH)
                : List.of(Goal.SOUTH, Goal.WEST, Goal.NORTH, Goal.EAST);
        remaining = new int[users.size()];
        active = new boolean[users.size()];
        java.util.Arrays.fill(remaining, users.size() == 2 ? 10 : 5);
        java.util.Arrays.fill(active, true);
        turn = firstPlayer;
        turnDeadline = startedAt.plusSeconds(30);
    }

    public void move(long userId, int x, int y, Instant now) {
        int actor = requireTurn(userId);
        Cell destination = new Cell(x, y);
        if (!legalMoves().contains(destination)) {
            throw new Rejected(Rejection.FORBIDDEN_MOVE);
        }
        positions.set(actor, destination);
        version++;
        if (goals.get(actor).reached(destination)) {
            finish(userId, "GOAL_REACHED", now);
        } else {
            advance(now);
        }
    }

    public void place(long userId, Wall wall) {
        place(userId, wall, Instant.now());
    }

    public void place(long userId, Wall wall, Instant now) {
        int actor = requireTurn(userId);
        if (remaining[actor] == 0 || !canPlace(wall)) {
            throw new Rejected(Rejection.FORBIDDEN_MOVE);
        }
        walls.add(wall);
        remaining[actor]--;
        version++;
        advance(now);
    }

    public boolean forfeit(long userId, Instant now) {
        int actor = users.indexOf(userId);
        if (actor < 0 || !active[actor] || endedAt != null) {
            return false;
        }
        active[actor] = false;
        version++;
        List<Long> survivors = players().stream().filter(Player::active).map(Player::userId).toList();
        if (survivors.size() == 1) {
            finish(survivors.getFirst(), "LAST_PLAYER_STANDING", now);
        } else if (actor == turn) {
            advance(now);
        }
        return true;
    }

    private int requireTurn(long userId) {
        if (endedAt != null) {
            throw new Rejected(Rejection.GAME_FINISHED);
        }
        int actor = users.indexOf(userId);
        if (actor < 0) {
            throw new Rejected(Rejection.ACCESS_DENIED);
        }
        if (!active[actor]) {
            throw new Rejected(Rejection.NOT_ACTIVE);
        }
        if (turn != actor) {
            throw new Rejected(Rejection.NOT_YOUR_TURN);
        }
        return actor;
    }

    /** 마감 시 서버가 현재 합법 이동 중 목표까지 가장 가까운 칸을 선택한다. 동률은 y·x 순이다. */
    public void expire(Instant now) {
        if (endedAt != null || now.isBefore(turnDeadline)) {
            return;
        }
        Cell destination = legalMoves().stream().min(Comparator
                .comparingInt((Cell cell) -> QuoridorBoard.distance(cell, goals.get(turn), walls))
                .thenComparingInt(Cell::y).thenComparingInt(Cell::x)).orElse(null);
        if (destination == null) {
            // 말에 둘러싸여 이동 자체가 불가능하면 장벽을 임의로 소비하거나 차례를 넘기지 않는다.
            turnDeadline = now.plusSeconds(30);
            version++;
            return;
        }
        move(users.get(turn), destination.x(), destination.y(), now);
    }

    private void advance(Instant now) {
        do {
            turn = (turn + 1) % users.size();
        } while (!active[turn]);
        turnDeadline = now.plusSeconds(30);
    }

    private void finish(long userId, String reason, Instant now) {
        winner = userId;
        endReason = reason;
        endedAt = now;
        turnDeadline = null;
    }

    public List<Cell> legalMoves() {
        if (endedAt != null) {
            return List.of();
        }
        return QuoridorBoard.legalMoves(positions.get(turn), new HashSet<>(players().stream()
                .filter(Player::active).map(player -> new Cell(player.x(), player.y())).toList()), walls);
    }

    public boolean canPlace(Wall wall) {
        List<Player> playing = players().stream().filter(Player::active).toList();
        return QuoridorBoard.canPlace(wall, walls, playing.stream().map(p -> new Cell(p.x(), p.y())).toList(),
                playing.stream().map(Player::goal).toList());
    }

    public List<Wall> legalWalls() {
        if (endedAt != null || remaining[turn] == 0) {
            return List.of();
        }
        List<Wall> result = new ArrayList<>();
        for (int y = 0; y < 8; y++) {
            for (int x = 0; x < 8; x++) {
                for (Orientation orientation : Orientation.values()) {
                    Wall candidate = new Wall(x, y, orientation);
                    if (canPlace(candidate)) {
                        result.add(candidate);
                    }
                }
            }
        }
        return List.copyOf(result);
    }

    public List<Player> players() {
        List<Player> result = new ArrayList<>();
        for (int index = 0; index < users.size(); index++) {
            Cell position = positions.get(index);
            result.add(new Player(users.get(index), position.x(), position.y(), goals.get(index), remaining[index],
                    active[index]));
        }
        return List.copyOf(result);
    }

    public List<Long> users() { return users; }
    public List<Wall> walls() { return List.copyOf(walls); }
    public long version() { return version; }
    public Long turnUserId() { return endedAt == null ? users.get(turn) : null; }
    public Long winnerUserId() { return winner; }
    public Instant endedAt() { return endedAt; }
    public String endReason() { return endReason; }
    public Instant turnDeadline() { return turnDeadline; }

    public record Player(long userId, int x, int y, Goal goal, int wallsRemaining, boolean active) { }
}
