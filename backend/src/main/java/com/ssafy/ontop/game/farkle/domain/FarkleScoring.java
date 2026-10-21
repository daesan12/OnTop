package com.ssafy.ontop.game.farkle.domain;

import java.util.Arrays;

/** 최대 6개 주사위의 모든 겹치지 않는 득점 분할 중 최댓값을 구한다. */
public final class FarkleScoring {
    private FarkleScoring() { }

    // 0은 빈 선택, -1은 선택한 주사위 전체를 득점에 사용할 수 없음이다.
    public static int score(int... faces) {
        validate(faces);
        int[] memo = new int[1 << faces.length];
        Arrays.fill(memo, Integer.MIN_VALUE);
        memo[0] = 0;
        return solve(faces, memo.length - 1, memo);
    }

    public static boolean hasScore(int... faces) {
        validate(faces);
        for (int mask = 1; mask < (1 << faces.length); mask++) {
            if (combination(faces, mask) > 0) {
                return true;
            }
        }
        return false;
    }

    private static int solve(int[] faces, int mask, int[] memo) {
        if (memo[mask] != Integer.MIN_VALUE) {
            return memo[mask];
        }
        int best = -1;
        int first = Integer.lowestOneBit(mask);
        for (int subset = mask; subset > 0; subset = (subset - 1) & mask) {
            if ((subset & first) == 0) {
                continue;
            }
            int points = combination(faces, subset);
            if (points > 0) {
                int rest = solve(faces, mask ^ subset, memo);
                if (rest >= 0) {
                    best = Math.max(best, points + rest);
                }
            }
        }
        return memo[mask] = best;
    }

    private static int combination(int[] faces, int mask) {
        int[] counts = new int[7];
        int size = Integer.bitCount(mask);
        for (int index = 0; index < faces.length; index++) {
            if ((mask & (1 << index)) != 0) {
                counts[faces[index]]++;
            }
        }
        if (size == 1) {
            return counts[1] == 1 ? 100 : counts[5] == 1 ? 50 : 0;
        }
        for (int face = 1; face <= 6; face++) {
            if (size >= 3 && counts[face] == size) {
                return (face == 1 ? 1000 : face * 100) * (1 << (size - 3));
            }
        }
        if (size == 5 && straight(counts, 1, 5)) { return 500; }
        if (size == 5 && straight(counts, 2, 6)) { return 750; }
        return size == 6 && straight(counts, 1, 6) ? 1500 : 0;
    }

    private static boolean straight(int[] counts, int start, int end) {
        for (int face = start; face <= end; face++) {
            if (counts[face] != 1) { return false; }
        }
        return true;
    }

    private static void validate(int[] faces) {
        if (faces == null || faces.length > 6 || Arrays.stream(faces).anyMatch(face -> face < 1 || face > 6)) {
            throw new IllegalArgumentException("1~6 눈의 주사위를 최대 6개 전달해주세요.");
        }
    }
}
