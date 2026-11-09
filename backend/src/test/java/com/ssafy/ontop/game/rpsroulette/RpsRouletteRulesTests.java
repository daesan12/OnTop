package com.ssafy.ontop.game.rpsroulette;

import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRules;
import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRules.Hand;
import com.ssafy.ontop.game.rpsroulette.domain.RpsRouletteRules.Result;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RpsRouletteRulesTests {

    @Test
    void 룰렛은_30칸이고_1이_15칸이며_최대_10배다() {
        var cells = RpsRouletteRules.ROULETTE;

        long ones = cells.stream().filter(cell -> cell == 1).count();
        int sum = cells.stream().mapToInt(Integer::intValue).sum();

        assertThat(cells).hasSize(30);
        assertThat(ones).isEqualTo(15);
        assertThat(sum).isEqualTo(68);
        assertThat(cells.stream().mapToInt(Integer::intValue).max().orElseThrow()).isEqualTo(10);
    }

    @Test
    void 바위는_가위를_가위는_보를_보는_바위를_이긴다() {
        assertThat(RpsRouletteRules.judge(Hand.ROCK, Hand.SCISSORS)).isEqualTo(Result.WIN);
        assertThat(RpsRouletteRules.judge(Hand.SCISSORS, Hand.PAPER)).isEqualTo(Result.WIN);
        assertThat(RpsRouletteRules.judge(Hand.PAPER, Hand.ROCK)).isEqualTo(Result.WIN);
        assertThat(RpsRouletteRules.judge(Hand.ROCK, Hand.PAPER)).isEqualTo(Result.LOSE);
        assertThat(RpsRouletteRules.judge(Hand.PAPER, Hand.PAPER)).isEqualTo(Result.DRAW);
    }

    @Test
    void 지급액은_참가비_칸_배수의_곱이고_최대_1200냥이다() {
        int tenCell = RpsRouletteRules.ROULETTE.indexOf(10);
        int sevenCell = RpsRouletteRules.ROULETTE.indexOf(7);

        assertThat(RpsRouletteRules.payout(30, 2, tenCell)).isEqualTo(1200);
        assertThat(RpsRouletteRules.payout(10, 1, sevenCell)).isEqualTo(140);
        assertThat(RpsRouletteRules.payout(20, 0, 1)).isEqualTo(20);
    }

    @Test
    void 커밋은_같은_입력이면_같고_손이_다르면_다르다() {
        String salt = "00112233445566778899aabbccddeeff";

        String rock = RpsRouletteRules.commitment(1, Hand.ROCK, salt);

        assertThat(rock).hasSize(64).isEqualTo(RpsRouletteRules.commitment(1, Hand.ROCK, salt));
        assertThat(rock).isNotEqualTo(RpsRouletteRules.commitment(1, Hand.PAPER, salt));
        assertThat(rock).isNotEqualTo(RpsRouletteRules.commitment(2, Hand.ROCK, salt));
    }
}
