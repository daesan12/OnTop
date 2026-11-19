package com.ssafy.ontop.raffle.config;

import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RaffleConfigurationTests {
    private final RaffleConfiguration configuration = new RaffleConfiguration();

    @Test
    void 재정의_값이_없으면_기본_주간_정책을_사용한다() {
        var selection = configuration.raffleSaleWindowPolicy("", "", "")
                .select(Instant.parse("2026-11-16T04:00:00Z"));

        assertThat(selection.overridden()).isFalse();
        assertThat(selection.window().weekStartDate()).isEqualTo(LocalDate.of(2026, 11, 16));
    }

    @Test
    void 재정의_값은_세_개를_모두_설정해야_한다() {
        assertThatThrownBy(() -> configuration.raffleSaleWindowPolicy(
                "2026-11-09", "2026-11-09T09:00:00+09:00", ""))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 오프셋이_포함된_운영_시각을_정확한_인스턴트로_변환한다() {
        var selection = configuration.raffleSaleWindowPolicy(
                        "2026-11-09", "2026-11-09T09:00:00+09:00", "2026-11-19T00:00:00+09:00")
                .select(Instant.parse("2026-11-16T04:00:00Z"));

        assertThat(selection.window().salesStartsAt()).isEqualTo(Instant.parse("2026-11-09T00:00:00Z"));
        assertThat(selection.window().salesEndsAt()).isEqualTo(Instant.parse("2026-11-18T15:00:00Z"));
    }
}
