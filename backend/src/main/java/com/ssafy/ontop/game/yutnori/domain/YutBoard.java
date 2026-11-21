package com.ssafy.ontop.game.yutnori.domain;

import java.util.ArrayList;
import java.util.List;

/** 바깥 20칸과 대각선 9칸. 출발 전은 0, 참먹이는 20, 완주는 30이다. */
public final class YutBoard {
    public static final int FINISHED = 30;

    private YutBoard() { }

    public static List<Integer> move(List<Integer> history, int steps, boolean shortcut, boolean backHomeFinish) {
        var result = new ArrayList<>(history);
        int current = result.isEmpty() ? 0 : result.getLast();
        if (current == FINISHED || steps == 0 || steps < -1 || steps > 5) {
            throw new IllegalArgumentException("이동할 말을 확인해주세요.");
        }
        if (steps == -1) {
            if (current == 0) {
                throw new IllegalArgumentException("판 위의 말을 골라주세요.");
            }
            if (current == 20 && backHomeFinish) {
                result.add(FINISHED);
            } else if (current == 1) {
                // 첫 도 자리의 뒷칸은 출발 전 대기석이 아니라 참먹이다.
                result.clear();
                result.add(19);
                result.add(20);
            } else {
                result.removeLast();
            }
            return result;
        }
        for (int step = 0; step < steps; step++) {
            int previous = result.size() < 2 ? 0 : result.get(result.size() - 2);
            int next = next(current, previous, step == 0 && shortcut);
            result.add(next);
            current = next;
            if (current == FINISHED) {
                break;
            }
        }
        return result;
    }

    private static int next(int node, int previous, boolean shortcut) {
        return switch (node) {
            case 5 -> shortcut ? 21 : 6;
            case 10 -> shortcut ? 26 : 11;
            case 20 -> FINISHED;
            case 21, 22, 24, 26, 28 -> node + 1;
            case 23 -> shortcut || previous != 22 ? 28 : 24;
            case 25 -> 15;
            case 27 -> 23;
            case 29 -> 20;
            default -> node + 1;
        };
    }
}
