package com.ssafy.ontop.game.stonerumble.domain;

import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StoneRumbleRewardsTests {
    @ParameterizedTest
    @ValueSource(ints = {2, 3, 4, 5, 6, 7, 8})
    void 인원별로_일등부터_꼴찌까지_십냥씩_차등지급한다(int count) {
        var rewards = StoneRumbleRewards.fromRanks(IntStream.rangeClosed(1, count).boxed().toList());
        assertThat(rewards.getFirst()).isEqualTo(count * 10L);
        assertThat(rewards.getLast()).isEqualTo(10);
        assertThat(rewards.stream().mapToLong(Long::longValue).sum()).isEqualTo(count * (count + 1L) * 5);
    }

    @Test
    void 공동순위가_차지한_보상은_평균하며_총액을_늘리지_않는다() {
        assertThat(StoneRumbleRewards.fromRanks(List.of(1, 1))).containsExactly(15L, 15L);
        assertThat(StoneRumbleRewards.fromRanks(List.of(1, 2, 3, 4, 5, 6, 7, 7)))
                .containsExactly(80L, 70L, 60L, 50L, 40L, 30L, 15L, 15L);
        assertThatThrownBy(() -> StoneRumbleRewards.fromRanks(List.of(1, 1, 2)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 기권도_탈락시각을_따라_순위를_받고_동시기권은_평균한다() {
        var users = IntStream.rangeClosed(1, 8).mapToObj(n -> n * 101L).toList();
        var match = new StoneRumbleMatch(users, 0);
        match.depart("101", 100);
        match.depart("202", 100);
        for (int i = 2; i < 7; i++) { match.depart(Long.toString(users.get(i)), i * 100L); }

        var players = match.snapshot().players();
        assertThat(players.getFirst().forfeited()).isTrue();
        assertThat(players.getFirst().rank()).isEqualTo(7);
        assertThat(players.getFirst().rewardCoins()).isEqualTo(15);
        assertThat(players.getLast().rank()).isEqualTo(1);
        assertThat(players.getLast().rewardCoins()).isEqualTo(80);
        assertThat(players.stream().mapToLong(StoneRumbleMatch.PlayerView::rewardCoins).sum()).isEqualTo(360);
    }
}
