package com.ssafy.ontop.game.stonerumble.domain;

import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

class StoneRumbleMovementTests {
    private StoneRumbleMatch playing() {
        var match = new StoneRumbleMatch(List.of(101L, 202L), 0);
        match.sceneReady("101", true, 0);
        match.sceneReady("202", true, 0);
        match.advance(4200);
        Object player = ((List<?>) ReflectionTestUtils.getField(match, "players")).getFirst();
        ReflectionTestUtils.setField(player, "y", 28.0);
        ReflectionTestUtils.setField(player, "vy", 0.0);
        ReflectionTestUtils.setField(player, "floor", 7);
        ReflectionTestUtils.setField(player, "grounded", true);
        ReflectionTestUtils.setField(player, "lastGroundedAt", 4200L);
        return match;
    }

    @Test
    void 한칸_점프는_인접한_육각_발판에_착지한다() {
        var match = playing();
        match.control("101", 1, 0, 1, 0, true, false);
        for (long time = 4220; time <= 4800; time += 20) {
            match.control("101", 1, 0, 1, 0, false, false);
            match.advance(time);
        }
        var own = match.snapshot().players().getFirst();
        assertThat(own.grounded()).isTrue();
        assertThat(own.floor()).isEqualTo(7);
        assertThat(StoneHexGrid.cell(own.x(), own.z())).isEqualTo(new StoneHexGrid.Cell(-1, 0));
    }

    @Test
    void 점프_다이빙은_한칸_빈틈을_넘고_착지_회복중_점프는_실행하지_않는다() {
        var match = playing();
        for (Object tile : (List<?>) ReflectionTestUtils.getField(match, "tiles")) {
            if (Integer.valueOf(7).equals(ReflectionTestUtils.getField(tile, "floor"))
                    && Integer.valueOf(-1).equals(ReflectionTestUtils.getField(tile, "q"))
                    && Integer.valueOf(0).equals(ReflectionTestUtils.getField(tile, "r"))) {
                ReflectionTestUtils.setField(tile, "breakAt", 1L);
            }
        }
        match.control("101", 1, 0, 1, 0, true, false);
        for (long time = 4220; time <= 4800; time += 20) {
            match.control("101", 1, 0, 1, 0, false, false, time == 4500);
            match.advance(time);
        }
        var landed = match.snapshot().players().getFirst();
        assertThat(landed.grounded()).isTrue();
        assertThat(landed.floor()).isEqualTo(7);
        assertThat(StoneHexGrid.cell(landed.x(), landed.z())).isEqualTo(new StoneHexGrid.Cell(0, 0));
        assertThat(landed.slideUntil()).isGreaterThan(4800);
        match.control("101", 0, 0, 1, 0, true, false, true);
        match.advance(5000);
        assertThat(match.snapshot().players().getFirst().y()).isEqualTo(28);
        match.advance(5100);
        match.control("101", 0, 0, 1, 0, true, false);
        match.advance(5120);
        assertThat(match.snapshot().players().getFirst().y()).isGreaterThan(28);
    }
}
