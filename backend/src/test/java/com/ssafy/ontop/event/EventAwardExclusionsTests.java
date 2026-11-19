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

    @Test
    void 게임별_제외_목록을_게임_코드별로_분리한다() {
        assertThat(EventAwardExclusions.parseByGame(null)).isEmpty();
        assertThat(EventAwardExclusions.parseByGame("MG_MOLE:245, 61;MG_SPEED_MOLE:271"))
                .containsEntry("MG_MOLE", java.util.Set.of(245L, 61L))
                .containsEntry("MG_SPEED_MOLE", java.util.Set.of(271L));
    }

    @Test
    void 게임별_제외_목록의_중복_코드와_잘못된_ID를_거부한다() {
        assertThatThrownBy(() -> EventAwardExclusions.parseByGame("MG_MOLE:1;MG_MOLE:2"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> EventAwardExclusions.parseByGame("MG_MOLE:user"))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> EventAwardExclusions.parseByGame("mole:1"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
