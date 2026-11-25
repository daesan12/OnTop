package com.ssafy.ontop.game.stonerumble.domain;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StoneRumblePreparationTests {
    private final List<Long> users = List.of(101L, 202L, 303L, 404L, 505L, 606L, 707L, 808L);

    @Test
    void 마지막_참가자가_준비할때까지_낙하와_발판시간은_정지한다() {
        var match = new StoneRumbleMatch(users, 0);
        users.subList(0, 7).forEach(user -> match.sceneReady(Long.toString(user), true, 0));
        match.advance(20_000);

        assertThat(match.snapshot().phase()).isEqualTo("LOADING");
        assertThat(match.snapshot().readyUserIds()).hasSize(7);
        assertThat(match.snapshot().players()).allSatisfy(p -> assertThat(p.y()).isEqualTo(41));
        assertThat(match.snapshot().tiles()).noneMatch(StoneRumbleMatch.TileView::stepped);
        assertThatThrownBy(() -> match.control("101", 1, 0, 1, 0, true, true)).hasMessage("NOT_ACTIVE");
        assertThatThrownBy(() -> match.sceneReady("999", true, 20_000)).hasMessage("ACCESS_DENIED");

        match.sceneReady("808", true, 24_000);
        assertThat(match.snapshot().phase()).isEqualTo("DROPPING");
        assertThat(match.snapshot().landsAt()).isEqualTo(25_200);
        assertThat(match.snapshot().startsAt()).isEqualTo(28_200);
        match.advance(25_200);
        assertThat(match.snapshot().phase()).isEqualTo("COUNTDOWN");
        assertThat(match.snapshot().players()).allSatisfy(p -> assertThat(p.y()).isEqualTo(32));
        match.advance(28_200);
        assertThat(match.snapshot().phase()).isEqualTo("RUNNING");
    }

    @Test
    void 준비를_철회하면_다시_완료할때까지_기다린다() {
        var match = new StoneRumbleMatch(users.subList(0, 2), 0);
        match.sceneReady("101", true, 100);
        match.sceneReady("101", false, 200);
        match.sceneReady("202", true, 300);
        assertThat(match.snapshot().phase()).isEqualTo("LOADING");
        match.sceneReady("101", true, 400);
        match.sceneReady("101", true, 500);
        assertThat(match.snapshot().landsAt()).isEqualTo(1600);
    }

    @Test
    void 준비시간이_만료되면_무효로_끝나고_순위보상을_발행하지_않는다() {
        var match = new StoneRumbleMatch(users, 0);
        match.advance(StoneRumbleMatch.LOADING_TIMEOUT);
        assertThat(match.snapshot().endReason()).isEqualTo("LOADING_TIMEOUT");
        assertThat(match.snapshot().players()).allSatisfy(p -> {
            assertThat(p.rank()).isNull(); assertThat(p.rewardCoins()).isZero();
        });
    }

    @Test
    void 오래_기다려도_밟지_않은_경기층의_테두리는_자동으로_사라지지_않는다() {
        var match = new StoneRumbleMatch(users.subList(0, 2), 0);
        users.subList(0, 2).forEach(user -> match.sceneReady(Long.toString(user), true, 0));
        var players = (List<?>) ReflectionTestUtils.getField(match, "players");
        players.forEach(player -> ReflectionTestUtils.setField(player, "y", 1_000_000.0));
        for (long time = 1000; time <= 120_000; time += 1000) { match.advance(time); }
        assertThat(match.snapshot().tiles().stream().filter(t -> t.floor() < 8))
                .allSatisfy(t -> assertThat(t.breakAt()).isGreaterThan(300_000));
        assertThat(match.finished()).isFalse();
    }

    @Test
    void 오분_제한에_남은_생존자는_공동일위로_끝나고_보상은_한번만_계산한다() {
        var match = new StoneRumbleMatch(users.subList(0, 3), 0);
        users.subList(0, 3).forEach(user -> match.sceneReady(Long.toString(user), true, 0));
        match.depart("303", 0);
        var players = (List<?>) ReflectionTestUtils.getField(match, "players");
        players.subList(0, 2).forEach(player -> ReflectionTestUtils.setField(player, "y", 1_000_000_000.0));
        for (long time = 1000; time <= 304_000; time += 1000) { match.advance(time); }
        assertThat(match.finished()).isFalse();
        match.advance(304_200);
        assertThat(match.snapshot().endReason()).isEqualTo("MATCH_TIME_LIMIT");
        assertThat(match.snapshot().winnerUserIds()).containsExactly("101", "202");
        assertThat(match.snapshot().players().getFirst().rank()).isEqualTo(1);
        assertThat(match.snapshot().players().getFirst().rewardCoins()).isEqualTo(25);
        assertThat(match.snapshot().players().get(2).rank()).isEqualTo(3);
        var finished = match.snapshot();
        match.advance(310_000);
        assertThat(match.snapshot()).isEqualTo(finished);
    }
}
