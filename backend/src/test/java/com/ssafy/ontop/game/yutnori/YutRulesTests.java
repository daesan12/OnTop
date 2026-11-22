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
    @Test
    void 새말은_출발모서리를_세지_않고_첫도부터_진입한다() {
        assertThat(YutBoard.move(List.of(), 1, false, false)).containsExactly(1);
        assertThat(YutBoard.move(List.of(), 2, false, false)).containsExactly(1, 2);
        assertThat(YutBoard.move(List.of(), 5, false, false)).containsExactly(1, 2, 3, 4, 5);
    }

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
    @Test
    void 모든_팀수와_말수_설정에서_선공과_순환_차례를_지킨다() {
        for (int teams = 2; teams <= 4; teams++) {
            for (int tokens = 1; tokens <= 4; tokens++) {
                var match = new YutMatch("yut-options", "channel-1", "설정", 101, "청",
                        new YutMatch.Rules(false, false, false), teams, tokens, 0);
                for (int side = 1; side < teams; side++) {
                    match.join(101L + side, "참가" + side);
                }
                match.players.values().forEach(player -> player.ready = true);
                match.start(new Random(2), 0);
                assertThat(match.pieces).hasSize(teams);
                for (var side : match.pieces) assertThat(side).hasSize(tokens);
                assertThat(match.opening).hasSize(teams);
                int first = match.team;
                for (int turn = 1; turn <= teams; turn++) {
                    match.advance(turn);
                    assertThat(match.team).isEqualTo((first + turn) % teams);
                    assertThat(match.players.get(match.turnUser).team).isEqualTo(match.team);
                }
            }
        }
    }

    @Test
    void 네팀의_업힌_말을_잡고_선택한_말수만큼_완주하면_황팀도_승리한다() {
        var match = new YutMatch("yut-four", "channel-1", "설정", 101, "청",
                new YutMatch.Rules(false, false, false), 4, 2, 0);
        for (int side = 1; side < 4; side++) match.join(101L + side, "참가" + side);
        match.phase = "PLAYING"; match.team = 3; match.turnUser = 104;
        for (int side = 0; side < 3; side++) for (int token = 0; token < 2; token++) {
            match.pieces.get(side).set(token, new ArrayList<>(List.of(2)));
        }
        match.pieces.get(3).set(0, new ArrayList<>(List.of(1)));
        match.pieces.get(3).set(1, new ArrayList<>(List.of(1)));
        match.rolls.add(YutMatch.roll(1, 2));
        match.act(104, mapper.createObjectNode().put("type", "MOVE").put("piece", 1)
                .put("rollId", 1).put("shortcut", false), new Random(2), 1);
        for (int side = 0; side < 3; side++) assertThat(match.pieces.get(side)).allSatisfy(history -> assertThat(history).isEmpty());
        assertThat(match.pieces.get(3)).allSatisfy(history -> assertThat(history).endsWith(2));
        assertThat(match.credits).isEqualTo(1);
        for (int token = 0; token < 2; token++) match.pieces.get(3).set(token, new ArrayList<>(List.of(19, 20)));
        match.rolls.add(YutMatch.roll(2, 2));
        match.act(104, mapper.createObjectNode().put("type", "MOVE").put("piece", 0)
                .put("rollId", 2).put("shortcut", false), new Random(2), 2);
        assertThat(match.phase).isEqualTo("FINISHED");
        assertThat(match.winner).isEqualTo(3);
    }

    @Test
    void 탈락팀은_말을_치우고_차례를_건너뛰며_마지막_생존팀이_승리한다() {
        var match = new YutMatch("yut-four", "channel-1", "설정", 101, "청",
                new YutMatch.Rules(false, false, false), 4, 1, 0);
        for (int side = 1; side < 4; side++) match.join(101L + side, "참가" + side);
        match.phase = "PLAYING"; match.team = 0; match.turnUser = 101;
        match.pieces.get(2).set(0, new ArrayList<>(List.of(4)));
        match.eliminate(2, "YUT_FORFEIT", 1);
        assertThat(match.team).isZero();
        assertThat(match.pieces.get(2).getFirst()).isEmpty();
        match.advance(2); assertThat(match.team).isEqualTo(1);
        match.advance(3); assertThat(match.team).isEqualTo(3);
        match.eliminate(3, "YUT_TURN_TIMEOUT", 4);
        assertThat(match.team).isZero();
        match.eliminate(0, "YUT_FORFEIT", 5);
        assertThat(match.phase).isEqualTo("FINISHED");
        assertThat(match.winner).isEqualTo(1);
    }

    @Test
    void 대기석에서_첫도는_한칸이며_바깥길_스무칸과_출구를_구분한다() {
        assertThat(YutBoard.move(List.of(), 1, false, false)).containsExactly(1);
        var path = YutBoard.move(List.of(), 5, false, false);
        for (int turn = 0; turn < 3; turn++) path = YutBoard.move(path, 5, false, false);
        assertThat(path).hasSize(20).endsWith(20);
        assertThat(YutBoard.move(path, 1, false, false)).hasSize(21).endsWith(30);
        assertThat(YutBoard.move(List.of(10), 4, true, false)).endsWith(26, 27, 23, 28);
        assertThat(YutBoard.move(List.of(5), 5, true, false)).endsWith(21, 22, 23, 24, 25);
    }

}
