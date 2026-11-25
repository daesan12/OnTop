package com.ssafy.ontop.game.stonerumble.domain;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.data.Offset.offset;

class StonePigeonCollisionTests {
    @Test
    void 몸통과_양끝_구체에서_첫_접촉을_구하고_선분_밖이나_뒤쪽은_맞히지_않는다() {
        assertThat(hit(-2, 1, 0, 4, 0, 0)).isCloseTo(.375, offset(1e-9));
        assertThat(hit(-2, 2, 0, 4, 0, 0)).isCloseTo(.375, offset(1e-9));
        assertThat(hit(0, 4, 0, 0, -4, 0)).isCloseTo(.375, offset(1e-9));
        assertThat(hit(-2, 1, 0, -4, 0, 0)).isInfinite();
        assertThat(hit(-2, 1, .51, 4, 0, 0)).isInfinite();
        assertThat(hit(-2, 1, 0, 1, 0, 0)).isInfinite();
    }

    @Test
    void 시작부터_겹치거나_정지한_상대_이동선분도_영으로_나누지_않고_처리한다() {
        assertThat(hit(.1, 1, 0, 0, 0, 0)).isZero();
        assertThat(hit(2, 1, 0, 0, 0, 0)).isInfinite();
        assertThat(StonePigeonCollision.contact(-2, 0, 0, 4, 0, 0, 0, 0, 0, 0, 0, 0, .5))
                .isCloseTo(.375, offset(1e-9));
    }

    private double hit(double x, double y, double z, double dx, double dy, double dz) {
        return StonePigeonCollision.contact(x, y, z, dx, dy, dz, 0, 0, 0, 0, 2, 0, .5);
    }
}
