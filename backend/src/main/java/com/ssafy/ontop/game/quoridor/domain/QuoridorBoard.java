package com.ssafy.ontop.game.quoridor.domain;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/** 좌표는 북서쪽이 (0, 0)이다. 장벽 좌표는 두 칸 사이 8×8 교차 홈의 북서쪽 칸이다. */
public final class QuoridorBoard {
    public static final int SIZE = 9;
    private static final int[][] DIRECTIONS = {{0, -1}, {1, 0}, {0, 1}, {-1, 0}};

    private QuoridorBoard() { }

    public record Cell(int x, int y) {
        public boolean isInside() {
            return x >= 0 && x < SIZE && y >= 0 && y < SIZE;
        }

        Cell step(int dx, int dy) {
            return new Cell(x + dx, y + dy);
        }
    }

    public enum Orientation { HORIZONTAL, VERTICAL }

    public enum Goal {
        NORTH, EAST, SOUTH, WEST;

        public boolean reached(Cell cell) {
            return switch (this) {
                case NORTH -> cell.y() == 0;
                case EAST -> cell.x() == SIZE - 1;
                case SOUTH -> cell.y() == SIZE - 1;
                case WEST -> cell.x() == 0;
            };
        }
    }

    public record Wall(int x, int y, Orientation orientation) {
        public boolean isInside() {
            return orientation != null && x >= 0 && x < SIZE - 1 && y >= 0 && y < SIZE - 1;
        }
    }

    public static boolean isBlocked(Cell from, Cell to, List<Wall> walls) {
        if (!from.isInside() || !to.isInside() || Math.abs(from.x() - to.x()) + Math.abs(from.y() - to.y()) != 1) {
            return true;
        }
        for (Wall wall : walls) {
            if (wall.orientation() == Orientation.HORIZONTAL && from.x() == to.x()
                    && Math.min(from.y(), to.y()) == wall.y() && from.x() >= wall.x() && from.x() <= wall.x() + 1) {
                return true;
            }
            if (wall.orientation() == Orientation.VERTICAL && from.y() == to.y()
                    && Math.min(from.x(), to.x()) == wall.x() && from.y() >= wall.y() && from.y() <= wall.y() + 1) {
                return true;
            }
        }
        return false;
    }

    public static List<Cell> legalMoves(Cell own, Set<Cell> occupied, List<Wall> walls) {
        Set<Cell> moves = new java.util.LinkedHashSet<>();
        for (int[] direction : DIRECTIONS) {
            Cell neighbor = own.step(direction[0], direction[1]);
            if (isBlocked(own, neighbor, walls)) {
                continue;
            }
            if (!occupied.contains(neighbor)) {
                moves.add(neighbor);
                continue;
            }
            Cell behind = neighbor.step(direction[0], direction[1]);
            if (!isBlocked(neighbor, behind, walls) && !occupied.contains(behind)) {
                moves.add(behind);
            } else {
                // 말·장벽·보드 끝으로 직진 점프가 막힐 때만 옆으로 회피한다. 연쇄 점프는 하지 않는다.
                for (int sign : new int[]{-1, 1}) {
                    Cell diagonal = neighbor.step(direction[1] * sign, direction[0] * sign);
                    if (!isBlocked(neighbor, diagonal, walls) && !occupied.contains(diagonal)) {
                        moves.add(diagonal);
                    }
                }
            }
        }
        return List.copyOf(moves);
    }

    public static boolean overlaps(Wall candidate, List<Wall> walls) {
        if (!candidate.isInside()) {
            return true;
        }
        for (Wall wall : walls) {
            if (candidate.x() == wall.x() && candidate.y() == wall.y()) {
                return true;
            }
            if (candidate.orientation() == wall.orientation()
                    && (candidate.orientation() == Orientation.HORIZONTAL
                        ? candidate.y() == wall.y() && Math.abs(candidate.x() - wall.x()) < 2
                        : candidate.x() == wall.x() && Math.abs(candidate.y() - wall.y()) < 2)) {
                return true;
            }
        }
        return false;
    }

    /** 경로 보장은 말의 일시적 점유와 무관하게 장벽만으로 검사한다. */
    public static boolean hasPath(Cell start, Goal goal, List<Wall> walls) {
        Set<Cell> visited = new HashSet<>();
        ArrayDeque<Cell> queue = new ArrayDeque<>();
        queue.add(start);
        visited.add(start);
        while (!queue.isEmpty()) {
            Cell cell = queue.removeFirst();
            if (goal.reached(cell)) {
                return true;
            }
            for (int[] direction : DIRECTIONS) {
                Cell next = cell.step(direction[0], direction[1]);
                if (!isBlocked(cell, next, walls) && visited.add(next)) {
                    queue.addLast(next);
                }
            }
        }
        return false;
    }

    public static boolean canPlace(Wall candidate, List<Wall> walls, List<Cell> pawns, List<Goal> goals) {
        if (overlaps(candidate, walls)) {
            return false;
        }
        List<Wall> proposed = new ArrayList<>(walls);
        proposed.add(candidate);
        for (int index = 0; index < pawns.size(); index++) {
            if (!hasPath(pawns.get(index), goals.get(index), proposed)) {
                return false;
            }
        }
        return true;
    }
}
