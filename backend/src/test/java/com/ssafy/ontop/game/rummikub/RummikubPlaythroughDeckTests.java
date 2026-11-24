package com.ssafy.ontop.game.rummikub;

import com.ssafy.ontop.game.rummikub.domain.RummikubTile;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class RummikubPlaythroughDeckTests {
    @Test
    void 추첨_재배열과_무관하게_배분과_후반_더미를_재현한다() {
        var shuffle = new RummikubPlaythroughDeck();
        var deck = RummikubTile.deck();
        shuffle.accept(deck);
        assertThat(deck.getFirst().id()).isEqualTo("RED-13-1");
        shuffle.accept(deck);
        var first = java.util.List.copyOf(deck);
        assertThat(deck).hasSize(106).doesNotHaveDuplicates();
        assertThat(deck.getFirst().id()).isEqualTo("RED-10-0");
        assertThat(deck.getLast().id()).isEqualTo("JOKER-1");
        var remainder = RummikubTile.deck().stream().filter(tile -> !deck.subList(0, 28).contains(tile)).toList();
        assertThat(deck.subList(28, 106)).containsExactlyElementsOf(remainder);
        shuffle.accept(deck);
        shuffle.accept(deck);
        assertThat(deck).containsExactlyElementsOf(first);
    }
}
