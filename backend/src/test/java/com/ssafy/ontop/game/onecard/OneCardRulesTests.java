package com.ssafy.ontop.game.onecard;

import com.ssafy.ontop.game.onecard.domain.OneCard;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class OneCardRulesTests {
    @Test
    void 표준54장과_초기바닥_공격장수를확인한다() {
        var deck = OneCard.deck();
        assertThat(deck).hasSize(54).doesNotHaveDuplicates();
        assertThat(deck.stream().filter(OneCard::initial)).hasSize(24);
        assertThat(card("hearts-2").attack()).isEqualTo(2);
        assertThat(card("hearts-A").attack()).isEqualTo(3);
        assertThat(card("spades-A").attack()).isEqualTo(5);
        assertThat(card("joker-black").attack()).isEqualTo(5);
        assertThat(card("joker-color").attack()).isEqualTo(7);
    }

    @Test
    void 모든카드의_공격대응표를검증한다() {
        assertResponses("hearts-2",List.of("hearts-3","hearts-A","hearts-2","diamonds-2","clubs-2","spades-2","joker-black","joker-color"));
        assertResponses("hearts-A",List.of("hearts-A","diamonds-A","clubs-A","spades-A","joker-black","joker-color"));
        assertResponses("spades-A",List.of("joker-black","joker-color"));
        assertResponses("joker-black",List.of("joker-color"));
        assertResponses("joker-color",List.of());
        assertThat(card("spades-9").canPlay(card("hearts-9"),"hearts",0,null)).isTrue();
        assertThat(card("hearts-4").canPlay(card("hearts-9"),"hearts",0,null)).isTrue();
        assertThat(card("clubs-4").canPlay(card("hearts-9"),"hearts",0,null)).isFalse();
    }
    private void assertResponses(String previous,List<String> expected) {
        for (OneCard card : OneCard.deck()) {
            assertThat(card.canPlay(card(previous),"clubs",20,card(previous))).as(previous+" <- "+card.id())
                    .isEqualTo(expected.contains(card.id()));
        }
    }
    static OneCard card(String id) { return OneCard.deck().stream().filter(card -> card.id().equals(id)).findFirst().orElseThrow(); }
}
