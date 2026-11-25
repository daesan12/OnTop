package com.ssafy.ontop.game.stonerumble.domain;

import java.util.List;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

class StoneRumbleBalanceTests {
    @Test
    void 인원별_경기장은_팔층과_시작발판을_유지하고_탈락해도_크기가_변하지_않는다() {
        for (int count = 2; count <= 8; count++) {
            var match = ready(count);
            var before = match.snapshot();
            int expected = count == 2 ? 484 : count <= 4 ? 718 : 1378;

            assertThat(before.tiles()).hasSize(expected);
            assertThat(before.tiles().stream().filter(t -> t.floor() == 8)).hasSize(8);
            assertThat(before.tiles().stream().map(StoneRumbleMatch.TileView::floor).distinct()).hasSize(9);
            assertThat(before.players()).allSatisfy(player -> {
                var cell = StoneHexGrid.cell(player.x(), player.z());
                assertThat(before.tiles()).anyMatch(t -> t.floor() == 7 && t.q() == cell.q() && t.r() == cell.r());
            });
            match.depart("101", 4200);
            assertThat(match.snapshot().arenaSize()).isEqualTo(before.arenaSize());
            assertThat(match.snapshot().tiles()).isEqualTo(before.tiles());
        }
    }

    @Test
    void 바닥_다이빙은_구간마다_감속하고_반복해도_걷기보다_빠른_대시가_되지_않는다() {
        var match = field(2);
        match.control("101", 1, 0, 1, 0, false, false, true);
        double previous = 0;
        double previousDistance = Double.POSITIVE_INFINITY;

        for (long time = 4300; time <= 4500; time += 100) {
            match.advance(time);
            double x = match.snapshot().players().getFirst().x();
            assertThat(x - previous).isPositive().isLessThan(previousDistance);
            previousDistance = x - previous;
            previous = x;
        }
        for (long time = 4520; time <= 5200; time += 20) {
            match.control("101", 1, 0, 1, 0, false, false);
            match.advance(time);
        }
        assertThat(match.snapshot().players().getFirst().x()).isBetween(3.0, 4.5);
    }

    @Test
    void 긴_공중_낙하에서도_삼백밀리초에_수평_이동이_끊기지_않는다() {
        var match = field(2);
        Object own = player(match, 0);
        ReflectionTestUtils.setField(own, "y", 38.0);
        ReflectionTestUtils.setField(own, "grounded", false);
        match.control("101", 0, 0, 0, 1, false, false, true);
        match.advance(4500);
        double first = match.snapshot().players().getFirst().z();

        match.advance(4600);
        double second = match.snapshot().players().getFirst().z();
        match.advance(4700);
        double third = match.snapshot().players().getFirst().z();

        assertThat(second - first).isPositive();
        assertThat(third - second).isPositive().isLessThan(second - first);
        assertThat(match.snapshot().players().getFirst().grounded()).isFalse();
    }

    @Test
    void 비둘기는_서있는_상체와_틱_사이에_가로지르는_상대를_놓치지_않는다() {
        var head = field(2);
        place(player(head, 0), -5.2, 29, 0);
        head.control("101", 0, 0, 1, 0, false, true);
        head.advance(4800);
        assertThat(head.snapshot().players().get(1).hitAt()).isPositive();

        var crossing = field(2);
        place(player(crossing, 1), .65, 28, .55);
        crossing.control("202", 0, 1, 0, 1, false, false, true);
        crossing.control("101", 0, 0, 1, 0, false, true);
        crossing.advance(4220);
        assertThat(crossing.snapshot().players().get(1).hitAt()).isEqualTo(4220);
    }

    @Test
    void 다이빙으로_낮아진_몸_위의_공격은_통과하고_옆으로_벗어난_공격도_맞히지_않는다() {
        var prone = field(2);
        place(player(prone, 0), -10.4, 29, 0);
        place(player(prone, 1), 0, 28, 0);
        prone.control("202", 0, 0, 0, 1, false, false, true);
        prone.control("101", 0, 0, 1, 0, false, true);
        prone.advance(4740);
        assertThat(prone.snapshot().players().get(1).hitAt()).isZero();

        var miss = field(2);
        place(player(miss, 0), -5.2, 28, .75);
        miss.control("101", 0, 0, 1, 0, false, true);
        miss.advance(4800);
        assertThat(miss.snapshot().players().get(1).hitAt()).isZero();
    }

    @Test
    void 피격_후_조작을_회복하는_동안_추가_공격을_막고_보호_종료_뒤_다시_맞는다() {
        var match = field(4);
        place(player(match, 0), -2.6, 28, 0);
        place(player(match, 1), 0, 28, 0);
        place(player(match, 2), 0, 28, -5.2);
        place(player(match, 3), 0, 28, 5.2);
        match.control("101", 0, 0, 1, 0, false, true);
        match.advance(4340);
        long hit = match.snapshot().players().get(1).hitAt();
        assertThat(hit).isPositive();
        match.advance(hit + 420);
        place(player(match, 1), 0, 28, 0);
        match.control("202", 1, 0, 1, 0, false, false);
        match.advance(hit + 520);
        assertThat(match.snapshot().players().get(1).x()).isGreaterThan(.4);

        place(player(match, 1), 0, 28, 0);
        match.control("202", 0, 0, 1, 0, false, false);
        match.control("303", 0, 0, 0, 1, false, true);
        match.advance(hit + 820);
        assertThat(match.snapshot().players().get(1).hitAt()).isEqualTo(hit);

        match.advance(hit + StoneRumbleMatch.HIT_PROTECTION - 40);
        place(player(match, 3), 0, 28, 1.3);
        match.control("404", 0, 0, 0, -1, false, true);
        match.advance(hit + 1220);
        assertThat(match.snapshot().players().get(1).hitAt()).isGreaterThanOrEqualTo(hit + 900);
        assertThat(match.snapshot().impacts().stream().filter(p -> p.owner().equals("404")))
                .allSatisfy(impact -> assertThat(impact.at()).isGreaterThanOrEqualTo(hit + 900));
    }

    private StoneRumbleMatch ready(int count) {
        List<Long> users = LongStream.rangeClosed(1, count).map(i -> i * 101).boxed().toList();
        var match = new StoneRumbleMatch(users, 0);
        users.forEach(id -> match.sceneReady(id.toString(), true, 0));
        match.advance(4200);
        return match;
    }

    private StoneRumbleMatch field(int count) {
        var match = ready(count);
        for (int i = 0; i < count; i++) {
            place(player(match, i), i == 0 ? 0 : 5.2, 28, i <= 1 ? 0 : i * 2.6);
        }
        return match;
    }

    private Object player(StoneRumbleMatch match, int index) {
        return ((List<?>) ReflectionTestUtils.getField(match, "players")).get(index);
    }

    private void place(Object player, double x, double y, double z) {
        ReflectionTestUtils.setField(player, "x", x);
        ReflectionTestUtils.setField(player, "y", y);
        ReflectionTestUtils.setField(player, "z", z);
        ReflectionTestUtils.setField(player, "vy", 0.0);
        ReflectionTestUtils.setField(player, "floor", 7);
        ReflectionTestUtils.setField(player, "grounded", y == 28);
        ReflectionTestUtils.setField(player, "lastGroundedAt", 4200L);
    }
}
