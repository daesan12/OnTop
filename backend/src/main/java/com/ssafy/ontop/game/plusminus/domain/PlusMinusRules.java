package com.ssafy.ontop.game.plusminus.domain;

import java.time.ZoneId;
import java.util.List;

/** 더하기 빼기 아케이드의 서버 고정 규칙. 칸마다 확률이 같아 릴에 보이는 칸 비율이 곧 확률이다. */
public final class PlusMinusRules {
    public static final int FEE = 30;
    public static final int DAILY_PLAYS = 10;
    public static final ZoneId KST = ZoneId.of("Asia/Seoul");
    public static final int POINT_PAYOUT = 10;
    public static final int JACKPOT_FIRST = 7;
    public static final int JACKPOT_PAYOUT = 500;
    /** 숫자2 릴의 JACKPOT 칸 값. */
    public static final int JACKPOT = -1;
    /** 12시 방향부터 시계방향. 0·1·2 각 3칸, 3 2칸, 4·5·6·7·8 각 1칸. */
    public static final List<Integer> FIRST_REEL = List.of(7, 0, 3, 1, 5, 2, 0, 4, 1, 2, 8, 0, 3, 1, 6, 2);
    public static final List<String> OPERATOR_REEL = List.of("+", "-", "+", "-", "+", "-", "+", "-");
    /** 1·2 각 3칸, 0·3 각 2칸, 4·5·6·8·9·JACKPOT 각 1칸. */
    public static final List<Integer> SECOND_REEL = List.of(JACKPOT, 1, 4, 0, 2, 9, 1, 3, 2, 6, 0, 1, 5, 2, 8, 3);

    public enum Outcome { LOST, PAID, JACKPOT }

    private PlusMinusRules() {
    }

    /** JACKPOT 칸이면 계산식이 없으므로 null이다. */
    public static Integer result(int firstCell, int operatorCell, int secondCell) {
        int second = SECOND_REEL.get(secondCell);
        if (second == JACKPOT) {
            return null;
        }
        int first = FIRST_REEL.get(firstCell);
        return OPERATOR_REEL.get(operatorCell).equals("+") ? first + second : first - second;
    }

    /** JACKPOT은 숫자1이 7일 때만 당첨이고, 계산 결과는 1 이상일 때만 결과 × 10냥이다. */
    public static Outcome outcome(int firstCell, int operatorCell, int secondCell) {
        Integer result = result(firstCell, operatorCell, secondCell);
        if (result == null) {
            return FIRST_REEL.get(firstCell) == JACKPOT_FIRST ? Outcome.JACKPOT : Outcome.LOST;
        }
        return result >= 1 ? Outcome.PAID : Outcome.LOST;
    }

    public static int payout(int firstCell, int operatorCell, int secondCell) {
        return switch (outcome(firstCell, operatorCell, secondCell)) {
            case JACKPOT -> JACKPOT_PAYOUT;
            case PAID -> result(firstCell, operatorCell, secondCell) * POINT_PAYOUT;
            case LOST -> 0;
        };
    }
}
