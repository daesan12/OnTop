package com.ssafy.ontop.game.alkkagi.domain;

import java.util.List;
import java.util.Random;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;

class AlkkagiCompletionTests {
    @Test
    void 세개_손실마다_후보를_고르고_같은이정표는_다시_추첨하지_않는다() {
        var inventory = new AlkkagiInventory(); var awards = new AlkkagiCardAwards(new Random(1));
        awards.resolve(13, 16, 0, 0, inventory, 1);
        var offer = awards.offer(0);
        assertThat(offer.options()).hasSize(3); assertThat(offer.options()).extracting(o -> o.type()).doesNotHaveDuplicates();
        assertThat(inventory.cards(0)).isEmpty(); assertThat(awards.offer(1)).isNull();
        awards.resolve(13, 16, 0, 0, inventory, 100); assertThat(awards.offer(0)).isEqualTo(offer);
        awards.choose(0, offer.id(), offer.options().getFirst().id(), 200, 0, inventory);
        assertThat(inventory.cards(0)).hasSize(1);
        awards.resolve(10, 16, 0, 0, inventory, 300); offer = awards.offer(0);
        awards.choose(0, offer.id(), offer.options().getFirst().id(), 400, 0, inventory);
        assertThat(inventory.cards(0)).hasSize(2);
        awards.resolve(7, 16, 0, 0, inventory, 500);
        assertThat(awards.view(0)).extracting(AlkkagiCardAwards.Attempt::result).containsExactly("AWARDED", "AWARDED", "HAND_FULL");
    }

    @Test
    void 동수여도_각자_손실마다_비공개_후보가_생긴다() {
        var hand = new AlkkagiInventory(); var awards = new AlkkagiCardAwards(new Random(2));
        awards.resolve(13, 13, 0, 0, hand, 1);
        var red = awards.offer(0); var green = awards.offer(1);
        assertThat(red).isNotNull(); assertThat(green).isNotNull(); assertThat(red.id()).isNotEqualTo(green.id());
        awards.resolve(12, 13, 0, 0, hand, 2);
        assertThat(awards.offer(0)).isEqualTo(red); assertThat(hand.cards(0)).isEmpty();
    }

    @Test
    void 벽_사용한도를_소진하면_벽은_후보에서_제외한다() {
        var hand = new AlkkagiInventory();
        var awards = new AlkkagiCardAwards(new Random() { @Override public int nextInt(int bound) { return 0; } });
        awards.resolve(13, 16, 3, 0, hand, 1);
        assertThat(awards.offer(0).options()).noneMatch(o -> o.type() == AlkkagiInventory.Type.WALL);
    }

    @Test
    void 실제_세알_탈락_후_본인만_후보를_받고_선택해야_지급된다() throws Exception {
        var m = new AlkkagiMatch(AlkkagiSettings.provisional(), AlkkagiPhysics.experimental(), AlkkagiItemRules.localPreview(), new Random(3));
        m.start(0); long now = 1;
        for (String piece : List.of("p0", "p7", "p8")) {
            fire(m, piece, 0, 1, 1, now); settle(m, now + 1); now += 3000;
            if (m.snapshot(0).stage().equals("CHOOSING")) break;
            if (m.snapshot(0).turn() == 1) { fire(m, "p31", 0, -1, .001, now); settle(m, now + 1); now += 1000; }
        }
        var choice = m.privateView(0).choice(); assertThat(choice).isNotNull();
        assertThat(m.privateView(0).cards()).isEmpty(); assertThat(m.privateView(1).choice()).isNull();
        var json = new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(m.snapshot(now));
        assertThat(json).doesNotContain(choice.id(), choice.options().getFirst().id());
        m.chooseCard(0, new AlkkagiMatch.CardChoice(m.snapshot(0).gameId(), "select", choice.id(), choice.options().getFirst().id()), now);
        assertThat(m.privateView(0).cards()).hasSize(1);
    }

    @Test
    void 기권_재전송은_최초결과이고_시뮬레이션도_더_진행하지_않는다() {
        var m = new AlkkagiMatch(AlkkagiSettings.provisional()); m.start(0);
        fire(m, "p13", 0, -1, .5, 1); m.advance(2);
        long accepted = m.forfeit(0, "quit", 3); var finished = m.snapshot(3);
        assertThat(m.forfeit(0, "quit", 90_000)).isEqualTo(accepted);
        m.advance(90_000);
        assertThat(m.snapshot(90_000).pieces()).isEqualTo(finished.pieces());
        assertThat(m.snapshot(0).winner()).isEqualTo(1); assertThat(m.snapshot(0).endedAt()).isEqualTo(3);
        assertThatThrownBy(() -> m.forfeit(1, "late", 90_000)).hasMessage("GAME_FINISHED");
    }

    @Test
    void 물리프레임은_공통_상태전송_버전이_증가하고_실제_충돌만_기록한다() {
        var m = new AlkkagiMatch(AlkkagiSettings.provisional()); m.receiveCard(0, "WALL"); m.start(0);
        var s = m.snapshot(0); m.useItem(0, new AlkkagiMatch.ItemUse(s.gameId(), "wall", s.version(), m.privateView(0).cards().getFirst().id(),
                List.of(), new AlkkagiMatch.Placement(0, 0, 0)), 1);
        fire(m, "p13", 0, -1, .5, 2); long before = m.snapshot(0).version();
        for (int i = 0; i < 6; i++) m.advance(3 + i * 8);
        assertThat(m.snapshot(0).version()).isGreaterThan(before);
        settle(m, 60);
        assertThat(m.snapshot(0).impacts()).anyMatch(i -> i.kind().equals("WALL") && i.impulse() > .1);
        assertThat(m.snapshot(0).impacts()).hasSizeLessThanOrEqualTo(24);
    }

    private void fire(AlkkagiMatch m, String piece, double dx, double dy, double power, long at) {
        var s = m.snapshot(at); m.shoot(s.turn(), new AlkkagiMatch.Shot(s.gameId(), "shot-" + at, s.version(), piece, dx, dy, power), at);
    }

    @Test
    void 내부_물리수치가_깨져도_유효한_최종위치로_안전종료한다() {
        var m = new AlkkagiMatch(AlkkagiSettings.provisional()); m.start(0); fire(m, "p13", 0, -1, .5, 1);
        // 클라이언트 입력이 아니라 내부 장애를 주입한다. 제품에 주입 API를 추가하지 않는다.
        var pieces = (java.util.Map<?, ?>) org.springframework.test.util.ReflectionTestUtils.getField(m, "pieces");
        var body = (org.dyn4j.dynamics.Body) org.springframework.test.util.ReflectionTestUtils.getField(pieces.get("p13"), "body");
        body.setLinearVelocity(Double.NaN, 0); m.advance(2);
        assertThat(m.snapshot(2).endReason()).isEqualTo("SIMULATION_INVALID");
        assertThat(m.snapshot(2).winner()).isNull();
        assertThat(m.snapshot(2).pieces()).allMatch(p -> Double.isFinite(p.x()) && Double.isFinite(p.y()) && p.vx() == 0 && p.vy() == 0);
    }

    @Test
    void 제한된_가중치_후보와_중복금지_규칙을_유지한다() {
        var rules = new AlkkagiCardRules(List.of(1, 0, 0, 0, 0, 0, 0, 0), false, true);
        var hand = new AlkkagiInventory(); var awards = new AlkkagiCardAwards(new Random(1), rules);
        awards.resolve(13, 16, 0, 0, hand, 1);
        var offer = awards.offer(0); assertThat(offer.options()).hasSize(3);
        assertThat(offer.options()).allMatch(o -> o.type() == AlkkagiInventory.Type.WALL);
        awards.choose(0, offer.id(), offer.options().getFirst().id(), 2, 0, hand);
        awards.resolve(10, 16, 0, 0, hand, 3);
        assertThat(awards.offer(0)).isNull(); assertThat(awards.view(0).getLast().result()).isEqualTo("NO_AVAILABLE_CARD");
        assertThatThrownBy(() -> new AlkkagiCardRules(List.of(0, 0, 0, 0, 0, 0, 0, 0), true, true)).hasMessage("INVALID_CARD_RULES");
    }

    @Test
    void 시작부터_실제_전멸까지_한판을_진행해도_카드한도와_종료가_유지된다() {
        var m = new AlkkagiMatch(AlkkagiSettings.provisional()); m.start(0);
        for (int turn = 0; turn < 80 && !m.snapshot(0).stage().equals("FINISHED"); turn++) {
            var state = m.snapshot(0);
            var piece = state.pieces().stream().filter(p -> p.alive() && p.owner() == state.turn())
                    .min(java.util.Comparator.comparingDouble(p -> Math.min(4.5 - Math.abs(p.x()), 5 - Math.abs(p.y())))).orElseThrow();
            boolean horizontal = 4.5 - Math.abs(piece.x()) < 5 - Math.abs(piece.y());
            fire(m, piece.id(), horizontal ? Math.copySign(1, piece.x()) : 0,
                    horizontal ? 0 : Math.copySign(1, piece.y()), 1, turn * 3000L + 1);
            settle(m, turn * 3000L + 2);
            chooseAll(m, turn * 3000L + 2500);
            assertThat(m.privateView(0).cards()).hasSizeLessThanOrEqualTo(2);
            assertThat(m.privateView(1).cards()).hasSizeLessThanOrEqualTo(2);
            assertThat(m.snapshot(0).pieces()).allMatch(p -> Double.isFinite(p.x()) && Double.isFinite(p.y()));
        }
        var result = m.snapshot(0);
        assertThat(result.stage()).isEqualTo("FINISHED"); assertThat(result.endReason()).isEqualTo("PIECES_OUT");
        assertThat(result.pieces().stream().filter(p -> p.alive() && p.owner() == 0).count() == 0
                || result.pieces().stream().filter(p -> p.alive() && p.owner() == 1).count() == 0).isTrue();
        m.advance(999_999);
        assertThat(m.snapshot(0).version()).isEqualTo(result.version());
    }
    private void chooseAll(AlkkagiMatch m, long now) {
        for (int actor = 0; actor < 2; actor++) {
            while (m.privateView(actor).choice() != null) {
                var c = m.privateView(actor).choice(); m.chooseCard(actor, new AlkkagiMatch.CardChoice(m.snapshot(0).gameId(),
                        "choose-" + actor + "-" + c.losses(), c.id(), c.options().getFirst().id()), now);
            }
        }
    }
    private void settle(AlkkagiMatch m, long at) {
        for (int i = 0; i < 1200 && m.snapshot(at).stage().equals("SIMULATING"); i++) m.advance(at + i * 8);
        assertThat(m.snapshot(at).stage()).isNotEqualTo("SIMULATING");
    }
}
