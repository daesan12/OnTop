package com.ssafy.ontop.game.ledger;

import com.ssafy.ontop.game.ledger.domain.DiceLedgerScoring;
import com.ssafy.ontop.game.ledger.domain.DiceLedgerScoring.Category;
import org.junit.jupiter.api.Test;
import static com.ssafy.ontop.game.ledger.domain.DiceLedgerScoring.Category.*;
import static org.assertj.core.api.Assertions.*;

class DiceLedgerScoringTests {
    @Test
    void 위칸은해당눈의합이고_보너스는63점이상35점이다() {
        assertThat(score(ONES, 1,1,1,2,3)).isEqualTo(3);
        assertThat(score(FIVES, 5,5,5,5,2)).isEqualTo(20);
        assertThat(score(SIXES, 1,2,3,4,5)).isZero();
        assertThat(DiceLedgerScoring.upperBonus(62)).isZero();
        assertThat(DiceLedgerScoring.upperBonus(63)).isEqualTo(35);
    }

    @Test
    void 포카드는같은눈네개의합만센다() {
        assertThat(score(FOUR_OF_A_KIND, 6,6,6,6,5)).isEqualTo(24);
        assertThat(score(FOUR_OF_A_KIND, 2,2,2,2,2)).isEqualTo(8);
        assertThat(score(FOUR_OF_A_KIND, 3,3,3,5,5)).isZero();
    }

    @Test
    void 풀하우스는같은눈다섯개도인정하고_다섯개합이다() {
        assertThat(score(FULL_HOUSE, 6,6,6,5,5)).isEqualTo(28);
        assertThat(score(FULL_HOUSE, 6,6,6,6,6)).isEqualTo(30);
        assertThat(score(FULL_HOUSE, 6,6,6,6,5)).isZero();
        assertThat(score(FULL_HOUSE, 1,1,2,2,3)).isZero();
    }

    @Test
    void 스트레이트_자유_장원() {
        assertThat(score(SMALL_STRAIGHT, 1,2,3,4,6)).isEqualTo(15);
        assertThat(score(SMALL_STRAIGHT, 3,4,5,6,6)).isEqualTo(15);
        assertThat(score(SMALL_STRAIGHT, 1,2,3,5,6)).isZero();
        assertThat(score(SMALL_STRAIGHT, 2,3,4,5,6)).isEqualTo(15);
        assertThat(score(LARGE_STRAIGHT, 1,2,3,4,5)).isEqualTo(30);
        assertThat(score(LARGE_STRAIGHT, 6,5,4,3,2)).isEqualTo(30);
        assertThat(score(LARGE_STRAIGHT, 1,2,3,4,6)).isZero();
        assertThat(score(CHOICE, 6,6,5,5,4)).isEqualTo(26);
        assertThat(score(FIVE_OF_A_KIND, 4,4,4,4,4)).isEqualTo(50);
        assertThat(score(FIVE_OF_A_KIND, 4,4,4,4,3)).isZero();
    }

    @Test
    void 주사위다섯개와눈범위를검사한다() {
        assertThatIllegalArgumentException().isThrownBy(() -> score(CHOICE, 1,2,3,4));
        assertThatIllegalArgumentException().isThrownBy(() -> score(CHOICE, 1,2,3,4,7));
        assertThat(Category.find("FULL_HOUSE")).isEqualTo(FULL_HOUSE);
        assertThat(Category.find("YACHT")).isNull();
    }

    private int score(Category category, int... faces) { return DiceLedgerScoring.score(category, faces); }
}
