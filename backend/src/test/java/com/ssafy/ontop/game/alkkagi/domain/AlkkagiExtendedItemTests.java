package com.ssafy.ontop.game.alkkagi.domain;

import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class AlkkagiExtendedItemTests {
    @Test
    void 벽은_실제_충돌하고_상대_다음턴_종료후_소멸한다() {
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
        assertThat(m.snapshot(0).wall()).isNull();
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

    @Test
    void 전체_벽은_한개이며_인당_경기_세번까지만_설치한다() {
        var m = match("WALL");
        long now = 1;
        for (int i = 0; i < 3; i++) {
            if (i > 0) m.receiveCard(0, "WALL");
            use(m, "wall" + i, List.of(), new AlkkagiMatch.Placement(0, 0, 0), now++);
            fire(m, "red" + i, "p15", 0, 1, .001, now++); settle(m, now); now += 1000;
            if (i == 0) m.receiveCard(1, "WALL");
            var blocked = request(m, "blocked" + i, 1, List.of(), new AlkkagiMatch.Placement(2, 0, 0));
            assertThatThrownBy(() -> m.useItem(1, blocked, m.snapshot(0).turnDeadline() - 1)).hasMessage("WALL_ALREADY_EXISTS");
            fire(m, "green" + i, "p31", 0, -1, .001, now++); settle(m, now); now += 1000;
        }
        m.receiveCard(0, "WALL");
        long at = now;
        assertThatThrownBy(() -> use(m, "fourth", List.of(), new AlkkagiMatch.Placement(0, 0, 0), at)).hasMessage("WALL_LIMIT");
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

    @Test
    void 힘강화는_지정알만_한번_발사하며_미발사시_해제한다() {
        var m = match("POWER_UP"); var base = m.snapshot(0).pieces().get(13).launchSpeed();
        use(m, "boost", List.of("p13"), null, 1);
        assertThat(m.snapshot(0).pieces().get(13).launchSpeed()).isEqualTo(base * 1.5);
        assertThatThrownBy(() -> fire(m, "wrong", "p12", 0, -1, .1, 2)).hasMessage("BOOST_TARGET_REQUIRED");
        fire(m, "right", "p13", 0, -1, .1, 2); m.advance(3);
        assertThat(m.snapshot(0).boostedPieceId()).isNull();
        assertThat(m.snapshot(0).pieces().get(13).vy()).isLessThan(-5);
        var idle = match("POWER_UP"); use(idle, "boost", List.of("p13"), null, 1); idle.advance(30_000);
        assertThat(idle.snapshot(0).boostedPieceId()).isNull();
        assertThat(idle.snapshot(0).timeouts()).containsExactly(1, 0);
    }

    @Test
    void 확대축소는_반경과_면적비질량을_바꾸고_상대턴_종료후_원복한다() {
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
            assertThat(m.snapshot(0).pieces().get(13).radius()).isEqualTo(base.radius());
            assertThat(m.snapshot(0).pieces().get(13).mass()).isEqualTo(base.mass());
            assertThat(m.snapshot(0).pieces().get(13).modifier()).isNull();
        }
    }

    @Test
    void 축소원복_공간이_없으면_보류하고_안전해지면_원복한다() {
        var m = match("SHRINK"); use(m, "shrink", List.of("p13"), null, 1);
        m.advance(30_000); // 상대 차례
        m.receiveCard(1, "RELOCATE");
        var request = request(m, "block", 1, List.of("p29"), new AlkkagiMatch.Placement(0, .75, 0));
        m.useItem(1, request, 30_001); m.advance(60_000);
        var blocked = m.snapshot(0).pieces().get(13);
        assertThat(blocked.restorePending()).isTrue(); assertThat(blocked.radius()).isEqualTo(.24 * .8);
        m.receiveCard(0, "RELOCATE"); use(m, "clear", List.of("p13"), new AlkkagiMatch.Placement(1, 1.2, 0), 60_001);
        fire(m, "finish-turn", "p15", 0, 1, .001, 60_002); settle(m, 60_003);
        assertThat(m.snapshot(0).pieces().get(13).restorePending()).isFalse();
        assertThat(m.snapshot(0).pieces().get(13).radius()).isEqualTo(.24);
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
        assertThatThrownBy(() -> new AlkkagiItemRules(1.6, .18, .12, 2, 1.5, 1.25, .8, 2, 0))
                .hasMessage("INVALID_ITEM_RULES");
    }

    @Test
    void 가장자리에_걸쳐_생존한_방어와_확대는_기한에_즉시_원복한다() {
        for (String type : List.of("DEFEND", "GROW")) {
            var m = match(type); use(m, "edge", List.of("p15"), null, 1);
            fire(m, "edge-shot", "p15", 1, 0, .15, 2); settle(m, 3);
            var edge = m.snapshot(0).pieces().get(15);
            assertThat(edge.alive()).isTrue();
            assertThat(edge.x() + edge.radius()).isGreaterThan(4.5);
            m.advance(m.snapshot(0).turnDeadline());
            var restored = m.snapshot(0).pieces().get(15);
            assertThat(restored.modifier()).isNull();
            assertThat(restored.radius()).isEqualTo(.24); assertThat(restored.mass()).isEqualTo(.8);
        }
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
