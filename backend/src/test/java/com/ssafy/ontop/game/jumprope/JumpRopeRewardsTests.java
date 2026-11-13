package com.ssafy.ontop.game.jumprope;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class JumpRopeRewardsTests {
    @ParameterizedTest
    @CsvSource({"49,0", "50,1", "250,5", "1000,20", "1965,39"})
    void converts_verified_full_time_score_to_whole_coins(int score, int coins) {
        var result = new JumpRopeRules.Result(score, 0, 0, 0, JumpRopeRules.EndReason.TIME, 60_000_000);
        assertThat(JumpRopeRewards.calculated(result)).isEqualTo(coins);
    }

    @Test void an_early_result_with_a_payable_score_is_not_eligible() {
        var result = JumpRopeRules.replay(JumpRopeRulesTests.perfectRound().subList(0, 10));
        assertThat(result.score()).isGreaterThan(50);
        assertThat(result.reason()).isEqualTo(JumpRopeRules.EndReason.MISS_LIMIT);
        assertThat(JumpRopeRewards.calculated(result)).isZero();
    }
}
