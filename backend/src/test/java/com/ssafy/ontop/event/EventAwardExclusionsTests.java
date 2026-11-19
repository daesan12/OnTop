package com.ssafy.ontop.event;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class EventAwardExclusionsTests {
    @Test
    void 빈_값과_쉼표_목록을_안전하게_해석한다() {
        assertThat(EventAwardExclusions.parse(null)).isEmpty();
        assertThat(EventAwardExclusions.parse("  ")).isEmpty();
        assertThat(EventAwardExclusions.parse("7, 3,7")).containsExactlyInAnyOrder(3L, 7L);
    }

    @Test
    void 양수가_아닌_ID와_잘못된_형식을_거부한다() {
        assertThatThrownBy(() -> EventAwardExclusions.parse("1,0"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> EventAwardExclusions.parse("1,user"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
