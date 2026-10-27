package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameFinished.Result;
import java.util.ArrayList;
import java.util.List;

/** 참가 순서가 고정된 정수 정산. 원래 판돈과 서버 발행 보너스를 중복 없이 분리한다. */
public record GameSettlementCalculation(long bonus, long payoutPerWinner, boolean release, List<Award> awards) {
    public GameSettlementCalculation { awards = List.copyOf(awards); }

    public static GameSettlementCalculation refund(int participantCount) {
        if (participantCount < 2 || participantCount > 4) {
            throw new IllegalArgumentException("반환 참가자 수를 확인하세요.");
        }
        return new GameSettlementCalculation(0, 0, true,
                java.util.Collections.nCopies(participantCount, new Award(0, 0)));
    }

    public static GameSettlementCalculation calculate(long bet, List<Result> results) {
        if (bet <= 0 || results.size() < 2 || results.size() > 4 || results.stream().anyMatch(java.util.Objects::isNull)) {
            throw new IllegalArgumentException("정산 참가자와 금액을 확인하세요.");
        }
        long pot = com.ssafy.ontop.game.domain.GameAmounts.validate(bet, results.size());
        int winners = (int) results.stream().filter(result -> result == Result.WIN).count();
        if (winners == 0) {
            if (results.stream().anyMatch(result -> result != Result.DRAW)) {
                throw new IllegalArgumentException("승자 없는 종료는 별도 무효 처리가 필요합니다.");
            }
            return new GameSettlementCalculation(0, 0, true,
                    results.stream().map(result -> new Award(0, 0)).toList());
        }
        if (results.contains(Result.DRAW)) { throw new IllegalArgumentException("승패 판정을 확인하세요."); }
        long bonus = (winners - pot % winners) % winners;
        long payout = Math.addExact(pot, bonus) / winners;
        long quotient = pot / winners;
        long remainder = pot % winners;
        int winnerIndex = 0;
        List<Award> awards = new ArrayList<>();
        for (Result result : results) {
            if (result == Result.WIN) {
                long potShare = quotient + (winnerIndex++ < remainder ? 1 : 0);
                awards.add(new Award(Math.subtractExact(potShare, bet), payout - potShare));
            } else {
                awards.add(new Award(-bet, 0));
            }
        }
        return new GameSettlementCalculation(bonus, payout, false, awards);
    }

    public record Award(long potDelta, long bonus) {
        public long netDelta() { return Math.addExact(potDelta, bonus); }
    }
}
