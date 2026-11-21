package com.ssafy.ontop.game.yutnori;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.yutnori.domain.YutMatch;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class YutOpeningTests {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void 시작하면_각팀대표의_직접던지기를_기다리고_이동은_막는다() {
        var match = started(4);
        assertThat(match.openingTeams).containsExactly(0, 1, 2, 3);
        assertThat(match.opening).containsExactly(-1, -1, -1, -1);
        assertThat(match.lastThrow).isNull();
        assertThat(match.legalMoves()).isEmpty();
        assertThatThrownBy(() -> match.act(101, mapper.createObjectNode().put("type", "MOVE"), random(0, false), 10))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> match.act(102, mapper.createObjectNode().put("type", "THROW"), random(0, false), 10))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 여섯_결과의_모든_조합에서_높은_팀이_선공이며_동률이면_다시_던진다() {
        List<Integer> masks = List.of(1, 2, 3, 7, 15, 0);
        for (int first = 0; first < masks.size(); first++) {
            for (int second = 0; second < masks.size(); second++) {
                var match = started(2);
                toss(match, masks.get(first), false);
                toss(match, masks.get(second), false);
                assertThat(match.rolls).isEmpty();
                assertThat(match.credits).isEqualTo(1);
                assertThat(match.pieces).allSatisfy(tokens ->
                        assertThat(tokens).allSatisfy(history -> assertThat(history).isEmpty()));
                if (first == second) {
                    assertThat(match.openingTeams).containsExactly(0, 1);
                    assertThat(match.openingRound).isEqualTo(2);
                } else {
                    assertThat(match.openingTeams).isEmpty();
                    assertThat(match.team).isEqualTo(first > second ? 0 : 1);
                }
            }
        }
    }

    @Test
    void 최고동률팀만_재던지고_승리팀은_새로운_본게임_윷을_던진다() {
        var match = started(3);
        toss(match, 3, false); toss(match, 0, false); toss(match, 0, false);
        assertThat(match.openingTeams).containsExactly(1, 2);
        assertThat(match.team).isEqualTo(1);
        assertThatThrownBy(() -> match.act(101, mapper.createObjectNode().put("type", "THROW"), random(0, false), 20))
                .isInstanceOf(IllegalArgumentException.class);
        toss(match, 7, false); toss(match, 15, false);
        assertThat(match.openingTeams).isEmpty();
        assertThat(match.team).isEqualTo(2);
        assertThat(match.turnUser).isEqualTo(103);
        assertThat(match.lastThrow.opening()).isTrue();
        assertThat(match.rolls).isEmpty();
        toss(match, 3, false);
        assertThat(match.lastThrow.opening()).isFalse();
        assertThat(match.rolls).hasSize(1);
        assertThat(match.legalMoves()).isNotEmpty();
    }

    @Test
    void 낙은_빽도보다_낮고_모든팀이_낙이면_다시_던진다() {
        var match = started(2);
        toss(match, 0, true); toss(match, 1, false);
        assertThat(match.team).isEqualTo(1);
        assertThat(match.openingTeams).isEmpty();
        match = started(2);
        toss(match, 0, true); toss(match, 15, true);
        assertThat(match.openingTeams).containsExactly(0, 1);
        assertThat(match.openingRound).isEqualTo(2);
    }

    @Test
    void 선공결정중_팀이_기권해도_남은팀의_비교와_종료를_보존한다() {
        var match = started(4);
        match.eliminate(0, "YUT_FORFEIT", 1);
        assertThat(match.team).isEqualTo(1);
        toss(match, 0, false); toss(match, 0, false); toss(match, 2, false);
        assertThat(match.openingTeams).containsExactly(1, 2);
        match.eliminate(1, "YUT_FORFEIT", 2);
        match.eliminate(2, "YUT_FORFEIT", 3);
        assertThat(match.phase).isEqualTo("FINISHED");
        assertThat(match.winner).isEqualTo(3);
    }

    private YutMatch started(int teams) {
        var match = new YutMatch("yut-opening", "channel-1", "방", 101, "청",
                new YutMatch.Rules(false, false, false), teams, 4, 0);
        for (int side = 1; side < teams; side++) {
            match.join(101 + side, "참가");
        }
        match.players.values().forEach(player -> player.ready = true);
        match.start(new Random(2), 0);
        return match;
    }

    private void toss(YutMatch match, int mask, boolean out) {
        match.act(match.turnUser, mapper.createObjectNode().put("type", "THROW"), random(mask, out), 10);
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
