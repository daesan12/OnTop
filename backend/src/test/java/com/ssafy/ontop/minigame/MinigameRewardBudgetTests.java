package com.ssafy.ontop.minigame;

import com.ssafy.ontop.minigame.service.MinigameRewardBudget;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class MinigameRewardBudgetTests {
    @ParameterizedTest
    @ValueSource(longs = {0, 998, 1000, 1001, 1_000_000, Long.MAX_VALUE})
    void 일일_누계와_관계없이_계산된_보상을_전액_지급한다(long earned) {
        assertThat(MinigameRewardBudget.grant(250, earned)).isEqualTo(250);
        assertThat(MinigameRewardBudget.grant(0, earned)).isZero();
        assertThat(MinigameRewardBudget.grant(-1, earned)).isZero();
        assertThat(MinigameRewardBudget.DAILY_CAP).isZero();
    }
}
