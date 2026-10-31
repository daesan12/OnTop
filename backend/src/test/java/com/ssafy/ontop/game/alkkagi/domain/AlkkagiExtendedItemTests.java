package com.ssafy.ontop.game.alkkagi.domain;

import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class AlkkagiExtendedItemTests {
    @Test
    void 벽은_실제_충돌하고_상대턴_종료후에도_유지한다() {
        var m = match("WALL"); use(m, "wall", List.of(), new AlkkagiMatch.Placement(0, 0, 0), 1);
        assertThat(m.snapshot(1).wall()).isNotNull();
        fire(m, "shot", "p13", 0, -1, .5, 2);
        boolean bounced = false;
        for (int i = 0; i < 1000 && m.snapshot(0).stage().equals("SIMULATING"); i++) {
            m.advance(3 + i * 8);
            var p = m.snapshot(0).pieces().get(13);
            if (p.vy() > 1) bounced = true;
            assertThat(p.y()).isGreaterThan(.25);
        }
        assertThat(bounced).isTrue();
        assertThat(m.snapshot(0).turn()).isEqualTo(1);
        assertThat(m.snapshot(0).wall()).isNotNull();
        m.advance(m.snapshot(0).turnDeadline());
        assertThat(m.snapshot(0).wall()).isNotNull();
        assertThat(m.snapshot(0).wall().expiresAfterTurn()).isNull();
        assertThat(m.snapshot(0).wallsUsed()).containsExactly(1, 0);
    }

    @Test
    void 벽의_겹침_가장자리_비정상수치는_소모없이_거절한다() {
        var m = match("WALL");
        for (var p : List.of(new AlkkagiMatch.Placement(0, 1.2, 0), new AlkkagiMatch.Placement(4.4, 0, .2),
                new AlkkagiMatch.Placement(Double.NaN, 0, 0))) {
            assertThatThrownBy(() -> use(m, "invalid", List.of(), p, 1)).isInstanceOf(IllegalArgumentException.class);
            assertThat(m.snapshot(0).wall()).isNull(); assertThat(m.privateView(0).cards()).hasSize(1);
        }
    }

    @Test void 지속벽의_추가설치는_소모없이_거절한다() {
        var m=match("WALL");use(m,"wall",List.of(),new AlkkagiMatch.Placement(0,0,0),1);
        m.advance(30_000);m.advance(60_000);m.receiveCard(0,"WALL");
        assertThatThrownBy(()->use(m,"second",List.of(),new AlkkagiMatch.Placement(2,0,0),60_001)).hasMessage("WALL_ALREADY_EXISTS");
        assertThat(m.privateView(0).cards()).hasSize(1);
    }

    @Test
    void 회전한_벽의_실제형상으로_겹침을_검사한다() {
        var wall = new AlkkagiMatch.WallView(0, 0, 0, 2, .2, Math.PI / 4, 2);
        assertThat(AlkkagiWallGeometry.overlaps(.5, .5, .1, wall)).isTrue();
        assertThat(AlkkagiWallGeometry.overlaps(.7, -.7, .1, wall)).isFalse();
    }

    @Test
    void 재배치는_거리_중심경계_겹침을_검사하고_서버좌표를_변경한다() {
        var m = match("RELOCATE");
        assertThatThrownBy(() -> use(m, "far", List.of("p13"), new AlkkagiMatch.Placement(0, -4, 0), 1)).hasMessage("RELOCATE_TOO_FAR");
        assertThatThrownBy(() -> use(m, "overlap", List.of("p13"), new AlkkagiMatch.Placement(0, 3.2, 0), 1)).hasMessage("ITEM_OVERLAP_OR_OUTSIDE");
        assertThatThrownBy(() -> use(m, "other", List.of("p16"), new AlkkagiMatch.Placement(0, 0, 0), 1)).hasMessage("RELOCATE_TOO_FAR");
        assertThat(m.privateView(0).cards()).hasSize(1);
        use(m, "move", List.of("p13"), new AlkkagiMatch.Placement(1, .4, 0), 1);
        assertThat(m.snapshot(0).pieces().get(13).x()).isEqualTo(1);
        assertThat(m.snapshot(0).pieces().get(13).y()).isEqualTo(.4);
        assertThat(m.privateView(0).cards()).isEmpty();
    }

    @Test void 힘강화는_여러알에_지속하며_다른알_발사도_허용한다() {
        var m=match("POWER_UP");var base=m.snapshot(0).pieces().get(13).launchSpeed();
        use(m,"boost",List.of("p13"),null,1);
        fire(m,"other","p12",0,-1,.001,2);settle(m,3);m.advance(m.snapshot(0).turnDeadline());
        assertThat(m.snapshot(0).pieces().get(13).powerUp()).isTrue();
        assertThat(m.snapshot(0).pieces().get(13).launchSpeed()).isEqualTo(base*1.5);
        m.receiveCard(0,"POWER_UP");use(m,"boost2",List.of("p14"),null,31_001);
        fire(m,"boosted","p13",0,-1,.001,31_002);settle(m,31_003);
        assertThat(m.snapshot(0).pieces().get(13).powerUp()).isTrue();
        assertThat(m.snapshot(0).pieces().get(14).powerUp()).isTrue();
        var duplicate=match("POWER_UP");use(duplicate,"first",List.of("p13"),null,1);
        duplicate.advance(30_000);duplicate.advance(60_000);duplicate.receiveCard(0,"POWER_UP");
        assertThatThrownBy(()->use(duplicate,"duplicate",List.of("p13"),null,60_001)).hasMessage("POWER_ALREADY_ACTIVE");
        assertThat(duplicate.privateView(0).cards()).hasSize(1);
    }

    @Test
    void 확대축소방어는_상대턴_종료후에도_유지한다() {
        for (String type : List.of("GROW", "SHRINK", "DEFEND")) {
            var m = match(type); var base = m.snapshot(0).pieces().get(13);
            use(m, "change", List.of("p13"), null, 1);
            double scale = type.equals("GROW") ? 1.25 : type.equals("SHRINK") ? .8 : 1;
            var changed = m.snapshot(0).pieces().get(13);
            assertThat(changed.radius()).isEqualTo(base.radius() * scale);
            assertThat(changed.mass()).isEqualTo(base.mass() * (type.equals("DEFEND") ? 2 : scale * scale));
            assertThat(changed.launchSpeed()).isEqualTo(base.launchSpeed());
            m.advance(30_000); assertThat(m.snapshot(0).pieces().get(13).modifier()).isEqualTo(type);
            m.advance(60_000);
            assertThat(m.snapshot(0).pieces().get(13).radius()).isEqualTo(changed.radius());
            assertThat(m.snapshot(0).pieces().get(13).mass()).isEqualTo(changed.mass());
            assertThat(m.snapshot(0).pieces().get(13).modifier()).isEqualTo(type);
        }
    }

    @Test void 축소는_원복대기없이_지속한다() {
        var m=match("SHRINK");use(m,"shrink",List.of("p13"),null,1);m.advance(30_000);m.advance(60_000);
        assertThat(m.snapshot(0).pieces().get(13).radius()).isEqualTo(.24*.8);
        assertThat(m.snapshot(0).pieces().get(13).restorePending()).isFalse();
    }

    @Test
    void 방어는_반경을_유지하며_충돌시_버티는_질량만_변경한다() {
        var m = match("DEFEND"); use(m, "defend", List.of("p13"), null, 1);
        assertThat(m.snapshot(0).pieces().get(13).mass()).isEqualTo(1.6);
        fire(m, "same-speed", "p13", 0, -1, .1, 2); m.advance(3);
        var normal = match("DEFEND"); fire(normal, "normal", "p13", 0, -1, .1, 2); normal.advance(3);
        assertThat(m.snapshot(0).pieces().get(13).vy()).isEqualTo(normal.snapshot(0).pieces().get(13).vy());
    }

    @Test
    void 아이템_설정은_유한한_검수범위만_허용한다() {
        assertThatThrownBy(() -> new AlkkagiItemRules(1.6, .18, .12, 2, Double.NaN, 1.25, .8, 2, 1))
                .hasMessage("INVALID_ITEM_RULES");
        assertThatThrownBy(() -> new AlkkagiItemRules(1.6, .18, .12, 2, 1.5, 1.25, .8, 2, -1))
                .hasMessage("INVALID_ITEM_RULES");
    }

    @Test
    void 가장자리에_걸친_방어와_확대도_지속한다() {
        for (String type : List.of("DEFEND", "GROW")) {
            var m = match(type); use(m, "edge", List.of("p15"), null, 1);
            fire(m, "edge-shot", "p15", 1, 0, .15, 2); settle(m, 3);
            var edge = m.snapshot(0).pieces().get(15);
            assertThat(edge.alive()).isTrue();
            assertThat(edge.x() + edge.radius()).isGreaterThan(4.5);
            m.advance(m.snapshot(0).turnDeadline());
            var restored = m.snapshot(0).pieces().get(15);
            assertThat(restored.modifier()).isEqualTo(type);
            assertThat(restored.radius()).isEqualTo(edge.radius()); assertThat(restored.mass()).isEqualTo(edge.mass());
        }
    }

    @Test void 강화알이_탈락해도_다른알_발사를_막지않고_새판에는_효과가없다() {
        var m=match("POWER_UP");use(m,"boost-out",List.of("p15"),null,1);
        fire(m,"out","p15",1,0,1,2);settle(m,3);
        assertThat(m.snapshot(0).pieces().get(15).alive()).isFalse();
        fire(m,"green","p31",0,-1,.001,2_000);settle(m,2_001);
        assertThatCode(()->fire(m,"other","p13",0,-1,.001,4_000)).doesNotThrowAnyException();
        assertThat(match("POWER_UP").snapshot(0).pieces()).allMatch(p->!p.powerUp()&&p.modifier()==null);
        assertThat(new AlkkagiItemRules(1.6,.18,.12,2,1.5,1.25,.8,2,1).effectOpponentTurns()).isZero();
    }

    private AlkkagiMatch match(String type) {
        var m = new AlkkagiMatch(AlkkagiSettings.provisional()); m.receiveCard(0, type); m.start(0); return m;
    }
    private AlkkagiMatch.ItemUse request(AlkkagiMatch m, String id, int actor, List<String> targets, AlkkagiMatch.Placement p) {
        var s = m.snapshot(0); return new AlkkagiMatch.ItemUse(s.gameId(), id, s.version(), m.privateView(actor).cards().getFirst().id(), targets, p);
    }
    private void use(AlkkagiMatch m, String id, List<String> targets, AlkkagiMatch.Placement p, long now) { m.useItem(0, request(m, id, 0, targets, p), now); }
    private void fire(AlkkagiMatch m, String id, String piece, double dx, double dy, double power, long now) {
        var s = m.snapshot(0); m.shoot(s.turn(), new AlkkagiMatch.Shot(s.gameId(), id, s.version(), piece, dx, dy, power), now);
    }
    private void settle(AlkkagiMatch m, long now) {
        for (int i = 0; i < 1000 && m.snapshot(0).stage().equals("SIMULATING"); i++) m.advance(now + i * 8);
        assertThat(m.snapshot(0).stage()).isEqualTo("AIMING");
    }
}
