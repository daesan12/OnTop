package com.ssafy.ontop.game.stonerumble.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.stonerumble.domain.StoneRumbleMatch;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;

class StoneRumblePublicStateTests {
    @Test
    void 여덟명과_모든_발판이_변경된_스냅샷도_기존_프레임_한도보다_작다() throws Exception {
        var mapper = new ObjectMapper();
        var match = new StoneRumbleMatch(List.of(101L, 202L, 303L, 404L, 505L, 606L, 707L, 808L), 0);
        int initial = mapper.writeValueAsBytes(StoneRumblePublicState.encode(mapper, match.snapshot())).length;
        for (Object tile : (List<?>) ReflectionTestUtils.getField(match, "tiles")) {
            ReflectionTestUtils.setField(tile, "breakAt", 1_795_536_000_000L);
            ReflectionTestUtils.setField(tile, "stepped", true);
        }
        var snapshot = match.snapshot();
        int expanded = mapper.writeValueAsBytes(mapper.valueToTree(snapshot)).length;
        var state = StoneRumblePublicState.encode(mapper, snapshot);
        int compact = mapper.writeValueAsBytes(state).length;
        assertThat(state.has("tiles")).isFalse();
        assertThat(state.path("tileMarks")).hasSize(1378);
        assertThat(state.path("tileMarks").get(0).get(1).asLong()).isEqualTo(1_795_536_000_000L);
        assertThat(expanded).isGreaterThan(100_000);
        assertThat(initial).isLessThan(5000);
        assertThat(compact).isLessThan(45_000);
        System.out.printf("stone-wire initial=%d expanded-worst=%d compact-worst=%d%n", initial, expanded, compact);
    }
}
