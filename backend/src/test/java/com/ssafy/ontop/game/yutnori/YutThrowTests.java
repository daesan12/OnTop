package com.ssafy.ontop.game.yutnori;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.yutnori.domain.YutMatch;
import java.util.Random;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class YutThrowTests {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void 모든_윷면의_확정결과와_던진_팀을_차례변경후에도_유지한다() {
        for (int mask = 0; mask < 16; mask++) {
            var match = playing();
            assertThat(match.lastThrow).isNull();

            match.act(101, mapper.createObjectNode().put("type", "THROW"), random(mask, false), 10);

            var expected = YutMatch.roll(1, mask);
            assertThat(match.lastThrow).isEqualTo(new YutMatch.ThrowResult(1, "101", 0, mask,
                    expected.name(), expected.steps(), expected.bonus(), false, 10, false));
            if (mask == 1) {
                assertThat(match.rolls).isEmpty();
                assertThat(match.team).isEqualTo(1);
            }
        }
    }

    @Test
    void 낙과_빈판_빽도도_서로_다른_결과번호를_가지며_이동후에도_마지막결과를_보존한다() {
        var match = playing();

        match.act(101, mapper.createObjectNode().put("type", "THROW"), random(1, true), 10);

        assertThat(match.lastThrow.name()).isEqualTo("낙");
        assertThat(match.lastThrow.steps()).isZero();
        assertThat(match.lastThrow.out()).isTrue();
        assertThat(match.lastThrow.bonus()).isFalse();
        assertThat(match.rolls).isEmpty();
        match.act(202, mapper.createObjectNode().put("type", "THROW"), random(1, false), 20);
        assertThat(match.lastThrow.id()).isEqualTo(2);
        assertThat(match.lastThrow.name()).isEqualTo("빽도");
        assertThat(match.lastThrow.team()).isEqualTo(1);
        assertThat(match.rolls).isEmpty();

        match.act(101, mapper.createObjectNode().put("type", "THROW"), random(2, false), 30);
        var thrown = match.lastThrow;
        match.act(101, mapper.createObjectNode().put("type", "MOVE").put("piece", 0).put("rollId", 3)
                .put("shortcut", false), random(2, false), 40);
        assertThat(match.lastThrow).isEqualTo(thrown);
        assertThat(match.rolls).isEmpty();
        assertThat(match.team).isEqualTo(1);
    }

    private YutMatch playing() {
        var match = new YutMatch("yut-throw", "channel-1", "방", 101, "청",
                new YutMatch.Rules(false, false, false), 0);
        match.join(202, "홍");
        match.phase = "PLAYING";
        match.turnUser = 101;
        match.credits = 1;
        return match;
    }

    private Random random(int mask, boolean out) {
        return new Random(1) {
            @Override
            public int nextInt(int bound) {
                return bound == 16 ? mask : out ? 0 : 99;
            }
        };
    }
}
