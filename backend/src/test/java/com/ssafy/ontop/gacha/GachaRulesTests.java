package com.ssafy.ontop.gacha;

import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class GachaRulesTests {
    @Test void every_remaining_slot_has_exactly_one_outcome() {
        int[] hits=new int[5];
        for(int choice=0;choice<30;choice++) {
            final int slot=choice; hits[GachaRules.select(GachaRules.initial(),bound->{ assertThat(bound).isEqualTo(30); return slot; })]++;
        }
        assertThat(hits).containsExactly(1,2,4,8,15);
    }
    @Test void depleted_rewards_are_not_selected_and_last_first_prize_is_certain() {
        assertThat(GachaRules.select(new int[]{1,0,0,0,0},bound->{assertThat(bound).isEqualTo(1);return 0;})).isZero();
        int[] hits=new int[5];
        for(int i=0;i<3;i++) { final int slot=i; hits[GachaRules.select(new int[]{1,0,0,0,2},b->slot)]++; }
        assertThat(hits).containsExactly(1,0,0,0,2);
    }
    @Test void values_are_per_product_and_duplicate_cash_is_half() {
        assertThat(java.util.stream.IntStream.rangeClosed(1,4).mapToLong(GachaRules::value).toArray()).containsExactly(1000,500,250,100);
        assertThat(GachaRules.value(3)/2).isEqualTo(125);
        int[] mutable=GachaRules.initial(); mutable[0]=0;
        assertThat(GachaRules.initial()[0]).isEqualTo(1);
    }
    @Test void malformed_pools_and_rng_bounds_are_rejected() {
        assertThatThrownBy(()->GachaRules.select(new int[]{0,0,0,0,0},b->0)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(()->GachaRules.select(new int[]{1,-1,0,0,0},b->0)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->GachaRules.select(GachaRules.initial(),b->b)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(()->GachaRules.value(5)).isInstanceOf(GachaException.class);
    }
}
