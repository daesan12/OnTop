package com.ssafy.ontop.game.omok.domain;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

// 후보 돌이 이미 놓인 판을 검사한다. 가상 확장은 반드시 finally에서 되돌린다.
final class RenjuRules {
    private static final int[][] AXES = {{1, 0}, {0, 1}, {1, 1}, {1, -1}};
    private final int[][] board;
    private final Map<String, Boolean> memo = new HashMap<>();

    RenjuRules(int[][] board) { this.board = board; }

    boolean forbidden(int x, int y) { return reason(x, y) != null; }

    String reason(int x, int y) {
        // RIF 9.2: 같은 수에서 정확한 5목을 만들면 승리를 우선한다.
        if (hasRun(x, y, 5, false)) return null;
        if (hasRun(x, y, 6, true)) return "6";
        if (fours(x, y).size() >= 2) return "44";
        String key = key(x, y);
        Boolean cached = memo.get(key);
        if (cached != null) return cached ? "33" : null;
        Set<List<Integer>> threes = new HashSet<>();
        for (int[] axis : AXES) {
            int dx = axis[0], dy = axis[1];
            // 열린 연속 4가 될 수 있는 네 칸에서, 흑 3개와 빈칸 1개를 찾는다.
            for (int start = -3; start <= 0; start++) {
                int sx = x + start * dx, sy = y + start * dy;
                if (!empty(sx - dx, sy - dy) || !empty(sx + 4 * dx, sy + 4 * dy)) continue;
                List<Integer> stones = new ArrayList<>();
                int gap = -1;
                boolean valid = true;
                for (int i = 0; i < 4; i++) {
                    int px = sx + i * dx, py = sy + i * dy;
                    if (!inside(px, py) || board[py][px] == 2) { valid = false; break; }
                    if (board[py][px] == 1) stones.add(py * OmokBoard.SIZE + px);
                    else if (gap == -1) gap = i;
                    else { valid = false; break; }
                }
                if (!valid || stones.size() != 3 || threes.contains(stones)) continue;
                int gx = sx + gap * dx, gy = sy + gap * dy;
                board[gy][gx] = 1;
                try {
                    // 양 끝 모두 정확한 5가 되어야 열린 4다. 확장점 자체도 합법이어야 한다.
                    if (!hasRun(gx, gy, 5, false)
                            && winningEnd(sx - dx, sy - dy, dx, dy)
                            && winningEnd(sx + 4 * dx, sy + 4 * dy, dx, dy)
                            && !forbidden(gx, gy)) {
                        threes.add(List.copyOf(stones));
                        if (threes.size() >= 2) { memo.put(key, true); return "33"; }
                    }
                } finally { board[gy][gx] = 0; }
            }
        }
        memo.put(key, false);
        return null;
    }

    private Set<List<Integer>> fours(int x, int y) {
        Set<List<Integer>> result = new HashSet<>();
        for (int[] axis : AXES) {
            int dx = axis[0], dy = axis[1];
            for (int start = -4; start <= 0; start++) {
                List<Integer> stones = new ArrayList<>();
                int gapX = -1, gapY = -1;
                boolean valid = true;
                for (int i = 0; i < 5; i++) {
                    int px = x + (start + i) * dx, py = y + (start + i) * dy;
                    if (!inside(px, py) || board[py][px] == 2) { valid = false; break; }
                    if (board[py][px] == 1) stones.add(py * OmokBoard.SIZE + px);
                    else if (gapX == -1) { gapX = px; gapY = py; }
                    else { valid = false; break; }
                }
                // 같은 열린 4의 양 끝은 한 개로 센다. 같은 축의 서로 다른 4는 별개다.
                if (valid && stones.size() == 4 && winningEnd(gapX, gapY, dx, dy)) {
                    result.add(List.copyOf(stones));
                }
            }
        }
        return result;
    }

    private boolean winningEnd(int x, int y, int dx, int dy) {
        if (!empty(x, y)) return false;
        return 1 + count(x, y, dx, dy) + count(x, y, -dx, -dy) == 5;
    }

    private boolean hasRun(int x, int y, int length, boolean atLeast) {
        for (int[] axis : AXES) {
            int run = 1 + count(x, y, axis[0], axis[1]) + count(x, y, -axis[0], -axis[1]);
            if (atLeast ? run >= length : run == length) return true;
        }
        return false;
    }

    private int count(int x, int y, int dx, int dy) {
        int n = 0;
        for (int px = x + dx, py = y + dy; inside(px, py) && board[py][px] == 1; px += dx, py += dy) n++;
        return n;
    }

    private boolean empty(int x, int y) { return inside(x, y) && board[y][x] == 0; }
    private boolean inside(int x, int y) { return x >= 0 && y >= 0 && x < OmokBoard.SIZE && y < OmokBoard.SIZE; }

    private String key(int x, int y) {
        // Include every cell: preview candidates and recursive extensions temporarily change the same board.
        StringBuilder key = new StringBuilder(240).append(x).append(',').append(y).append(':');
        for (int[] row : board) for (int cell : row) key.append((char) ('0' + cell));
        return key.toString();
    }
}
