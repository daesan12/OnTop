package com.ssafy.ontop.game.plusminus.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import java.time.Instant;
import java.util.List;

/** 상태 조회와 START의 공통 응답. round는 회원의 가장 최근 판이며 없으면 null이다. */
@Schema(requiredProperties = {"serverNow", "availableBalance", "playedToday", "rules"})
public record PlusMinusStateResponse(Instant serverNow, long availableBalance, int playedToday, Rules rules,
        Round round) {

    @Schema(name = "PlusMinusRules", requiredProperties = {"fee", "dailyPlays", "firstReel", "operatorReel",
            "secondReel", "pointPayout", "jackpotFirst", "jackpotPayout"})
    public record Rules(int fee, int dailyPlays, List<Integer> firstReel, List<String> operatorReel,
            @Schema(description = "-1은 JACKPOT 칸") List<Integer> secondReel, int pointPayout, int jackpotFirst,
            int jackpotPayout) {
    }

    @Schema(name = "PlusMinusRound", requiredProperties = {"id", "firstCell", "operatorCell", "secondCell", "first",
            "operator", "second", "outcome", "payout", "playedAt"})
    public record Round(String id, int firstCell, int operatorCell, int secondCell, int first,
            @Schema(allowableValues = {"+", "-"}) String operator,
            @Schema(description = "-1은 JACKPOT") int second,
            @Schema(description = "JACKPOT 칸이면 null") Integer result,
            @Schema(allowableValues = {"LOST", "PAID", "JACKPOT"}) String outcome, int payout, Instant playedAt) {
    }
}
