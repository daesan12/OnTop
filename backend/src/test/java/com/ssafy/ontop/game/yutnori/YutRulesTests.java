package com.ssafy.ontop.game.yutnori;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.yutnori.domain.YutBoard;
import com.ssafy.ontop.game.yutnori.domain.YutMatch;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class YutRulesTests {
    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void 열여섯_윷면_조합을_도개걸윷모빽도로_판정한다() {
        assertThat(YutMatch.roll(1, 0).steps()).isEqualTo(5);
        assertThat(YutMatch.roll(1, 1).steps()).isEqualTo(-1);
        assertThat(YutMatch.roll(1, 2).steps()).isEqualTo(1);
        assertThat(YutMatch.roll(1, 3).steps()).isEqualTo(2);
        assertThat(YutMatch.roll(1, 7).steps()).isEqualTo(3);
        assertThat(YutMatch.roll(1, 15).bonus()).isTrue();
    }

    @Test
    void 지나친_모서리는_꺾지_않고_정확히_멈춘_뒤_지름길을_탄다() {
        assertThat(YutBoard.move(List.of(4), 2, true, false)).endsWith(5, 6);
        assertThat(YutBoard.move(List.of(5), 3, true, false)).endsWith(21, 22, 23);
        assertThat(YutBoard.move(List.of(5), 4, true, false)).endsWith(23, 24);
        assertThat(YutBoard.move(List.of(5, 21, 22, 23), 3, true, false)).endsWith(28, 29, 20);
    }

    @Test
    void 최단길은_열두칸이며_참먹이에_딱_도착하면_완주하지_않는다() {
        var path = YutBoard.move(List.of(), 5, false, false);
        path = YutBoard.move(path, 3, true, false);
        path = YutBoard.move(path, 3, true, false);
        assertThat(path).hasSize(11).endsWith(20);
        assertThat(YutBoard.move(path, 1, false, false)).hasSize(12).endsWith(30);
    }

    @Test
    void 빽도는_실제로_온_지름길로_후퇴하며_도자리에서는_참먹이로_간다() {
        assertThat(YutBoard.move(List.of(5, 21, 22, 23), -1, false, false)).endsWith(22);
        assertThat(YutBoard.move(List.of(23, 28, 29, 20), -1, false, false)).endsWith(29);
        assertThat(YutBoard.move(List.of(1), -1, false, false)).endsWith(20);
        assertThat(YutBoard.move(List.of(19, 20), -1, false, true)).endsWith(30);
    }

    @Test
    void 업힌_말을_함께_잡고_잡기_추가_기회를_한번만_준다() {
        var match = playing(new YutMatch.Rules(false, false, false));
        match.pieces.get(0).set(0, new ArrayList<>(List.of(1)));
        match.pieces.get(0).set(1, new ArrayList<>(List.of(1)));
        match.pieces.get(1).set(0, new ArrayList<>(List.of(2)));
        match.pieces.get(1).set(1, new ArrayList<>(List.of(2)));
        match.rolls.add(YutMatch.roll(1, 2));
        match.credits = 0;
        match.act(101, mapper.createObjectNode().put("type", "MOVE").put("piece", 0).put("rollId", 1)
                .put("shortcut", false), new Random(2), 1);
        assertThat(match.pieces.get(0).get(0)).endsWith(2);
        assertThat(match.pieces.get(0).get(1)).endsWith(2);
        assertThat(match.pieces.get(1).get(0)).isEmpty();
        assertThat(match.pieces.get(1).get(1)).isEmpty();
        assertThat(match.credits).isEqualTo(1);
        assertThat(match.team).isZero();
    }

    @Test
    void 윷으로_잡을때_중복_추가_기회는_방_규칙을_따른다() {
        for (boolean duplicate : List.of(false, true)) {
            var match = playing(new YutMatch.Rules(false, duplicate, false));
            match.pieces.get(1).set(0, new ArrayList<>(List.of(4)));
            match.rolls.add(YutMatch.roll(1, 15));
            match.act(101, mapper.createObjectNode().put("type", "MOVE").put("piece", 0).put("rollId", 1)
                    .put("shortcut", false), new Random(2), 1);
            assertThat(match.credits).isEqualTo(duplicate ? 2 : 1);
        }
    }

    @Test
    void 같은팀_비차례_사용자와_완주한_말의_이동을_거절한다() {
        var match = playing(new YutMatch.Rules(false, false, false));
        assertThatThrownBy(() -> match.act(202, mapper.createObjectNode().put("type", "THROW"), new Random(2), 1))
                .isInstanceOf(IllegalArgumentException.class);
        match.pieces.get(0).set(0, new ArrayList<>(List.of(30)));
        match.rolls.add(YutMatch.roll(1, 2));
        assertThatThrownBy(() -> match.act(101, mapper.createObjectNode().put("type", "MOVE").put("piece", 0)
                .put("rollId", 1).put("shortcut", false), new Random(2), 1)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 마지막_업힌_말이_모두_나가면_승리를_확정한다() {
        var match = playing(new YutMatch.Rules(false, false, false));
        for (int index = 0; index < 4; index++) {
            match.pieces.get(0).set(index, new ArrayList<>(List.of(19, 20)));
        }
        match.rolls.add(YutMatch.roll(1, 2));
        match.act(101, mapper.createObjectNode().put("type", "MOVE").put("piece", 0).put("rollId", 1)
                .put("shortcut", false), new Random(2), 1);
        assertThat(match.phase).isEqualTo("FINISHED");
        assertThat(match.winner).isZero();
        assertThat(match.reason).isEqualTo("YUT_COMPLETED");
    }

    private YutMatch playing(YutMatch.Rules rules) {
        var match = new YutMatch("yut-test", "channel-1", "테스트", 101, "청", rules, 0);
        match.join(202, "홍");
        match.phase = "PLAYING";
        match.turnUser = 101;
        match.credits = 1;
        return match;
    }

    @Test
    void 빈판_빽도는_선택규칙에_따라_무효_또는_새말을_놓는다() {
        for (boolean enters : List.of(false, true)) {
            var match = playing(new YutMatch.Rules(enters, false, false));
            var random = new Random() {
                @Override
                public int nextInt(int bound) {
                    return bound == 16 ? 1 : 99;
                }
            };
            match.act(101, mapper.createObjectNode().put("type", "THROW"), random, 1);
            if (enters) {
                assertThat(match.rolls).hasSize(1);
                match.act(101, mapper.createObjectNode().put("type", "MOVE").put("piece", 0)
                        .put("rollId", match.rolls.getFirst().id()).put("shortcut", false), random, 2);
                assertThat(match.pieces.get(0).get(0)).containsExactly(1);
            } else {
                assertThat(match.rolls).isEmpty();
                assertThat(match.team).isEqualTo(1);
            }
        }
    }

    @Test
    void 낙은_보관중인_이동권과_추가_던지기를_없애고_차례를_넘긴다() {
        var match = playing(new YutMatch.Rules(false, false, false));
        match.rolls.add(YutMatch.roll(1, 15));
        match.credits = 2;
        match.act(101, mapper.createObjectNode().put("type", "THROW"), new Random() {
            @Override
            public int nextInt(int bound) {
                return 0;
            }
        }, 1);
        assertThat(match.rolls).isEmpty();
        assertThat(match.team).isEqualTo(1);
        assertThat(match.credits).isEqualTo(1);
    }
}
