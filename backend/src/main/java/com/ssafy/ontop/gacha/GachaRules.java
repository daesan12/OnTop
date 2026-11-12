package com.ssafy.ontop.gacha;

import java.util.Arrays;
import java.util.function.IntUnaryOperator;

/** 등급별 남은 칸을 균등 추첨한다. 상품 개수나 클라이언트 확률을 사용하지 않는다. */
public final class GachaRules {
    public static final long TICKET_PRICE = 100;
    /** 한 번에 살 수 있는 뽑기권 수(한 거래로 차감·지급). */
    public static final int MAX_PURCHASE = 100;
    public static final long COIN_REWARD = 20;
    public static final long REFILL_MILLIS = 3000;
    public static boolean refilling(java.time.Instant deadline, java.time.Instant now) {
        return deadline!=null && now.isBefore(deadline);
    }
    private static final int[] INITIAL = {1, 2, 4, 8, 15};
    private static final long[] VALUES = {1000, 500, 250, 100};
    private GachaRules() { }
    public static int[] initial() { return INITIAL.clone(); }
    public static long value(int grade) { checkGrade(grade); return VALUES[grade - 1]; }
    public static void checkGrade(int grade) {
        if (grade < 1 || grade > 4) throw new GachaException(400, "INVALID_REQUEST", "상자 등급을 확인해주세요.");
    }
    public static int select(int[] remaining, IntUnaryOperator random) {
        if (remaining.length != 5) throw new IllegalArgumentException("보상 수량을 확인하세요.");
        for (int i = 0; i < 5; i++) {
            if (remaining[i] < 0 || remaining[i] > INITIAL[i]) throw new IllegalArgumentException("보상 수량을 확인하세요.");
        }
        int total = Arrays.stream(remaining).sum();
        if (total == 0) throw new IllegalStateException("빈 뽑기 회차입니다.");
        int choice = random.applyAsInt(total);
        if (choice < 0 || choice >= total) throw new IllegalArgumentException("추첨 범위를 확인하세요.");
        for (int i = 0; i < remaining.length; i++) {
            if (choice < remaining[i]) return i;
            choice -= remaining[i];
        }
        throw new IllegalStateException("추첨 결과를 확인하세요.");
    }
}
