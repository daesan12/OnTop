package com.ssafy.ontop.raffle.domain;

import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RaffleSaleWindowTests {
    @Test
    void 월요일_자정부터_오전_아홉시_전까지는_판매_예정이다() {
        RaffleSaleWindow window = RaffleSaleWindow.at(Instant.parse("2026-11-01T15:00:00Z"));

        assertThat(window.weekStartDate()).isEqualTo(LocalDate.of(2026, 11, 2));
        assertThat(window.salesStartsAt()).isEqualTo(Instant.parse("2026-11-02T00:00:00Z"));
        assertThat(window.salesEndsAt()).isEqualTo(Instant.parse("2026-11-08T15:00:00Z"));
        assertThat(window.salesStatus()).isEqualTo("SCHEDULED");
        assertThat(window.isOpenAt(Instant.parse("2026-11-01T23:59:59.999Z"))).isFalse();
    }

    @Test
    void 월요일_오전_아홉시부터_다음_월요일_자정_직전까지_판매한다() {
        RaffleSaleWindow window = RaffleSaleWindow.at(Instant.parse("2026-11-02T00:00:00Z"));

        assertThat(window.salesStatus()).isEqualTo("OPEN");
        assertThat(window.isOpenAt(window.salesStartsAt())).isTrue();
        assertThat(window.isOpenAt(window.salesEndsAt().minusMillis(1))).isTrue();
        assertThat(window.isOpenAt(window.salesEndsAt())).isFalse();
    }

    @Test
    void 지정한_종료_시각이_지나면_판매_종료_상태다() {
        RaffleSaleWindow window = RaffleSaleWindow.forPeriod(LocalDate.of(2026, 11, 9),
                Instant.parse("2026-11-09T00:00:00Z"), Instant.parse("2026-11-18T15:00:00Z"),
                Instant.parse("2026-11-18T15:00:00Z"));

        assertThat(window.salesStatus()).isEqualTo("CLOSED");
        assertThat(window.isOpenAt(Instant.parse("2026-11-18T14:59:59.999Z"))).isTrue();
        assertThat(window.isOpenAt(Instant.parse("2026-11-18T15:00:00Z"))).isFalse();
    }
}
