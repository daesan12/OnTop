package com.ssafy.ontop.game.farkle;

import com.ssafy.ontop.game.farkle.domain.FarkleScoring;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class FarkleScoringTests {
    @Test
    void 모든점수표와_혼합조합을_계산한다() {
        assertThat(FarkleScoring.score(1)).isEqualTo(100);
        assertThat(FarkleScoring.score(5)).isEqualTo(50);
        for (int face = 1; face <= 6; face++) {
            for (int count = 3; count <= 6; count++) {
                int[] dice = new int[count];
                Arrays.fill(dice, face);
                assertThat(FarkleScoring.score(dice)).isEqualTo((face == 1 ? 1000 : face * 100) << (count - 3));
            }
        }
        assertThat(FarkleScoring.score(1,2,3,4,5)).isEqualTo(500);
        assertThat(FarkleScoring.score(2,3,4,5,6)).isEqualTo(750);
        assertThat(FarkleScoring.score(1,2,3,4,5,6)).isEqualTo(1500);
        assertThat(FarkleScoring.score(3,3,3,1,5)).isEqualTo(450);
        assertThat(FarkleScoring.score(1,2,3,4,5,5)).isEqualTo(550);
        assertThat(FarkleScoring.score(2,3,4,5,6,1)).isEqualTo(1500);
        assertThat(FarkleScoring.score(2,2,3,3,6,6)).isEqualTo(-1);
        assertThat(FarkleScoring.score(3,3,3,1,5,2)).isEqualTo(-1);
        assertThat(FarkleScoring.hasScore(3,3,3,2,4,6)).isTrue();
        assertThat(FarkleScoring.hasScore(2,2,3,3,6,6)).isFalse();
    }

    @Test
    void 전체눈조합에서_순서불변과_득점가능성의_일치를확인한다() {
        // 6^6=46,656개: 입력 순서로 점수가 바뀌거나 불가능한 선택이 득점하지 않는지 확인.
        for (int encoding = 0; encoding < 46656; encoding++) {
            int[] dice = new int[6];
            int value = encoding;
            for (int index = 0; index < 6; index++) { dice[index] = value % 6 + 1; value /= 6; }
            int score = FarkleScoring.score(dice);
            int[] sorted = dice.clone();
            Arrays.sort(sorted);
            assertThat(FarkleScoring.score(sorted)).isEqualTo(score);
            if (score > 0) { assertThat(FarkleScoring.hasScore(dice)).isTrue(); }
        }
        assertThatIllegalArgumentException().isThrownBy(() -> FarkleScoring.score(0));
        assertThatIllegalArgumentException().isThrownBy(() -> FarkleScoring.score(1,1,1,1,1,1,1));
    }
}
