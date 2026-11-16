package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameFinished.Result;
import java.util.ArrayList;
import java.util.List;

/** 참가 순서가 고정된 정수 정산. 원래 판돈과 서버 발행 보너스를 중복 없이 분리한다. */
public record GameSettlementCalculation(long bonus, long payoutPerWinner, boolean release, List<Award> awards) {
    public GameSettlementCalculation { awards = List.copyOf(awards); }

    public static GameSettlementCalculation refund(int participantCount) {
        if (participantCount < 2 || participantCount > 8) {
            throw new IllegalArgumentException("반환 참가자 수를 확인하세요.");
        }
        return new GameSettlementCalculation(0, 0, true,
                java.util.Collections.nCopies(participantCount, new Award(0, 0)));
    }

    public static GameSettlementCalculation calculate(long bet, List<Result> results) {
        if (bet < 0 || results.size() < 2 || results.size() > 8 || results.stream().anyMatch(java.util.Objects::isNull)) {
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

    public static GameSettlementCalculation stoneRumble(long bet, List<Result> results, List<Integer> ranks) {
        if (results.size() != ranks.size() || results.stream().anyMatch(java.util.Objects::isNull)) {
            throw new IllegalArgumentException("돌탑 정산 순위를 확인하세요.");
        }
        var rewards = com.ssafy.ontop.game.stonerumble.domain.StoneRumbleRewards.fromRanks(ranks);
        com.ssafy.ontop.game.domain.GameAmounts.validate(bet, results.size());
        var pot = results.stream().noneMatch(r -> r == Result.WIN)
                && results.stream().allMatch(r -> r == Result.DRAW || r == Result.FORFEIT)
                ? refund(results.size()) : calculate(bet, results);
        List<Award> awards = new ArrayList<>();
        for (int index = 0; index < results.size(); index++) {
            var original = pot.awards().get(index);
            var award = new Award(original.potDelta(), Math.addExact(original.bonus(), rewards.get(index)));
            if (Math.abs(award.netDelta()) > 9_007_199_254_740_991L) {
                throw new IllegalArgumentException("돌탑 정산 금액의 안전 범위를 확인하세요.");
            }
            awards.add(award);
        }
        return new GameSettlementCalculation(Math.addExact(pot.bonus(), rewards.stream().mapToLong(Long::longValue).sum()),
                pot.payoutPerWinner(), pot.release(), awards);
    }
}
