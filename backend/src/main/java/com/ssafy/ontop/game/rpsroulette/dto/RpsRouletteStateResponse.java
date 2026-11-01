package com.ssafy.ontop.game.rpsroulette.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

/** 상태 조회와 모든 행동의 공통 응답. round는 회원의 가장 최근 판이며 없으면 null이다. */
@Schema(requiredProperties = {"serverNow", "availableBalance", "playedToday", "rules"})
public record RpsRouletteStateResponse(Instant serverNow, long availableBalance, int playedToday, Rules rules,
        Round round) {

    @Schema(name = "RpsRouletteRules", requiredProperties = {"fees", "dailyPlays", "multipliers", "roulette",
            "duelLimitMs", "decideLimitMs", "graceMs"})
    public record Rules(List<Integer> fees, int dailyPlays, List<Double> multipliers, List<Integer> roulette,
            long duelLimitMs, long decideLimitMs, long graceMs) {
    }

    @Schema(name = "RpsRouletteRound", requiredProperties = {"id", "fee", "phase", "seq", "stakeLevel", "multiplier",
            "challenging", "duelNo", "payout", "startedAt"})
    public record Round(String id, int fee,
            @Schema(allowableValues = {"DUEL", "DECIDE", "SETTLED"}) String phase,
            int seq, int stakeLevel, double multiplier, boolean challenging, int duelNo,
            @Schema(description = "DUEL 단계의 기계 손 SHA-256 커밋") String commitment,
            Instant inputEndsAt, Instant deadlineAt, LastDuel lastDuel,
            @Schema(allowableValues = {"LOST", "PAID"}) String outcome,
            Integer rouletteCell, Integer rouletteValue, int payout, Instant startedAt, Instant settledAt) {
    }

    /** 공개된 직전 대결. salt로 직전 commitment를 다시 계산할 수 있다. */
    @Schema(name = "RpsRouletteLastDuel",
            requiredProperties = {"duelNo", "playerHand", "machineHand", "salt", "result", "auto"})
    public record LastDuel(int duelNo, String playerHand, String machineHand, String salt,
            @Schema(allowableValues = {"WIN", "DRAW", "LOSE"}) String result, boolean auto) {
    }
}
