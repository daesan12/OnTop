package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.domain.GameAmounts;
import com.ssafy.ontop.game.result.GameFinished.Result;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import static org.assertj.core.api.Assertions.*;

class GameSettlementCalculationTests {
    @ParameterizedTest @ValueSource(longs = {1, 2, 5, 10, 100, 2_251_799_813_685_247L})
    void 모든_인원과_공동승리에서_판돈과_보너스가_한번만_계상된다(long bet) {
        for (int count = 2; count <= 4; count++) {
            for (int winners = 1; winners <= count; winners++) {
                List<Result> results = new ArrayList<>();
                for (int i = 0; i < count; i++) { results.add(i < winners ? Result.WIN : Result.FORFEIT); }
                var calculation = GameSettlementCalculation.calculate(bet, results);
                long pot = Math.multiplyExact(bet, count);
                long bonus = (winners - pot % winners) % winners;
                assertThat(calculation.bonus()).isEqualTo(bonus);
                assertThat(calculation.awards().stream().mapToLong(GameSettlementCalculation.Award::netDelta).sum()).isEqualTo(bonus);
                assertThat(calculation.awards().stream().mapToLong(GameSettlementCalculation.Award::potDelta).sum()).isZero();
                for (int i = 0; i < count; i++) {
                    assertThat(calculation.awards().get(i).netDelta())
                            .isEqualTo(i < winners ? (pot + bonus) / winners - bet : -bet);
                }
            }
        }
    }

    @Test void 다섯코인_세명_두승자의_순변화와_보너스_출처를_분리한다() {
        var result = GameSettlementCalculation.calculate(5, List.of(Result.WIN, Result.WIN, Result.LOSE));
        assertThat(result.payoutPerWinner()).isEqualTo(8);
        assertThat(result.awards()).containsExactly(new GameSettlementCalculation.Award(3, 0),
                new GameSettlementCalculation.Award(2, 1), new GameSettlementCalculation.Award(-5, 0));
    }

    @Test void 무승부는_예약만_해제하고_전원공동승리는_순변화가_없다() {
        assertThat(GameSettlementCalculation.calculate(30, List.of(Result.DRAW, Result.DRAW)).release()).isTrue();
        assertThat(GameSettlementCalculation.calculate(30, List.of(Result.WIN, Result.WIN)).awards())
                .allSatisfy(award -> assertThat(award.netDelta()).isZero());
    }

    @Test void 전원기권과_혼합무승부와_null판정을_정산하지_않는다() {
        assertThatThrownBy(() -> GameSettlementCalculation.calculate(5, List.of(Result.FORFEIT, Result.FORFEIT))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> GameSettlementCalculation.calculate(5, List.of(Result.WIN, Result.DRAW))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> GameSettlementCalculation.calculate(5, java.util.Arrays.asList(Result.WIN, null))).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest @ValueSource(ints = {2, 3, 4})
    void 실제인원별_최대안전금액과_바로다음값을_검증한다(int count) {
        long largest = GameAmounts.MAX_SAFE_INTEGER / count;
        assertThat(GameAmounts.validate(largest, count)).isEqualTo(largest * count);
        assertThatThrownBy(() -> GameAmounts.validate(largest + 1, count)).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest @ValueSource(longs = {0, -1, Long.MIN_VALUE, Long.MAX_VALUE, 9_007_199_254_740_992L})
    void 잘못된금액과_long오버플로입력을_예약전에_거절한다(long bet) {
        assertThatThrownBy(() -> GameAmounts.validate(bet, 4)).isInstanceOf(IllegalArgumentException.class);
    }
}
