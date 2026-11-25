package com.ssafy.ontop.game.stonerumble.domain;

import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class StoneRumbleImpactTests {
    @Test
    void 서버가_확정한_발사와_충돌_좌표를_잠시_보존해_늦은_표시도_복원한다() {
        var match = new StoneRumbleMatch(List.of(101L, 202L), 0);
        match.sceneReady("101", true, 0);
        match.sceneReady("202", true, 0);
        match.advance(4200);
        match.control("101", 0, 0, 1, 0, false, true);
        assertThat(match.snapshot().pigeons().getFirst().bornAt()).isEqualTo(4200);
        match.advance(4800);
        assertThat(match.snapshot().pigeons()).isEmpty();
        assertThat(match.snapshot().impacts()).hasSize(1);
        var impact = match.snapshot().impacts().getFirst();
        assertThat(impact.owner()).isEqualTo("101");
        assertThat(impact.targetUserId()).isEqualTo("202");
        assertThat(impact.at()).isBetween(4200L, 4800L);
        assertThat(impact.x()).isLessThan(5.2);
        match.advance(5800);
        assertThat(match.snapshot().impacts()).isEmpty();
    }
}
