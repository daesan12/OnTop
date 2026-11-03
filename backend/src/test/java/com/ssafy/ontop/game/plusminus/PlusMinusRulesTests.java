package com.ssafy.ontop.game.plusminus;

import com.ssafy.ontop.game.plusminus.domain.PlusMinusRules;
import com.ssafy.ontop.game.plusminus.domain.PlusMinusRules.Outcome;
import java.util.Collections;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PlusMinusRulesTests {

    @Test
    void 릴은_16칸_8칸_16칸이고_JACKPOT은_숫자2에_한_칸이다() {
        var first = PlusMinusRules.FIRST_REEL;
        var second = PlusMinusRules.SECOND_REEL;

        assertThat(first).hasSize(16);
        assertThat(PlusMinusRules.OPERATOR_REEL).hasSize(8);
        assertThat(Collections.frequency(PlusMinusRules.OPERATOR_REEL, "+")).isEqualTo(4);
        assertThat(second).hasSize(16);
        assertThat(Collections.frequency(second, PlusMinusRules.JACKPOT)).isEqualTo(1);
        assertThat(Collections.frequency(first, PlusMinusRules.JACKPOT_FIRST)).isEqualTo(1);
        assertThat(first.stream().mapToInt(Integer::intValue).sum()).isEqualTo(45);
    }

    @Test
    void 계산_결과가_1_이상이면_결과의_10배이고_0_이하면_꽝이다() {
        int seven = PlusMinusRules.FIRST_REEL.indexOf(7);
        int five = PlusMinusRules.SECOND_REEL.indexOf(5);
        int nine = PlusMinusRules.SECOND_REEL.indexOf(9);
        int zero = PlusMinusRules.FIRST_REEL.indexOf(0);

        assertThat(PlusMinusRules.payout(seven, 0, five)).isEqualTo(120);
        assertThat(PlusMinusRules.payout(seven, 1, five)).isEqualTo(20);
        assertThat(PlusMinusRules.outcome(seven, 1, nine)).isEqualTo(Outcome.LOST);
        assertThat(PlusMinusRules.result(seven, 1, nine)).isEqualTo(-2);
        assertThat(PlusMinusRules.payout(zero, 1, PlusMinusRules.SECOND_REEL.indexOf(0))).isZero();
    }

    @Test
    void JACKPOT은_숫자1이_7일_때만_500냥이고_나머지는_꽝이다() {
        int jackpot = PlusMinusRules.SECOND_REEL.indexOf(PlusMinusRules.JACKPOT);
        int seven = PlusMinusRules.FIRST_REEL.indexOf(7);
        int eight = PlusMinusRules.FIRST_REEL.indexOf(8);

        assertThat(PlusMinusRules.outcome(seven, 0, jackpot)).isEqualTo(Outcome.JACKPOT);
        assertThat(PlusMinusRules.payout(seven, 1, jackpot)).isEqualTo(500);
        assertThat(PlusMinusRules.result(seven, 1, jackpot)).isNull();
        assertThat(PlusMinusRules.outcome(eight, 0, jackpot)).isEqualTo(Outcome.LOST);
        assertThat(PlusMinusRules.payout(eight, 0, jackpot)).isZero();
    }

    @Test
    void 모든_칸_조합의_평균_지급은_35_7냥으로_회수율_119퍼센트다() {
        long total = 0;
        int jackpots = 0;
        int max = 0;
        for (int a = 0; a < 16; a++) {
            for (int o = 0; o < 8; o++) {
                for (int b = 0; b < 16; b++) {
                    int payout = PlusMinusRules.payout(a, o, b);
                    total += payout;
                    jackpots += PlusMinusRules.outcome(a, o, b) == Outcome.JACKPOT ? 1 : 0;
                    max = PlusMinusRules.outcome(a, o, b) == Outcome.PAID ? Math.max(max, payout) : max;
                }
            }
        }

        assertThat(total).isEqualTo(73_120);
        assertThat(total / 2048.0 / PlusMinusRules.FEE).isBetween(1.19, 1.191);
        assertThat(jackpots).isEqualTo(8);
        assertThat(max).isEqualTo(170);
    }
}
