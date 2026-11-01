package com.ssafy.ontop.game.alkkagi.domain;

import java.util.Map;
import org.dyn4j.dynamics.Body;
import org.dyn4j.world.World;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.*;

class AlkkagiCardChoiceTests {
    @Test void 선택10초는_다음턴30초에서_차감하지_않고_재접속조회도_후보를_바꾸지_않는다() {
        var m = choosing(3, 0); var c = m.privateView(0).choice(); long at = c.deadline() - 2000;
        assertThat(m.snapshot(at).stage()).isEqualTo("CHOOSING");
        assertThat(m.snapshot(at).pausedTurnMillis()).isEqualTo(30_000);
        assertThat(m.privateView(0).choice()).isEqualTo(c);
        var command = choice(m, "pick", c, 1);
        long accepted = m.chooseCard(0, command, at);
        assertThat(m.snapshot(at).stage()).isEqualTo("AIMING");
        assertThat(m.snapshot(at).turnDeadline()).isEqualTo(at + 30_000);
        assertThat(m.privateView(0).cards().getFirst().type()).isEqualTo(c.options().get(1).type());
        assertThat(m.chooseCard(0, command, at + 50_000)).isEqualTo(accepted);
        assertThat(m.privateView(0).cards()).hasSize(1);
    }

    @Test void 정확한10초에_랜덤확정하고_늦은선택은_새카드를_만들지_않는다() {
        var m = choosing(3, 0); var c = m.privateView(0).choice();
        m.checkDeadlines(c.deadline() - 1); assertThat(m.privateView(0).cards()).isEmpty();
        m.checkDeadlines(c.deadline() + 5000);
        assertThat(m.privateView(0).cards()).hasSize(1); assertThat(m.privateView(0).choice()).isNull();
        assertThat(c.options()).anyMatch(o -> o.type().equals(m.privateView(0).cards().getFirst().type()));
        assertThat(m.snapshot(0).turnDeadline()).isEqualTo(c.deadline() + 30_000);
        assertThatThrownBy(() -> m.chooseCard(0, choice(m, "late", c, 0), c.deadline() + 5000)).hasMessage("CHOICE_NOT_ACTIVE");
        m.checkDeadlines(c.deadline() + 6000); assertThat(m.privateView(0).cards()).hasSize(1);
    }

    @Test void 동시손실은_각자_비공개후보이며_한쪽선택이_상대기한을_리셋하지_않는다() throws Exception {
        var m = choosing(3, 3); var red = m.privateView(0).choice(); var green = m.privateView(1).choice();
        assertThat(m.snapshot(0).cardChoices()).hasSize(2);
        String publicJson = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(m.snapshot(0));
        assertThat(publicJson).doesNotContain(red.id(), green.id(), red.options().getFirst().id(), green.options().getFirst().id());
        assertThatThrownBy(() -> m.chooseCard(1, new AlkkagiMatch.CardChoice(m.snapshot(0).gameId(), "steal", green.id(),
                red.options().getFirst().id()), red.deadline() - 9000)).hasMessage("CHOICE_OPTION_INVALID");
        m.chooseCard(0, choice(m, "red", red, 0), red.deadline() - 8000);
        assertThat(m.snapshot(0).stage()).isEqualTo("CHOOSING");
        assertThat(m.privateView(1).choice()).isEqualTo(green);
        m.chooseCard(1, choice(m, "green", green, 0), green.deadline() - 1000);
        assertThat(m.snapshot(0).turnDeadline()).isEqualTo(green.deadline() - 1000 + 30_000);
        assertThat(m.snapshot(0).stage()).isEqualTo("AIMING");
    }

    @Test void 한번에6개손실은_선택두번이며_자동확정의_기한은_원래기준으로_이어진다() {
        var m = choosing(6, 0); var first = m.privateView(0).choice();
        m.checkDeadlines(first.deadline());
        var second = m.privateView(0).choice(); assertThat(second.losses()).isEqualTo(6);
        assertThat(second.deadline()).isEqualTo(first.deadline() + 10_000);
        m.checkDeadlines(second.deadline() + 5000);
        assertThat(m.privateView(0).cards()).hasSize(2);
        assertThat(m.snapshot(0).turnDeadline()).isEqualTo(second.deadline() + 30_000);
    }

    @Test void 다섯_선택과_기존두장_보유상태에서도_보상을_모두_보관한다() {
        for (int held : new int[]{0, 2}) {
            int losses = held == 0 ? 15 : 9;
            var m = choosing(losses, 0); var first = m.privateView(0).choice();
            if (held == 2) { m.receiveCard(0, "DEFEND"); m.receiveCard(0, "SWAP"); }
            m.checkDeadlines(first.deadline() + (losses / 3 - 1) * 10_000L);
            assertThat(m.privateView(0).cards()).hasSize(5);
            assertThat(m.privateView(0).awards()).hasSize(losses / 3).allMatch(a -> a.result().equals("AWARDED"));
            assertThat(m.privateView(0).choice()).isNull();
            assertThat(m.snapshot(0).stage()).isEqualTo("AIMING");
        }
    }

    @Test void 선택중_발사관전자선택은_거절하고_기권후_남은선택은_폐기한다() {
        var m = choosing(3, 0); var c = m.privateView(0).choice(); var s = m.snapshot(0);
        assertThatThrownBy(() -> m.shoot(s.turn(), new AlkkagiMatch.Shot(s.gameId(), "shot", s.version(), "p31", 1, 0, .2), 1000))
                .hasMessage("NOT_AIMING");
        assertThatThrownBy(() -> m.chooseCard(-1, choice(m, "viewer", c, 0), 1000)).hasMessage("PLAYER_REQUIRED");
        m.forfeit(0, "quit", 1000); m.checkDeadlines(c.deadline());
        assertThat(m.privateView(0).choice()).isNull(); assertThat(m.privateView(0).cards()).isEmpty();
        assertThat(m.snapshot(0).cardChoices()).isEmpty(); assertThat(m.snapshot(0).winner()).isEqualTo(1);
    }

    @Test void 추가발사의_남은시간만_보존하며_선택으로_30초를_새로_주지_않는다() {
        var m = choosing(3, 0, true); var c = m.privateView(0).choice();
        long paused = m.snapshot(0).pausedTurnMillis(), now = c.deadline() - 2000;
        assertThat(paused).isLessThan(30_000); assertThat(m.snapshot(0).turn()).isZero();
        m.chooseCard(0, choice(m, "extra-choice", c, 0), now);
        assertThat(m.snapshot(0).turnDeadline()).isEqualTo(now + paused);
        assertThat(m.snapshot(0).extraShotsRemaining()).isEqualTo(1);
    }

    @Test void 전체경기제한이_먼저_끝나면_대기후보를_폐기한다() {
        var m = choosing(3, 0); var c = m.privateView(0).choice();
        ReflectionTestUtils.setField(m, "matchDeadline", c.deadline() - 5000);
        m.checkDeadlines(c.deadline());
        assertThat(m.snapshot(0).endReason()).isEqualTo("MATCH_TIME_LIMIT");
        assertThat(m.privateView(0).choice()).isNull(); assertThat(m.privateView(0).cards()).isEmpty();
    }

    @Test void 공통입력도_후보ID로_선택하며_임의필드나_옵션은_거절한다() {
        var m = choosing(3, 0); var c = m.privateView(0).choice();
        var input = new com.fasterxml.jackson.databind.ObjectMapper().createObjectNode()
                .put("type", "CARD_CHOOSE").put("choiceId", c.id()).put("optionId", c.options().getFirst().id());
        var bad = input.deepCopy().put("actor", 1);
        assertThatThrownBy(() -> com.ssafy.ontop.game.alkkagi.service.AlkkagiInputs.apply(m, 0, "bad", 0, bad, 1000))
                .hasMessage("INVALID_ACTION");
        com.ssafy.ontop.game.alkkagi.service.AlkkagiInputs.apply(m, 0, "good", 0, input, 1000);
        assertThat(m.privateView(0).cards()).hasSize(1);
    }

    private AlkkagiMatch choosing(int redLost, int greenLost) {
        return choosing(redLost, greenLost, false);
    }
    private AlkkagiMatch choosing(int redLost, int greenLost, boolean extra) {
        var m = new AlkkagiMatch(AlkkagiSettings.provisional());
        if (extra) m.receiveCard(0, "EXTRA_SHOT");
        m.start(0);
        if (extra) {
            var s = m.snapshot(0); m.useItem(0, new AlkkagiMatch.ItemUse(s.gameId(), "extra", s.version(),
                    m.privateView(0).cards().getFirst().id(), java.util.List.of()), 1);
        }
        var pieces = (Map<?, ?>) ReflectionTestUtils.getField(m, "pieces");
        var world = (World<Body>) ReflectionTestUtils.getField(m, "world");
        for (int owner = 0; owner < 2; owner++) for (int i = 0; i < (owner == 0 ? redLost : greenLost); i++) {
            var p = pieces.get("p" + (owner * 16 + i)); ReflectionTestUtils.setField(p, "alive", false);
            world.removeBody((Body) ReflectionTestUtils.getField(p, "body"));
        }
        var s = m.snapshot(0); m.shoot(0, new AlkkagiMatch.Shot(s.gameId(), "start", s.version(), "p15", 0, -1, .001), 1);
        for (int i = 0; i < 100 && m.snapshot(0).stage().equals("SIMULATING"); i++) m.advance(2 + i * 8);
        assertThat(m.snapshot(0).stage()).isEqualTo("CHOOSING"); return m;
    }
    private AlkkagiMatch.CardChoice choice(AlkkagiMatch m, String actionId, AlkkagiMatch.ChoiceView c, int option) {
        return new AlkkagiMatch.CardChoice(m.snapshot(0).gameId(), actionId, c.id(), c.options().get(option).id());
    }
}
