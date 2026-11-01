package com.ssafy.ontop.game.omok;

import com.ssafy.ontop.game.omok.service.OmokForfeitDirection;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OmokForfeitDirectionTests {
    @Test
    void 남쪽과_북쪽의_기권자는_서로_반대편_상대에게_던진다() {
        assertThat(OmokForfeitDirection.towardOpponent(1, 2)).isEqualTo(Math.PI);
        assertThat(OmokForfeitDirection.towardOpponent(2, 1)).isZero();
    }

    @Test
    void 서쪽과_동쪽_좌석도_상대쪽으로_던진다() {
        assertThat(OmokForfeitDirection.towardOpponent(3, 4)).isEqualTo(Math.PI / 2);
        assertThat(OmokForfeitDirection.towardOpponent(4, 3)).isEqualTo(-Math.PI / 2);
    }

    @Test
    void 같은_좌석과_잘못된_좌석은_허용하지_않는다() {
        assertThatThrownBy(() -> OmokForfeitDirection.towardOpponent(1, 1))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> OmokForfeitDirection.towardOpponent(0, 2))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
