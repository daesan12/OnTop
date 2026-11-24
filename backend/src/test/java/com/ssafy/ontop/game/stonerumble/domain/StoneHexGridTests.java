package com.ssafy.ontop.game.stonerumble.domain;

import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.data.Offset.offset;

class StoneHexGridTests {
    @Test
    void 여섯_이웃은_모두_동일한_거리이고_기울어진_경계_양쪽을_구분한다() {
        int[][] neighbors = {{1, 0}, {0, 1}, {-1, 1}, {-1, 0}, {0, -1}, {1, -1}};

        for (int[] cell : neighbors) {
            assertThat(Math.hypot(StoneHexGrid.x(cell[0], cell[1]), StoneHexGrid.z(cell[1])))
                    .isCloseTo(2.6, offset(1e-12));
        }
        assertThat(StoneHexGrid.cell(StoneHexGrid.x(0, 1) * .49, StoneHexGrid.z(1) * .49))
                .isEqualTo(new StoneHexGrid.Cell(0, 0));
        assertThat(StoneHexGrid.cell(StoneHexGrid.x(0, 1) * .51, StoneHexGrid.z(1) * .51))
                .isEqualTo(new StoneHexGrid.Cell(0, 1));
        assertThat(StoneHexGrid.cell(1.2, 1.2)).isEqualTo(new StoneHexGrid.Cell(0, 1));
    }

    @Test
    void 모든_발판과_여덟명_생성_위치가_같은_육각_좌표를_사용한다() {
        StoneRumbleMatch.Snapshot state = new StoneRumbleMatch(
                List.of(101L, 202L, 303L, 404L, 505L, 606L, 707L, 808L), 0).snapshot();

        assertThat(state.tileLayout()).isEqualTo("HEX_AXIAL_V1");
        assertThat(state.tiles()).hasSize(513);
        assertThat(state.tiles()).allSatisfy(tile -> {
            assertThat(StoneHexGrid.cell(StoneHexGrid.x(tile.q(), tile.r()), StoneHexGrid.z(tile.r())))
                    .isEqualTo(new StoneHexGrid.Cell(tile.q(), tile.r()));
            assertThat(StoneHexGrid.ring(tile.q(), tile.r())).isLessThanOrEqualTo(8 - tile.floor());
        });
        assertThat(state.players()).allSatisfy(player -> {
            StoneHexGrid.Cell cell = StoneHexGrid.cell(player.x(), player.z());
            assertThat(state.tiles()).anyMatch(tile -> tile.floor() == 2
                    && tile.q() == cell.q() && tile.r() == cell.r());
        });
    }
}
