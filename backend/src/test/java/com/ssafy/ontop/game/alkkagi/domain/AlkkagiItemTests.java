package com.ssafy.ontop.game.alkkagi.domain;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class AlkkagiItemTests {
    @Test
    void 손패는_최대두장이고_미사용_종류와_ID는_공개하지_않는다() throws Exception {
        var match = fresh();
        assertThat(match.privateView(0).cards()).isEmpty();
        match.receiveCard(0, "SWAP"); match.receiveCard(0, "EXTRA_SHOT");
        assertThatThrownBy(() -> match.receiveCard(0, "DEFEND")).hasMessage("HAND_FULL");
        assertThat(match.privateView(1).cards()).isEmpty();
        assertThatThrownBy(() -> match.privateView(-1)).hasMessage("PLAYER_REQUIRED");
        String publicJson = new ObjectMapper().writeValueAsString(match.snapshot(0));
        assertThat(publicJson).doesNotContain("SWAP", "EXTRA_SHOT", match.privateView(0).cards().getFirst().id());
    }

    @Test
    void 교환은_확정시만_한번_소모하고_동일요청은_재확인한다() {
        var match = withCard("SWAP");
        var before = match.snapshot(0);
        var use = input(match, "swap", "p11", "p12");
        long version = match.useItem(0, use, 1);
        var after = match.snapshot(1);
        assertThat(after.pieces().get(11).x()).isEqualTo(before.pieces().get(12).x());
        assertThat(after.pieces().get(12).x()).isEqualTo(before.pieces().get(11).x());
        assertThat(match.privateView(0).cards()).isEmpty();
        assertThat(match.useItem(0, use, 40_000)).isEqualTo(version);
        assertThat(after.turnDeadline()).isEqualTo(before.turnDeadline());
        assertThat(after.lastItemEffect().type()).isEqualTo("SWAP");
        assertThatThrownBy(() -> match.useItem(0, new AlkkagiMatch.ItemUse(use.gameId(), "swap", use.expectedVersion(),
                use.cardId(), List.of("p12", "p11")), 2)).hasMessage("ACTION_ID_CONFLICT");
        assertThatThrownBy(() -> match.shoot(0, new AlkkagiMatch.Shot(use.gameId(), "swap", version, "p11", 0, 1, .1), 2))
                .hasMessage("ACTION_ID_CONFLICT");
    }

    @Test
    void 잘못된_대상_권한_버전은_소모하지_않는다() {
        var match = withCard("SWAP");
        assertThatThrownBy(() -> match.useItem(0, input(match, "same", "p11", "p11"), 1)).hasMessage("INVALID_TARGETS");
        assertThatThrownBy(() -> match.useItem(0, input(match, "other", "p11", "p16"), 1)).hasMessage("NOT_YOUR_PIECE");
        assertThatThrownBy(() -> match.useItem(1, input(match, "turn", "p11", "p12"), 1)).hasMessage("NOT_YOUR_TURN");
        var valid = input(match, "stale", "p11", "p12");
        assertThatThrownBy(() -> match.useItem(0, new AlkkagiMatch.ItemUse(valid.gameId(), "stale", 0,
                valid.cardId(), valid.targetPieceIds()), 1)).hasMessage("STALE_VERSION");
        assertThatThrownBy(() -> match.useItem(0, new AlkkagiMatch.ItemUse(valid.gameId(), "forged", valid.expectedVersion(),
                "unknown", valid.targetPieceIds()), 1)).hasMessage("CARD_NOT_OWNED");
        assertThat(match.privateView(0).cards()).hasSize(1);
        assertThat(match.snapshot(1).itemUsedThisTurn()).isFalse();
    }

    @Test
    void 큰알_교환으로_다른알과_겹치면_소모없이_거절한다() {
        // 실제 발사 후 가까워진 알 배치에서, 큰 알이 들어갈 수 없는 자리를 찾는다.
        boolean checked = false;
        for (double power : new double[]{.3, .35, .36, .37, .38, .39, .4, .5, .6}) {
            var match = fresh(); match.start(0);
            fire(match, "approach", "p12", 1, 0, power, 1);
            settle(match, 2);
            if (match.snapshot(2000).turn() == 1) match.advance(match.snapshot(2000).turnDeadline());
            var state = match.snapshot(40_000);
            var king = state.pieces().get(8);
            for (var target : state.pieces()) {
                if (!target.alive() || target.owner() != 0 || target.id().equals(king.id())) continue;
                boolean overlaps = state.pieces().stream().anyMatch(other -> other.alive()
                        && !other.id().equals(king.id()) && !other.id().equals(target.id())
                        && Math.hypot(target.x() - other.x(), target.y() - other.y()) < king.radius() + other.radius() - 1e-6);
                if (!overlaps) continue;
                match.receiveCard(0, "SWAP");
                long now = state.turnDeadline() - 1;
                assertThatThrownBy(() -> match.useItem(0, input(match, "overlap", king.id(), target.id()), now))
                        .hasMessage("ITEM_OVERLAP");
                assertThat(match.privateView(0).cards()).hasSize(1);
                checked = true; break;
            }
            if (checked) break;
        }
        assertThat(checked).as("실제 발사 결과에서 겹침 거절 사례 확인").isTrue();
    }

    @Test
    void 추가발사는_원래_마감시간_안에서만_두번_허용한다() {
        var match = withCard("EXTRA_SHOT");
        long deadline = match.snapshot(0).turnDeadline();
        match.useItem(0, input(match, "extra"), 1);
        fire(match, "first", "p13", 0, -1, .1, 2); settle(match, 3);
        assertThat(match.snapshot(2000).turn()).isZero();
        assertThat(match.snapshot(2000).stage()).isEqualTo("AIMING");
        assertThat(match.snapshot(2000).turnDeadline()).isEqualTo(deadline);
        assertThat(match.snapshot(2000).extraShotsRemaining()).isEqualTo(1);
        fire(match, "second", "p13", 0, -1, .1, 2001); settle(match, 2002);
        assertThat(match.snapshot(4000).turn()).isEqualTo(1);
        assertThat(match.snapshot(4000).extraShotsRemaining()).isZero();
    }

    @Test
    void 추가발사_미사용은_무입력패널티가_아니지만_첫발사도_없으면_무입력이다() {
        var match = withCard("EXTRA_SHOT");
        match.useItem(0, input(match, "extra"), 1);
        fire(match, "first", "p13", 0, -1, .1, 2); settle(match, 3);
        match.advance(30_000);
        assertThat(match.snapshot(30_000).turn()).isEqualTo(1);
        assertThat(match.snapshot(30_000).timeouts()).containsExactly(0, 0);
        var idle = withCard("EXTRA_SHOT"); idle.useItem(0, input(idle, "extra"), 1); idle.advance(30_000);
        assertThat(idle.snapshot(30_000).timeouts()).containsExactly(1, 0);
    }

    @Test
    void 첫발사_정지가_기한을_넘으면_추가발사를_주지_않는다() {
        var match = withCard("EXTRA_SHOT"); match.useItem(0, input(match, "extra"), 1);
        fire(match, "late", "p13", 0, -1, .1, 29_999); settle(match, 30_000);
        assertThat(match.snapshot(32_000).turn()).isEqualTo(1);
        assertThat(match.snapshot(32_000).timeouts()).containsExactly(0, 0);
    }

    @Test
    void 턴당_한개이며_발사후에는_새_아이템을_쓸수_없다() {
        var match = withCard("SWAP"); match.receiveCard(0, "EXTRA_SHOT");
        match.useItem(0, input(match, "swap", "p11", "p12"), 1);
        assertThatThrownBy(() -> match.useItem(0, input(match, "second"), 2)).hasMessage("ITEM_ALREADY_USED_OR_SHOT");
        var late = withCard("EXTRA_SHOT"); fire(late, "shot", "p13", 0, -1, .1, 1);
        assertThatThrownBy(() -> late.useItem(0, input(late, "late"), 2)).hasMessage("NOT_AIMING");
    }

    @Test
    void 접촉중이던_알을_교환한_뒤_이전_접촉이_새_위치를_움직이지_않는다() {
        var base = AlkkagiSettings.provisional();
        var match = new AlkkagiMatch(new AlkkagiSettings(base.halfWidth(), base.halfHeight(), base.stepSeconds(),
                base.deceleration(), 0, base.maximumImpulse(), base.stopSpeed(), base.settleSteps(),
                base.maximumSimulationSteps(), base.turnMillis(), base.matchMillis()));
        match.start(0); fire(match, "contact", "p0", 1, 0, .3, 1); settle(match, 2);
        var before = match.snapshot(2000);
        var touching = before.pieces().get(0); var target = before.pieces().get(1);
        assertThat(Math.hypot(touching.x() - target.x(), touching.y() - target.y()))
                .isLessThan(touching.radius() + target.radius() + .01);
        match.advance(before.turnDeadline()); match.receiveCard(0, "SWAP");
        long now = before.turnDeadline() + 1;
        match.useItem(0, input(match, "swap-contact", "p0", "p11"), now);
        var swapped = match.snapshot(now);
        fire(match, "probe", "p15", 0, 1, .001, now + 1); settle(match, now + 2);
        for (String id : List.of("p11", "p0", "p1")) {
            var a = swapped.pieces().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();
            var b = match.snapshot(now + 2000).pieces().stream().filter(p -> p.id().equals(id)).findFirst().orElseThrow();
            assertThat(Math.hypot(a.x() - b.x(), a.y() - b.y())).as(id).isLessThan(.01);
        }
    }

    private AlkkagiMatch fresh() { return new AlkkagiMatch(AlkkagiSettings.provisional()); }
    private AlkkagiMatch withCard(String type) { var m = fresh(); m.receiveCard(0, type); m.start(0); return m; }
    private AlkkagiMatch.ItemUse input(AlkkagiMatch m, String id, String... targets) {
        var s = m.snapshot(0); return new AlkkagiMatch.ItemUse(s.gameId(), id, s.version(), m.privateView(0).cards().getFirst().id(), List.of(targets));
    }
    private void fire(AlkkagiMatch m, String id, String piece, double dx, double dy, double power, long now) {
        var s = m.snapshot(now); m.shoot(s.turn(), new AlkkagiMatch.Shot(s.gameId(), id, s.version(), piece, dx, dy, power), now);
    }
    private void settle(AlkkagiMatch m, long now) {
        for (int i = 0; i < 1000 && m.snapshot(now).stage().equals("SIMULATING"); i++) m.advance(now + i * 8);
        assertThat(m.snapshot(now).stage()).isNotEqualTo("SIMULATING");
    }
}
