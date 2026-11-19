package com.ssafy.ontop.raffle.domain;

import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class RaffleSaleWindowPolicyTests {
    private final RaffleSaleWindowPolicy policy = RaffleSaleWindowPolicy.override(
            LocalDate.of(2026, 11, 9), Instant.parse("2026-11-09T00:00:00Z"),
            Instant.parse("2026-11-18T15:00:00Z"));

    @Test
    void 다음_주가_되어도_연장_회차를_계속_선택한다() {
        var selection = policy.select(Instant.parse("2026-11-16T04:00:00Z"));

        assertThat(selection.overridden()).isTrue();
        assertThat(selection.window().weekStartDate()).isEqualTo(LocalDate.of(2026, 11, 9));
        assertThat(selection.window().salesStatus()).isEqualTo("OPEN");
    }

    @Test
    void 연장_종료_뒤에도_그_주말까지_종료된_회차를_선택한다() {
        var selection = policy.select(Instant.parse("2026-11-20T00:00:00Z"));

        assertThat(selection.overridden()).isTrue();
        assertThat(selection.window().weekStartDate()).isEqualTo(LocalDate.of(2026, 11, 9));
        assertThat(selection.window().salesStatus()).isEqualTo("CLOSED");
    }

    @Test
    void 다음_월요일부터_기본_주간_판매_규칙으로_복귀한다() {
        var selection = policy.select(Instant.parse("2026-11-23T00:00:00Z"));

        assertThat(selection.overridden()).isFalse();
        assertThat(selection.window().weekStartDate()).isEqualTo(LocalDate.of(2026, 11, 23));
    }

    @Test
    void 기준_주차_밖에서_시작하는_기간은_거절한다() {
        assertThatThrownBy(() -> RaffleSaleWindowPolicy.override(LocalDate.of(2026, 11, 9),
                Instant.parse("2026-11-08T00:00:00Z"), Instant.parse("2026-11-18T15:00:00Z")))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
