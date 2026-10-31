package com.ssafy.ontop.game.ledger.domain;

import java.util.Arrays;

/** 주사위 장부 점수표. 주사위5개의 눈(1~6)만 받는 순수 계산이다. */
public final class DiceLedgerScoring {
    public static final int UPPER_BONUS_THRESHOLD = 63;
    public static final int UPPER_BONUS = 35;

    public enum Category {
        ONES, TWOS, THREES, FOURS, FIVES, SIXES,
        CHOICE, FOUR_OF_A_KIND, FULL_HOUSE, SMALL_STRAIGHT, LARGE_STRAIGHT, FIVE_OF_A_KIND;

        public boolean upper() { return ordinal() < 6; }

        public static Category find(String name) {
            for (Category category : values()) {
                if (category.name().equals(name)) { return category; }
            }
            return null;
        }
    }

    private DiceLedgerScoring() { }

    public static int score(Category category, int[] faces) {
        int[] counts = counts(faces);
        int sum = Arrays.stream(faces).sum();
        return switch (category) {
            case ONES, TWOS, THREES, FOURS, FIVES, SIXES -> {
                int face = category.ordinal() + 1;
                yield counts[face] * face;
            }
            case CHOICE -> sum;
            // 같은 눈 네 개의 합만 센다. 다섯 번째 주사위는 더하지 않는다.
            case FOUR_OF_A_KIND -> {
                for (int face = 6; face >= 1; face--) {
                    if (counts[face] >= 4) { yield face * 4; }
                }
                yield 0;
            }
            // 같은 눈 다섯 개도 풀하우스로 인정한다.
            case FULL_HOUSE -> {
                boolean three = false, two = false, five = false;
                for (int face = 1; face <= 6; face++) {
                    three |= counts[face] == 3;
                    two |= counts[face] == 2;
                    five |= counts[face] == 5;
                }
                yield three && two || five ? sum : 0;
            }
            case SMALL_STRAIGHT -> run(counts) >= 4 ? 15 : 0;
            case LARGE_STRAIGHT -> run(counts) == 5 ? 30 : 0;
            case FIVE_OF_A_KIND -> Arrays.stream(counts).anyMatch(count -> count == 5) ? 50 : 0;
        };
    }

    public static int upperBonus(int upperSubtotal) {
        return upperSubtotal >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS : 0;
    }

    private static int[] counts(int[] faces) {
        if (faces == null || faces.length != 5) { throw new IllegalArgumentException("주사위 5개가 필요합니다."); }
        int[] counts = new int[7];
        for (int face : faces) {
            if (face < 1 || face > 6) { throw new IllegalArgumentException("주사위 눈은 1~6입니다."); }
            counts[face]++;
        }
        return counts;
    }

    private static int run(int[] counts) {
        int best = 0, current = 0;
        for (int face = 1; face <= 6; face++) {
            current = counts[face] > 0 ? current + 1 : 0;
            best = Math.max(best, current);
        }
        return best;
    }
}
