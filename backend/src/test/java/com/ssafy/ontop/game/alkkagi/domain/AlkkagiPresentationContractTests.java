package com.ssafy.ontop.game.alkkagi.domain;

import java.util.List;
import java.util.Map;
import org.dyn4j.dynamics.Body;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.*;

class AlkkagiPresentationContractTests {
    @Test void 확대_축소_재배치와_교환은_상대알도_대상이며_발사권한은_유지한다() {
        for (String type : List.of("GROW", "SHRINK", "RELOCATE", "SWAP")) {
            var m = match(type);
            use(m, type.equals("SWAP") ? List.of("p13", "p29") : List.of("p29"),
                    type.equals("RELOCATE") ? new AlkkagiMatch.Placement(0, -.5, 0) : null);
            assertThat(m.privateView(0).cards()).isEmpty();
            var s = m.snapshot(2);
            assertThatThrownBy(() -> m.shoot(0, new AlkkagiMatch.Shot(s.gameId(), "enemy-shot", s.version(), "p29", 1, 0, .2), 3))
                    .hasMessage("NOT_YOUR_PIECE");
        }
    }

    @Test void 공격과_방어는_내알만_대상이다() {
        for (String type : List.of("POWER_UP", "DEFEND")) {
            var m = match(type);
            assertThatThrownBy(() -> use(m, List.of("p29"), null)).hasMessage("NOT_YOUR_PIECE");
            assertThat(m.privateView(0).cards()).hasSize(1);
        }
    }

    @Test void 모서리에_걸쳐도_중심이_안이면_확대축소와_원복을_허용한다() {
        for (String type : List.of("GROW", "SHRINK")) {
            var m = match(type); move(m, "p15", 4.49, 4.99);
            use(m, List.of("p15"), null);
            var p = m.snapshot(2).pieces().get(15);
            assertThat(p.alive()).isTrue(); assertThat(p.x()).isEqualTo(4.49);
            assertThat(p.modifier()).isEqualTo(type);
            m.advance(m.snapshot(0).turnDeadline()); m.advance(m.snapshot(0).turnDeadline());
            assertThat(m.snapshot(0).pieces().get(15).modifier()).isNull();
        }
    }

    @Test void 재배치는_반경아닌_중심경계이며_벽겹침_확대는_여전히_거절한다() {
        var m = match("RELOCATE"); move(m, "p15", 4.2, 4.8);
        use(m, List.of("p15"), new AlkkagiMatch.Placement(4.49, 4.99, 0));
        assertThat(m.snapshot(0).pieces().get(15).alive()).isTrue();
        var w = match("WALL"); use(w, List.of(), new AlkkagiMatch.Placement(0, 0, 0));
        w.advance(w.snapshot(0).turnDeadline()); w.receiveCard(1, "GROW"); move(w, "p29", 1.05, 0);
        var s = w.snapshot(0);
        assertThatThrownBy(() -> w.useItem(1, new AlkkagiMatch.ItemUse(s.gameId(), "grow-wall", s.version(),
                w.privateView(1).cards().getFirst().id(), List.of("p29")), 30_001)).hasMessage("ITEM_OVERLAP_OR_OUTSIDE");
        assertThat(w.privateView(1).cards()).hasSize(1);
    }

    @Test void 장외_순간의_위치와_속도는_정지후에도_보존한다() {
        var m = match("DEFEND"); var s = m.snapshot(0);
        m.shoot(0, new AlkkagiMatch.Shot(s.gameId(), "out", s.version(), "p15", 1, 0, 1), 1);
        for (int i = 0; i < 200 && m.snapshot(0).stage().equals("SIMULATING"); i++) m.advance(2 + i * 8);
        var p = m.snapshot(0).pieces().get(15);
        assertThat(p.alive()).isFalse(); assertThat(p.exit()).isNotNull();
        assertThat(p.exit().x()).isGreaterThan(4.5); assertThat(p.exit().vx()).isGreaterThan(0);
        assertThat(p.vx()).isZero(); // 안정화에서 속도가0이 되어도 장외 연출 속도는 불변.
    }

    private AlkkagiMatch match(String card) {
        var m = new AlkkagiMatch(AlkkagiSettings.provisional()); m.receiveCard(0, card); m.start(0); return m;
    }
    private void use(AlkkagiMatch m, List<String> targets, AlkkagiMatch.Placement p) {
        var s = m.snapshot(0); m.useItem(0, new AlkkagiMatch.ItemUse(s.gameId(), "item", s.version(),
                m.privateView(0).cards().getFirst().id(), targets, p), 1);
    }
    private void move(AlkkagiMatch m, String id, double x, double y) {
        var pieces = (Map<?, ?>) ReflectionTestUtils.getField(m, "pieces");
        var body = (Body) ReflectionTestUtils.getField(pieces.get(id), "body");
        body.getTransform().setTranslation(x, y);
        ((org.dyn4j.world.World<?>) ReflectionTestUtils.getField(m, "world")).setUpdateRequired(true);
    }
}
