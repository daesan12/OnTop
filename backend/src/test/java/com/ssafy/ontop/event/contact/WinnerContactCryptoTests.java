package com.ssafy.ontop.event.contact;

import java.time.LocalDate;
import java.util.Base64;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class WinnerContactCryptoTests {
    private static final LocalDate WEEK = LocalDate.of(2026, 11, 2);
    private static final String KEY_ONE = Base64.getEncoder().encodeToString(new byte[32]);
    private static final String KEY_TWO = Base64.getEncoder().encodeToString(
            new byte[] {1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
                    1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1});

    @Test
    void 매번_새_nonce를_사용하고_회원_주차에_암호문을_결합한다() {
        var crypto = new WinnerContactCrypto("first", "first=" + KEY_ONE);
        byte[] first = crypto.encrypt(7, WEEK, "01012345678");
        byte[] second = crypto.encrypt(7, WEEK, "01012345678");

        assertThat(first).isNotEqualTo(second);
        assertThat(new String(first, java.nio.charset.StandardCharsets.ISO_8859_1))
                .doesNotContain("01012345678");
        assertThat(crypto.decrypt(7, WEEK, "first", first)).isEqualTo("01012345678");
        assertThatThrownBy(() -> crypto.decrypt(8, WEEK, "first", first))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> crypto.decrypt(7, WEEK.plusWeeks(1), "first", first))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 이전_키를_보유한_상태에서_활성_키를_교체할_수_있다() {
        var old = new WinnerContactCrypto("first", "first=" + KEY_ONE);
        var rotated = new WinnerContactCrypto("second", "first=" + KEY_ONE + ",second=" + KEY_TWO);

        assertThat(rotated.decrypt(7, WEEK, "first", old.encrypt(7, WEEK, "01012345678")))
                .isEqualTo("01012345678");
        assertThat(rotated.activeKeyId()).isEqualTo("second");
        assertThatThrownBy(() -> new WinnerContactCrypto("second", "first=" + KEY_ONE))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
