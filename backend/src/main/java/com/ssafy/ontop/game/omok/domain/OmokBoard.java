package com.ssafy.ontop.game.omok.domain;

import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

// 시간·계정·재화와 독립된 렌주 오목판이다. 경기 서비스가 차례와 입력 권한을 확인한다.
public final class OmokBoard {
    public static final int SIZE = 15;
    private static final int[][] DIRECTIONS = {{1, 0}, {0, 1}, {1, 1}, {1, -1}};
    private final int[][] cells = new int[SIZE][SIZE];
    private int moveCount;
    private Outcome outcome = Outcome.PLAYING;
    private Move lastMove;
    private final List<Move> moves = new ArrayList<>();
    private List<Point> forbiddenMoves;

    public void place(Stone stone, int x, int y) {
        Objects.requireNonNull(stone);
        if (outcome != Outcome.PLAYING || x < 0 || x >= SIZE || y < 0 || y >= SIZE || cells[y][x] != 0) {
            throw new IllegalArgumentException("착수할 수 없는 위치 또는 종료된 오목판입니다.");
        }
        cells[y][x] = stone.code();
        if (stone == Stone.BLACK) {
            boolean forbidden;
            try { forbidden = new RenjuRules(cells).forbidden(x, y); }
            finally { cells[y][x] = 0; }
            if (forbidden) throw new ForbiddenMove();
            cells[y][x] = stone.code();
        }
        moveCount++;
        forbiddenMoves = null;
        lastMove = new Move(x, y, stone);
        moves.add(lastMove);
        for (int[] direction : DIRECTIONS) {
            int connected = 1 + count(stone, x, y, direction[0], direction[1])
                    + count(stone, x, y, -direction[0], -direction[1]);
            if (stone == Stone.BLACK ? connected == 5 : connected >= 5) {
                outcome = stone == Stone.BLACK ? Outcome.BLACK_WIN : Outcome.WHITE_WIN;
                return;
            }
        }
        if (moveCount == SIZE * SIZE) {
            outcome = Outcome.DRAW;
        }
    }

    public void undoPair() {
        if (outcome != Outcome.PLAYING || moves.size() < 2) {
            throw new IllegalStateException("진행 중인 두 수만 무를 수 있습니다.");
        }
        for (int i = 0; i < 2; i++) {
            Move move = moves.removeLast();
            cells[move.y()][move.x()] = 0;
        }
        moveCount = moves.size();
        lastMove = moves.isEmpty() ? null : moves.getLast();
        forbiddenMoves = null;
    }

    public Snapshot snapshot() {
        List<List<Integer>> board = new ArrayList<>();
        for (int[] row : cells) {
            List<Integer> copy = new ArrayList<>();
            for (int value : row) {
                copy.add(value);
            }
            board.add(List.copyOf(copy));
        }
        return new Snapshot(List.copyOf(board), moveCount, outcome, lastMove, forbiddenMoves());
    }

    public List<Move> moves() { return List.copyOf(moves); }

    // Reuse the authoritative rule and calculate once per changed board, not per viewer/timer tick.
    private List<Point> forbiddenMoves() {
        if (outcome != Outcome.PLAYING) return List.of();
        if (forbiddenMoves != null) return forbiddenMoves;
        List<Point> result = new ArrayList<>();
        long blacks = moves.stream().filter(move -> move.stone() == Stone.BLACK).count();
        if (blacks >= 4) {
            RenjuRules rules = new RenjuRules(cells);
            for (int y = 0; y < SIZE; y++) for (int x = 0; x < SIZE; x++) {
                if (cells[y][x] != 0) continue;
                cells[y][x] = 1;
                try {
                    String kind = rules.reason(x, y);
                    if (kind != null) result.add(new Point(x, y, kind));
                }
                finally { cells[y][x] = 0; }
            }
        }
        forbiddenMoves = List.copyOf(result);
        return forbiddenMoves;
    }

    private int count(Stone stone, int x, int y, int dx, int dy) {
        int count = 0;
        for (int nextX = x + dx, nextY = y + dy;
                nextX >= 0 && nextX < SIZE && nextY >= 0 && nextY < SIZE;
                nextX += dx, nextY += dy) {
            if (cells[nextY][nextX] != stone.code()) {
                break;
            }
            count++;
        }
        return count;
    }

    public enum Stone {
        BLACK(1), WHITE(2);

        private final int code;

        Stone(int code) {
            this.code = code;
        }

        public int code() {
            return code;
        }
    }

    public enum Outcome { PLAYING, BLACK_WIN, WHITE_WIN, DRAW }

    public static final class ForbiddenMove extends IllegalArgumentException {
        public ForbiddenMove() { super("흑의 삼삼·사사·장목 금수입니다."); }
    }

    public record Move(int x, int y, Stone stone) { }

    public record Point(int x, int y, String kind) { }
    public record Snapshot(List<List<Integer>> board, int moveCount, Outcome outcome, Move lastMove,
            List<Point> forbiddenMoves) { }
}
