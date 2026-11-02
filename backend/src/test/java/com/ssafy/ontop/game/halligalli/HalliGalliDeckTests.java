package com.ssafy.ontop.game.halligalli;

import com.ssafy.ontop.game.halligalli.domain.FruitCard;
import com.ssafy.ontop.game.halligalli.domain.FruitType;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliDeck;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HalliGalliDeckTests {

    @Test
    void 기본_덱은_과일4종_56장이고_과일별_14장이다() {
        List<FruitCard> deck = HalliGalliDeck.standard();

        Map<FruitType, Long> byFruit = deck.stream()
                .collect(Collectors.groupingBy(FruitCard::fruit, Collectors.counting()));
        Map<Integer, Long> strawberryByCount = deck.stream().filter(card -> card.fruit() == FruitType.STRAWBERRY)
                .collect(Collectors.groupingBy(FruitCard::count, Collectors.counting()));

        assertThat(deck).hasSize(56);
        assertThat(deck).extracting(FruitCard::id).containsExactlyElementsOf(IntStream.range(0, 56).boxed().toList());
        assertThat(byFruit).containsOnlyKeys(FruitType.values()).allSatisfy((fruit, count) -> assertThat(count).isEqualTo(14));
        assertThat(strawberryByCount).containsExactlyInAnyOrderEntriesOf(Map.of(1, 5L, 2, 3L, 3, 3L, 4, 2L, 5, 1L));
    }

    @Test
    void 기본_덱은_외부에서_바꿀_수_없다() {
        List<FruitCard> deck = HalliGalliDeck.standard();

        assertThatThrownBy(() -> deck.add(new FruitCard(99, FruitType.LIME, 1)))
                .isInstanceOf(UnsupportedOperationException.class);
        assertThatThrownBy(() -> new FruitCard(0, FruitType.LIME, 6)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 같은_난수_시드면_같은_순서로_섞고_카드는_그대로다() {
        List<FruitCard> first = HalliGalliDeck.shuffled(new Random(7));

        List<FruitCard> second = HalliGalliDeck.shuffled(new Random(7));

        assertThat(first).isEqualTo(second).isNotEqualTo(HalliGalliDeck.standard());
        assertThat(first).containsExactlyInAnyOrderElementsOf(HalliGalliDeck.standard());
    }

    @Test
    void 인원별로_중복과_누락없이_나누고_남는_카드는_앞좌석이_받는다() {
        List<FruitCard> deck = HalliGalliDeck.shuffled(new Random(3));

        Map<Integer, List<List<FruitCard>>> hands = IntStream.rangeClosed(2, 4).boxed()
                .collect(Collectors.toMap(Function.identity(), players -> HalliGalliDeck.deal(deck, players)));

        assertThat(hands.get(2)).extracting(List::size).containsExactly(28, 28);
        assertThat(hands.get(3)).extracting(List::size).containsExactly(19, 19, 18);
        assertThat(hands.get(4)).extracting(List::size).containsExactly(14, 14, 14, 14);
        hands.values().forEach(dealt -> {
            List<FruitCard> all = new ArrayList<>();
            dealt.forEach(all::addAll);
            assertThat(all).doesNotHaveDuplicates().containsExactlyInAnyOrderElementsOf(deck);
        });
    }

    @Test
    void 추가_발행_카드는_기본_구성에서_고르고_새_번호를_받는다() {
        Random random = new Random(11);

        List<FruitCard> issued = IntStream.range(0, 40).mapToObj(sequence -> HalliGalliDeck.issue(sequence, random)).toList();

        assertThat(issued).extracting(FruitCard::id)
                .containsExactlyElementsOf(IntStream.range(56, 96).boxed().toList());
        assertThat(issued).extracting(FruitCard::fruit).contains(FruitType.values());
        assertThat(issued.stream().map(FruitCard::count).distinct().count()).isGreaterThan(1);
    }
}
