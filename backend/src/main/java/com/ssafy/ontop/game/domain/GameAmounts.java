package com.ssafy.ontop.game.domain;

/** 기존 GAME_RESULT의 JSON number 계약. Wallet의 저장 타입은 계속 long이다. */
public final class GameAmounts {
    public static final long MAX_SAFE_INTEGER = 9_007_199_254_740_991L;
    private GameAmounts() { }

    public static long validate(long bet, int count) {
        if (bet <= 0 || bet > MAX_SAFE_INTEGER || count < 2 || count > 4) {
            throw new IllegalArgumentException("참가비와 참가 인원을 확인하세요.");
        }
        try {
            long pot = Math.multiplyExact(bet, count);
            requireSafe(pot);
            for (int winners = 1; winners <= count; winners++) {
                long bonus = (winners - pot % winners) % winners;
                long payout = Math.addExact(pot, bonus) / winners;
                requireSafe(payout);
                requireSafe(Math.subtractExact(payout, bet));
            }
            requireSafe(-bet);
            return pot;
        } catch (ArithmeticException exception) {
            throw new IllegalArgumentException("참가비가 지원 범위를 초과했습니다.", exception);
        }
    }

    private static void requireSafe(long value) {
        if (value < -MAX_SAFE_INTEGER || value > MAX_SAFE_INTEGER) {
            throw new IllegalArgumentException("경기 금액이 JSON 안전 정수 범위를 초과했습니다.");
        }
    }
}
