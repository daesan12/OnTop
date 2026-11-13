package com.ssafy.ontop.game.halligalli;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.halligalli.domain.FruitCard;
import com.ssafy.ontop.game.halligalli.domain.FruitType;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliBellLog;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliDeck;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliMatch;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliTiming;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.assertj.core.api.ThrowableAssert.ThrowingCallable;
import org.junit.jupiter.api.Test;

import static com.ssafy.ontop.game.halligalli.domain.FruitType.BANANA;
import static com.ssafy.ontop.game.halligalli.domain.FruitType.LIME;
import static com.ssafy.ontop.game.halligalli.domain.FruitType.PLUM;
import static com.ssafy.ontop.game.halligalli.domain.FruitType.STRAWBERRY;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class HalliGalliMatchTests {
    private static final Instant START = Instant.parse("2026-11-01T00:00:00Z");
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final long A = 101;
    private static final long B = 202;
    private static final long C = 303;
    private static final long D = 404;

    @Test
    void 같은_과일이_정확히_5개일_때만_정답이다() {
        assertThat(HalliGalliMatch.bellMatches(List.of(card(STRAWBERRY, 2), card(STRAWBERRY, 3)))).isTrue();
        assertThat(HalliGalliMatch.bellMatches(List.of(card(STRAWBERRY, 5), card(BANANA, 2)))).isTrue();
        assertThat(HalliGalliMatch.bellMatches(List.of(card(STRAWBERRY, 1), card(STRAWBERRY, 3)))).isFalse();
        assertThat(HalliGalliMatch.bellMatches(List.of(card(STRAWBERRY, 2), card(STRAWBERRY, 4)))).isFalse();
        assertThat(HalliGalliMatch.bellMatches(List.of(card(LIME, 2), card(PLUM, 3)))).isFalse();
    }

    @Test
    void 다른_과일이_각각_5개여도_정답이다() {
        List<FruitCard> tops = List.of(card(STRAWBERRY, 2), card(STRAWBERRY, 3), card(BANANA, 1), card(BANANA, 4));

        boolean matches = HalliGalliMatch.bellMatches(tops);

        assertThat(matches).isTrue();
    }

    @Test
    void 인원별로_뒷면_카드를_나누고_첫_좌석부터_5초_턴을_연다() {
        HalliGalliMatch two = HalliGalliMatch.create("halli", "table", List.of(A, B), START, new Random(1),
                HalliGalliTiming.DEFAULT);
        HalliGalliMatch three = HalliGalliMatch.create("halli", "table", List.of(A, B, C), START, new Random(1),
                HalliGalliTiming.DEFAULT);
        HalliGalliMatch four = HalliGalliMatch.create("halli", "table", List.of(A, B, C, D), START, new Random(1),
                HalliGalliTiming.DEFAULT);

        assertThat(two.snapshot().publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(28, 28);
        assertThat(three.snapshot().publicPlayers()).extracting(HalliGalliMatch.Player::drawCount)
                .containsExactly(19, 19, 18);
        assertThat(four.snapshot().publicPlayers()).extracting(HalliGalliMatch.Player::drawCount)
                .containsExactly(14, 14, 14, 14);
        assertThat(four.totalCards()).isEqualTo(56);
        assertThat(four.snapshot().turnUserId()).isEqualTo(A);
        assertThat(four.snapshot().turnDeadline()).isEqualTo(START.plusSeconds(5));
        assertThat(four.snapshot().bellWindowId()).isNull();
    }

    @Test
    void 자기_차례가_아니면_카드를_공개할_수_없다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of());

        reject(Rejection.NOT_YOUR_TURN, () -> flip(match, B, "early", START));
        flip(match, A, "first", START);

        assertThat(match.snapshot().publicPlayers().getFirst().faceUpCount()).isEqualTo(1);
        assertThat(match.snapshot().turnUserId()).isEqualTo(B);
        assertThat(match.snapshot().bellWindowId()).isEqualTo(1);
        assertThat(match.snapshot().version()).isEqualTo(1);
    }

    @Test
    void 마감_직전에는_기다리고_5초가_되면_서버가_마감_시각으로_공개한다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of());

        match.expire(START.plusSeconds(5).minusNanos(1));
        long beforeDeadline = match.snapshot().flipSeq();
        match.expire(START.plusSeconds(5));

        assertThat(beforeDeadline).isZero();
        assertThat(match.snapshot().flipSeq()).isEqualTo(1);
        assertThat(match.snapshot().lastEvent()).isEqualTo(new HalliGalliMatch.Event("AUTO_FLIP", A, START.plusSeconds(5), 1, 0));
        assertThat(match.snapshot().turnUserId()).isEqualTo(B);
        assertThat(match.snapshot().turnDeadline()).isEqualTo(START.plusSeconds(10));
    }

    @Test
    void 자동_공개된_턴의_늦은_수동_공개는_다시_공개하지_않는다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of());
        GameActionCommand late = command(A, "late", 0, Map.of("kind", "flip"));

        reject(Rejection.STALE_VERSION, () -> match.apply(late, START.plusSeconds(5).plusMillis(100)));

        assertThat(match.snapshot().publicPlayers().getFirst().faceUpCount()).isEqualTo(1);
        assertThat(match.snapshot().lastEvent().type()).isEqualTo("AUTO_FLIP");
        assertThat(match.snapshot().flipSeq()).isEqualTo(1);
    }

    @Test
    void 마감_전에_수동으로_공개하면_이전_마감에_자동_공개하지_않는다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of());

        flip(match, A, "manual", START.plusMillis(4_900));
        match.expire(START.plusSeconds(5));

        assertThat(match.snapshot().flipSeq()).isEqualTo(1);
        assertThat(match.snapshot().turnDeadline()).isEqualTo(START.plusMillis(9_900));
    }

    @Test
    void 종을_맞히면_모든_공개_더미를_뒷면_맨_아래로_가져가고_결과_연출_뒤_자기_턴이다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3)));
        flip(match, A, "a1", START);
        flip(match, B, "b1", START);

        ring(match, C, "bell", 2, START.plusSeconds(1));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::faceUpCount).containsExactly(0, 0, 0);
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(18, 18, 20);
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_SUCCESS", C, START.plusSeconds(1), 2, 0));
        assertThat(state.bellWindowId()).isNull();
        assertThat(state.turnUserId()).isEqualTo(C);
        assertThat(state.resultUntil()).isEqualTo(START.plusSeconds(2));
        assertThat(state.turnDeadline()).isEqualTo(START.plusSeconds(7));
        assertThat(state.endedAt()).isNull();
        assertThat(match.totalCards()).isEqualTo(56);
    }

    @Test
    void 결과_연출_중에는_공개를_거절한다() {
        HalliGalliMatch match = ringSucceededByC();

        reject(Rejection.INVALID_ACTION, () -> flip(match, C, "too-soon", START.plusMillis(1_500)));

        assertThat(match.snapshot().flipSeq()).isEqualTo(2);
    }

    @Test
    void 결과_연출이_끝나면_새_5초_턴이_시작된다() {
        HalliGalliMatch match = ringSucceededByC();

        match.expire(START.plusSeconds(7).minusNanos(1));
        long beforeDeadline = match.snapshot().flipSeq();
        match.expire(START.plusSeconds(7));

        assertThat(beforeDeadline).isEqualTo(2);
        assertThat(match.snapshot().lastEvent()).isEqualTo(new HalliGalliMatch.Event("AUTO_FLIP", C, START.plusSeconds(7), 1, 0));
        assertThat(match.snapshot().resultUntil()).isNull();
    }

    @Test
    void 결과_연출이_끝난_시점부터_직접_공개할_수_있다() {
        HalliGalliMatch match = ringSucceededByC();

        flip(match, C, "after-pause", START.plusSeconds(2));

        assertThat(match.snapshot().lastEvent().type()).isEqualTo("FLIP");
        assertThat(match.snapshot().turnUserId()).isEqualTo(A);
    }

    @Test
    void 공개_더미의_맨_위_카드만_계산한다() {
        HalliGalliMatch match = match(List.of(A, B, C),
                Map.of(0, card(STRAWBERRY, 3), 1, card(STRAWBERRY, 2), 2, card(LIME, 1), 3, card(BANANA, 1)));
        flip(match, A, "a1", START);
        flip(match, B, "b1", START);
        flip(match, C, "c1", START);
        flip(match, A, "a2", START);

        ring(match, B, "bell", 4, START);

        assertThat(match.snapshot().lastEvent().type()).isEqualTo("RING_PENALTY");
    }

    @Test
    void 종을_잘못_치면_다른_유효_참가자에게_한_장씩_뒷면_맨_아래로_준다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(0, card(STRAWBERRY, 1)));
        flip(match, A, "a1", START);

        ring(match, C, "wrong", 1, START);

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(19, 20, 16);
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_PENALTY", C, START, 2, 0));
        assertThat(state.bellWindowId()).isEqualTo(1);
        assertThat(state.turnUserId()).isEqualTo(B);
        assertThat(state.issuedPenaltyCards()).isZero();
        assertThat(match.isActive(C)).isTrue();
        assertThat(match.totalCards()).isEqualTo(56);
    }

    @Test
    void 벌칙_카드가_모자라면_부족분만_발행해_지급하고_즉시_탈락시킨다() {
        HalliGalliMatch match = match(List.of(A, B, C, D), Map.of(0, card(STRAWBERRY, 1), 1, card(BANANA, 1),
                2, card(LIME, 1), 3, card(PLUM, 4), 4, card(PLUM, 1)));
        flip(match, A, "a1", START);
        flip(match, B, "b1", START);
        flip(match, C, "c1", START);
        flip(match, D, "d1", START);
        for (int count = 0; count < 4; count++) {
            ring(match, D, "wrong-" + count, 4, START);
        }
        int beforeLastPenalty = match.snapshot().publicPlayers().get(3).drawCount();

        ring(match, D, "short", 4, START);

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(beforeLastPenalty).isEqualTo(1);
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_PENALTY", D, START, 3, 2));
        assertThat(state.issuedPenaltyCards()).isEqualTo(2);
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(18, 18, 18, 0);
        assertThat(state.publicPlayers().get(3).eliminated()).isTrue();
        assertThat(state.publicPlayers().get(3).topCard()).isEqualTo(card(PLUM, 4));
        assertThat(match.totalCards()).isEqualTo(56 + 2);
        assertThat(state.endedAt()).isNull();
        reject(Rejection.INVALID_ACTION, () -> ring(match, D, "out", 4, START));
    }

    @Test
    void 탈락자의_공개_카드도_종_판정에_넣고_성공하면_함께_수거한다() {
        HalliGalliMatch match = match(List.of(A, B, C, D), Map.of(0, card(STRAWBERRY, 1), 1, card(BANANA, 1),
                2, card(LIME, 1), 3, card(PLUM, 4), 4, card(PLUM, 1)));
        flip(match, A, "a1", START);
        flip(match, B, "b1", START);
        flip(match, C, "c1", START);
        flip(match, D, "d1", START);
        for (int count = 0; count < 5; count++) {
            ring(match, D, "wrong-" + count, 4, START);
        }
        flip(match, A, "a2", START);

        ring(match, B, "plum", 5, START);

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_SUCCESS", B, START, 5, 0));
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::faceUpCount).containsExactly(0, 0, 0, 0);
        assertThat(state.endedAt()).isNull();
        assertThat(match.totalCards()).isEqualTo(58);
    }

    @Test
    void 지난_창의_늦은_종은_새_공개_카드로_판정하지_않고_벌칙도_없다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3)));
        flip(match, A, "a1", START);
        flip(match, B, "b1", START);
        HalliGalliMatch.Snapshot before = match.snapshot();

        reject(Rejection.STALE_VERSION, () -> ring(match, C, "old", 1, START));
        reject(Rejection.INVALID_ACTION, () -> ring(match, C, "future", 3, START));

        assertThat(match.snapshot()).isEqualTo(before);
    }

    @Test
    void 같은_창에서_늦게_도착한_정답_종은_벌칙없이_거절한다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3)));
        flip(match, A, "a1", START);
        flip(match, B, "b1", START);
        ring(match, C, "first", 2, START);
        HalliGalliMatch.Snapshot afterWinner = match.snapshot();

        reject(Rejection.STALE_VERSION, () -> ring(match, A, "second", 2, START));

        assertThat(match.snapshot()).isEqualTo(afterWinner);
    }

    @Test
    void 같은_행동을_다시_보내면_벌칙을_반복하지_않고_기존_결과를_돌려준다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(0, card(STRAWBERRY, 1)));
        flip(match, A, "a1", START);
        GameActionCommand wrong = command(C, "wrong", 1, Map.of("kind", "ring", "bellWindowId", 1));
        GameActionResult first = match.apply(wrong, START);
        HalliGalliMatch.Snapshot afterPenalty = match.snapshot();

        GameActionResult repeated = match.apply(wrong, START.plusSeconds(1));

        assertThat(repeated).isEqualTo(first);
        assertThat(match.snapshot()).isEqualTo(afterPenalty);
    }

    @Test
    void 같은_행동_번호에_다른_입력을_보내면_충돌이다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(0, card(STRAWBERRY, 1)));
        flip(match, A, "a1", START);
        match.apply(command(C, "bell", 1, Map.of("kind", "ring", "bellWindowId", 1)), START);

        reject(Rejection.ACTION_ID_CONFLICT,
                () -> match.apply(command(C, "bell", 1, Map.of("kind", "flip")), START));
        reject(Rejection.ACTION_ID_CONFLICT,
                () -> match.apply(command(C, "bell", 2, Map.of("kind", "ring", "bellWindowId", 1)), START));
    }

    @Test
    void 뒷면이_비어도_공개_더미가_있으면_남고_전부_수거되어야_탈락한다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(51, card(BANANA, 4), 52, card(LIME, 2),
                53, card(BANANA, 1), 54, card(STRAWBERRY, 2), 55, card(STRAWBERRY, 3)));
        match.expire(START.plusSeconds(270));
        boolean activeWithoutDrawPile = match.isActive(C);
        int drawPileOfC = match.snapshot().publicPlayers().get(2).drawCount();

        ring(match, A, "bell", 54, START.plusSeconds(271));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(drawPileOfC).isZero();
        assertThat(activeWithoutDrawPile).isTrue();
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(55, 1, 0);
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::eliminated).containsExactly(false, false, true);
        assertThat(state.issuedPenaltyCards()).isZero();
        assertThat(state.endedAt()).isNull();
        assertThat(state.turnUserId()).isEqualTo(A);
    }

    @Test
    void 처음_3인이면_탈락으로_2인이_된_뒤의_정답도_카드_수로_끝내지_않고_계속한다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(51, card(BANANA, 4), 52, card(LIME, 2),
                53, card(BANANA, 1), 54, card(STRAWBERRY, 2), 55, card(STRAWBERRY, 3)));
        match.expire(START.plusSeconds(270));
        ring(match, A, "bell", 54, START.plusSeconds(271));
        flip(match, A, "a-last", START.plusSeconds(272));
        flip(match, B, "b-last", START.plusSeconds(272));

        ring(match, B, "bell-two", 56, START.plusSeconds(273));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_SUCCESS", B, START.plusSeconds(273), 2, 0));
        assertThat(state.endedAt()).isNull();
        assertThat(state.endReason()).isNull();
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(54, 2, 0);
        assertThat(state.turnUserId()).isEqualTo(B);
        assertThat(state.resultUntil()).isEqualTo(START.plusSeconds(274));
        assertThat(match.totalCards()).isEqualTo(56);
    }

    @Test
    void 처음부터_2인이면_첫_정답_뒤에도_경기를_계속한다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3)));
        flip(match, A, "a1", START);
        flip(match, B, "b1", START);

        ring(match, A, "bell", 2, START);
        HalliGalliMatch.Snapshot afterRing = match.snapshot();
        flip(match, A, "a2", START.plusSeconds(1));

        assertThat(afterRing.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_SUCCESS", A, START, 2, 0));
        assertThat(afterRing.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(29, 27);
        assertThat(afterRing.endedAt()).isNull();
        assertThat(afterRing.turnUserId()).isEqualTo(A);
        assertThat(afterRing.resultUntil()).isEqualTo(START.plusSeconds(1));
        assertThat(match.snapshot().lastEvent().type()).isEqualTo("FLIP");
        assertThat(match.snapshot().turnUserId()).isEqualTo(B);
        assertThat(match.totalCards()).isEqualTo(56);
    }

    @Test
    void 처음부터_2인이면_첫_오답에_일반_벌칙을_주고_경기를_계속한다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of(0, card(STRAWBERRY, 1)));
        flip(match, A, "a1", START);

        ring(match, B, "wrong", 1, START);
        HalliGalliMatch.Snapshot afterRing = match.snapshot();
        flip(match, B, "b1", START);

        assertThat(afterRing.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_PENALTY", B, START, 1, 0));
        assertThat(afterRing.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(28, 27);
        assertThat(afterRing.publicPlayers()).extracting(HalliGalliMatch.Player::faceUpCount).containsExactly(1, 0);
        assertThat(afterRing.bellWindowId()).isEqualTo(1);
        assertThat(afterRing.issuedPenaltyCards()).isZero();
        assertThat(afterRing.endedAt()).isNull();
        assertThat(match.snapshot().turnUserId()).isEqualTo(A);
        assertThat(match.totalCards()).isEqualTo(56);
    }

    @Test
    void 처음부터_2인이면_벌칙_카드가_모자랄_때_발행해_주고_탈락시켜_종료한다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of());
        match.expire(START.plusSeconds(275));
        boolean activeWithoutDrawPile = match.isActive(A);

        ring(match, A, "wrong", 55, START.plusSeconds(276));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(activeWithoutDrawPile).isTrue();
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_PENALTY", A, START.plusSeconds(276), 1, 1));
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(0, 2);
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::eliminated).containsExactly(true, false);
        assertThat(state.endReason()).isEqualTo(HalliGalliMatch.LAST_PLAYER_STANDING);
        assertThat(state.winnerUserIds()).containsExactly(B);
        assertThat(state.issuedPenaltyCards()).isEqualTo(1);
        assertThat(match.totalCards()).isEqualTo(56 + 1);
    }

    @Test
    void 처음부터_2인이면_상대_카드를_모두_수거한_사람이_마지막_생존자로_이긴다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of(53, card(STRAWBERRY, 2), 54, card(STRAWBERRY, 3)));
        match.expire(START.plusSeconds(275));

        ring(match, B, "bell", 55, START.plusSeconds(276));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_SUCCESS", B, START.plusSeconds(276), 55, 0));
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(0, 56);
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::eliminated).containsExactly(true, false);
        assertThat(state.endReason()).isEqualTo(HalliGalliMatch.LAST_PLAYER_STANDING);
        assertThat(state.winnerUserIds()).containsExactly(B);
        assertThat(match.totalCards()).isEqualTo(56);
    }

    @Test
    void 처음_3인이면_탈락으로_2인이_된_뒤의_오답도_일반_벌칙을_주고_계속한다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(0, card(STRAWBERRY, 1)));
        flip(match, A, "a1", START);
        for (int count = 0; count < 9; count++) {
            ring(match, C, "wrong-" + count, 1, START);
        }
        HalliGalliMatch.Snapshot twoLeft = match.snapshot();

        ring(match, B, "two-wrong", 1, START);

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(twoLeft.publicPlayers()).extracting(HalliGalliMatch.Player::eliminated)
                .containsExactly(false, false, true);
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_PENALTY", B, START, 1, 0));
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(28, 27, 0);
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::faceUpCount).containsExactly(1, 0, 0);
        assertThat(state.endedAt()).isNull();
        assertThat(state.turnUserId()).isEqualTo(B);
        assertThat(state.bellWindowId()).isEqualTo(1);
        assertThat(match.totalCards()).isEqualTo(56);
    }

    @Test
    void 처음_4인이면_탈락으로_2인이_된_뒤의_정답도_카드_수로_끝내지_않고_계속한다() {
        HalliGalliMatch match = match(List.of(A, B, C, D), Map.of(0, card(STRAWBERRY, 1), 1, card(STRAWBERRY, 4)));
        flip(match, A, "a1", START);
        for (int count = 0; count < 5; count++) {
            ring(match, D, "d-wrong-" + count, 1, START);
        }
        for (int count = 0; count < 10; count++) {
            ring(match, C, "c-wrong-" + count, 1, START);
        }
        HalliGalliMatch.Snapshot twoLeft = match.snapshot();
        flip(match, B, "b1", START);

        ring(match, A, "bell-two", 2, START);

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(twoLeft.publicPlayers()).extracting(HalliGalliMatch.Player::eliminated)
                .containsExactly(false, false, true, true);
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_SUCCESS", A, START, 2, 0));
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(30, 28, 0, 0);
        assertThat(state.endedAt()).isNull();
        assertThat(state.turnUserId()).isEqualTo(A);
        assertThat(state.issuedPenaltyCards()).isEqualTo(2);
        assertThat(match.totalCards()).isEqualTo(56 + 2);
    }

    @Test
    void 처음_3인이면_탈락으로_2인이_된_뒤의_오답에도_상대가_공개_더미를_가져가지_않는다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(51, card(BANANA, 4), 52, card(LIME, 2),
                53, card(BANANA, 1), 54, card(STRAWBERRY, 2), 55, card(STRAWBERRY, 3)));
        match.expire(START.plusSeconds(270));
        ring(match, A, "bell", 54, START.plusSeconds(271));
        flip(match, A, "a-last", START.plusSeconds(272));

        ring(match, B, "wrong", 55, START.plusSeconds(273));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_PENALTY", B, START.plusSeconds(273), 1, 0));
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(55, 0, 0);
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::faceUpCount).containsExactly(1, 0, 0);
        assertThat(state.endReason()).isEqualTo(HalliGalliMatch.LAST_PLAYER_STANDING);
        assertThat(state.winnerUserIds()).containsExactly(A);
        assertThat(match.totalCards()).isEqualTo(56);
    }

    @Test
    void 처음_3인이면_탈락으로_2인이_된_뒤의_오답에도_뒷면이_모자라면_발행해_주고_탈락시킨다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(51, card(BANANA, 4), 52, card(LIME, 2),
                53, card(BANANA, 1), 54, card(STRAWBERRY, 2), 55, card(STRAWBERRY, 1)));
        match.expire(START.plusSeconds(270));
        ring(match, A, "bell", 54, START.plusSeconds(271));
        flip(match, A, "a-last", START.plusSeconds(272));
        flip(match, B, "b-last", START.plusSeconds(272));

        ring(match, B, "wrong", 56, START.plusSeconds(273));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_PENALTY", B, START.plusSeconds(273), 1, 1));
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(55, 0, 0);
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::eliminated).containsExactly(false, true, true);
        assertThat(state.issuedPenaltyCards()).isEqualTo(1);
        assertThat(state.endReason()).isEqualTo(HalliGalliMatch.LAST_PLAYER_STANDING);
        assertThat(state.winnerUserIds()).containsExactly(A);
        assertThat(match.totalCards()).isEqualTo(56 + 1);
    }

    @Test
    void 활성_2명에서_마지막_카드를_공개한_직후에는_끝나지_않고_상대_차례로_넘어간다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of());

        match.expire(START.plusSeconds(275));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("AUTO_FLIP", A, START.plusSeconds(275), 1, 0));
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(0, 1);
        assertThat(match.isActive(A)).isTrue();
        assertThat(state.endedAt()).isNull();
        assertThat(state.turnUserId()).isEqualTo(B);
        assertThat(state.turnDeadline()).isEqualTo(START.plusSeconds(280));
        assertThat(state.bellWindowId()).isEqualTo(55);
    }

    @Test
    void 활성_2명에서_뒷면이_빈_참가자의_차례가_오면_5초_마지막_종_기회를_연다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of());
        match.expire(START.plusSeconds(275));

        flip(match, B, "b-last", START.plusSeconds(276));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(0, 0);
        assertThat(state.endedAt()).isNull();
        assertThat(state.turnUserId()).isEqualTo(A);
        assertThat(state.turnDeadline()).isEqualTo(START.plusSeconds(281));
        assertThat(state.bellWindowId()).isEqualTo(56);
    }

    @Test
    void 마지막_종_기회에는_공개를_거절하고_자동_공개도_하지_않으며_마감에_상대가_이긴다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of(54, card(STRAWBERRY, 1), 55, card(BANANA, 1)));
        match.expire(START.plusSeconds(280));
        HalliGalliMatch.Snapshot waiting = match.snapshot();

        reject(Rejection.INVALID_ACTION, () -> flip(match, A, "nothing", START.plusSeconds(281)));
        reject(Rejection.NOT_YOUR_TURN, () -> flip(match, B, "not-mine", START.plusSeconds(281)));
        match.expire(START.plusSeconds(285).minusNanos(1));
        HalliGalliMatch.Snapshot beforeDeadline = match.snapshot();
        match.expire(START.plusSeconds(285));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(waiting.turnUserId()).isEqualTo(A);
        assertThat(waiting.turnDeadline()).isEqualTo(START.plusSeconds(285));
        assertThat(waiting.bellWindowId()).isEqualTo(56);
        assertThat(beforeDeadline.version()).isEqualTo(waiting.version());
        assertThat(beforeDeadline.flipSeq()).isEqualTo(56);
        assertThat(beforeDeadline.endedAt()).isNull();
        assertThat(state.flipSeq()).isEqualTo(56);
        assertThat(state.endReason()).isEqualTo(HalliGalliMatch.NO_CARDS_TO_FLIP);
        assertThat(state.endedAt()).isEqualTo(START.plusSeconds(285));
        assertThat(state.winnerUserIds()).containsExactly(B);
        assertThat(state.turnUserId()).isNull();
        assertThat(state.turnDeadline()).isNull();
        assertThat(state.bellWindowId()).isNull();
        assertThat(match.totalCards()).isEqualTo(56);
        reject(Rejection.INVALID_ACTION, () -> ring(match, A, "after-end", 56, START.plusSeconds(286)));
    }

    @Test
    void 늦은_자동_처리도_마감을_차례로_따라잡아_마지막_종_기회_마감_시각에_한_번만_끝낸다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of(54, card(STRAWBERRY, 1), 55, card(BANANA, 1)));

        match.expire(START.plusSeconds(400));
        HalliGalliMatch.Snapshot state = match.snapshot();
        match.expire(START.plusSeconds(500));

        assertThat(state.flipSeq()).isEqualTo(56);
        assertThat(state.endReason()).isEqualTo(HalliGalliMatch.NO_CARDS_TO_FLIP);
        assertThat(state.endedAt()).isEqualTo(START.plusSeconds(285));
        assertThat(state.winnerUserIds()).containsExactly(B);
        assertThat(match.snapshot()).isEqualTo(state);
    }

    @Test
    void 마지막_종_기회에_종을_맞히면_카드를_얻고_결과_연출_뒤_정상_차례로_돌아간다() {
        HalliGalliMatch match = lastChanceOfA(card(STRAWBERRY, 2), card(STRAWBERRY, 3));
        HalliGalliMatch.Snapshot waiting = match.snapshot();

        ring(match, A, "bell", 54, START.plusSeconds(266));
        HalliGalliMatch.Snapshot afterRing = match.snapshot();
        match.expire(START.plusSeconds(272));

        assertThat(waiting.turnUserId()).isEqualTo(A);
        assertThat(waiting.turnDeadline()).isEqualTo(START.plusSeconds(270));
        assertThat(waiting.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(0, 2);
        assertThat(afterRing.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_SUCCESS", A, START.plusSeconds(266), 54, 0));
        assertThat(afterRing.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(54, 2);
        assertThat(afterRing.endedAt()).isNull();
        assertThat(afterRing.turnUserId()).isEqualTo(A);
        assertThat(afterRing.resultUntil()).isEqualTo(START.plusSeconds(267));
        assertThat(afterRing.turnDeadline()).isEqualTo(START.plusSeconds(272));
        assertThat(match.snapshot().lastEvent()).isEqualTo(new HalliGalliMatch.Event("AUTO_FLIP", A, START.plusSeconds(272), 1, 0));
        assertThat(match.snapshot().endedAt()).isNull();
        assertThat(match.snapshot().turnUserId()).isEqualTo(B);
        assertThat(match.totalCards()).isEqualTo(56);
    }

    @Test
    void 마지막_종_기회에_상대가_종을_맞히면_공개_더미를_잃은_참가자가_탈락한다() {
        HalliGalliMatch match = lastChanceOfA(card(STRAWBERRY, 2), card(STRAWBERRY, 3));

        ring(match, B, "bell", 54, START.plusSeconds(266));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_SUCCESS", B, START.plusSeconds(266), 54, 0));
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::eliminated).containsExactly(true, false);
        assertThat(state.endReason()).isEqualTo(HalliGalliMatch.LAST_PLAYER_STANDING);
        assertThat(state.winnerUserIds()).containsExactly(B);
        assertThat(match.totalCards()).isEqualTo(56);
    }

    @Test
    void 마지막_종_기회_마감_직전_상대의_오답_벌칙_카드를_받으면_새_5초_공개_차례가_된다() {
        HalliGalliMatch match = lastChanceOfA(card(BANANA, 1), card(LIME, 2));
        Instant justBefore = START.plusSeconds(270).minusMillis(100);

        ring(match, B, "wrong", 54, justBefore);
        HalliGalliMatch.Snapshot afterRing = match.snapshot();
        match.expire(justBefore.plusSeconds(5).minusNanos(1));
        HalliGalliMatch.Snapshot beforeNewDeadline = match.snapshot();
        match.expire(justBefore.plusSeconds(5));

        assertThat(afterRing.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_PENALTY", B, justBefore, 1, 0));
        assertThat(afterRing.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(1, 1);
        assertThat(afterRing.turnUserId()).isEqualTo(A);
        assertThat(afterRing.turnDeadline()).isEqualTo(justBefore.plusSeconds(5));
        assertThat(beforeNewDeadline.version()).isEqualTo(afterRing.version());
        assertThat(beforeNewDeadline.flipSeq()).isEqualTo(54);
        assertThat(beforeNewDeadline.endedAt()).isNull();
        assertThat(match.snapshot().lastEvent()).isEqualTo(new HalliGalliMatch.Event("AUTO_FLIP", A, justBefore.plusSeconds(5), 1, 0));
        assertThat(match.snapshot().endedAt()).isNull();
        assertThat(match.snapshot().turnUserId()).isEqualTo(B);
        assertThat(match.totalCards()).isEqualTo(56);
    }

    @Test
    void 마지막_종_기회에_벌칙_카드를_받은_참가자는_새_차례에_바로_직접_공개할_수_있다() {
        HalliGalliMatch match = lastChanceOfA(card(BANANA, 1), card(LIME, 2));
        ring(match, B, "wrong", 54, START.plusSeconds(268));

        flip(match, A, "a-again", START.plusSeconds(269));

        assertThat(match.snapshot().lastEvent()).isEqualTo(new HalliGalliMatch.Event("FLIP", A, START.plusSeconds(269), 1, 0));
        assertThat(match.snapshot().turnUserId()).isEqualTo(B);
        assertThat(match.snapshot().turnDeadline()).isEqualTo(START.plusSeconds(274));
    }

    @Test
    void 활성_2명의_일반_오답은_공개_차례의_마감을_바꾸지_않는다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of(0, card(STRAWBERRY, 1)));
        flip(match, A, "a1", START);
        HalliGalliMatch.Snapshot turnOfB = match.snapshot();

        ring(match, A, "a-wrong", 1, START.plusSeconds(3));
        HalliGalliMatch.Snapshot afterA = match.snapshot();
        ring(match, B, "b-wrong", 1, START.plusSeconds(4));
        HalliGalliMatch.Snapshot afterB = match.snapshot();
        match.expire(START.plusSeconds(5));

        assertThat(turnOfB.turnDeadline()).isEqualTo(START.plusSeconds(5));
        assertThat(afterA.turnUserId()).isEqualTo(B);
        assertThat(afterA.turnDeadline()).isEqualTo(START.plusSeconds(5));
        assertThat(afterB.turnUserId()).isEqualTo(B);
        assertThat(afterB.turnDeadline()).isEqualTo(START.plusSeconds(5));
        assertThat(match.snapshot().lastEvent()).isEqualTo(new HalliGalliMatch.Event("AUTO_FLIP", B, START.plusSeconds(5), 1, 0));
    }

    @Test
    void 활성_3명_이상의_오답은_뒷면이_빈_참가자에게_카드가_가도_차례와_마감을_바꾸지_않는다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(51, card(BANANA, 4), 52, card(LIME, 2), 53, card(STRAWBERRY, 1)));
        match.expire(START.plusSeconds(270));
        HalliGalliMatch.Snapshot before = match.snapshot();

        ring(match, B, "wrong", 54, START.plusSeconds(274));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(before.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(1, 1, 0);
        assertThat(before.turnUserId()).isEqualTo(A);
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_PENALTY", B, START.plusSeconds(274), 2, 1));
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(2, 0, 1);
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::eliminated).containsExactly(false, true, false);
        assertThat(state.turnUserId()).isEqualTo(A);
        assertThat(state.turnDeadline()).isEqualTo(START.plusSeconds(275));
        match.expire(START.plusSeconds(275));
        assertThat(match.snapshot().lastEvent()).isEqualTo(new HalliGalliMatch.Event("AUTO_FLIP", A, START.plusSeconds(275), 1, 0));
        assertThat(match.snapshot().turnUserId()).isEqualTo(C);
    }

    @Test
    void 마지막_종_기회에_본인이_종을_잘못_치면_일반_벌칙으로_발행해_주고_탈락한다() {
        HalliGalliMatch match = lastChanceOfA(card(BANANA, 1), card(LIME, 2));

        ring(match, A, "last-wrong", 54, START.plusSeconds(266));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_PENALTY", A, START.plusSeconds(266), 1, 1));
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(0, 3);
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::eliminated).containsExactly(true, false);
        assertThat(state.endReason()).isEqualTo(HalliGalliMatch.LAST_PLAYER_STANDING);
        assertThat(state.endedAt()).isEqualTo(START.plusSeconds(266));
        assertThat(state.winnerUserIds()).containsExactly(B);
        assertThat(match.totalCards()).isEqualTo(56 + 1);
    }

    @Test
    void 활성_2명에서_자기_차례에_벌칙으로_마지막_뒷면_카드를_내면_새_5초_마지막_종_기회가_된다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of());
        match.expire(START.plusSeconds(275));

        ring(match, B, "wrong", 55, START.plusSeconds(276));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.lastEvent()).isEqualTo(new HalliGalliMatch.Event("RING_PENALTY", B, START.plusSeconds(276), 1, 0));
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(1, 0);
        assertThat(state.turnUserId()).isEqualTo(B);
        assertThat(state.turnDeadline()).isEqualTo(START.plusSeconds(281));
        reject(Rejection.NOT_YOUR_TURN, () -> flip(match, A, "not-mine", START.plusSeconds(277)));
        match.expire(START.plusSeconds(281));
        assertThat(match.snapshot().endReason()).isEqualTo(HalliGalliMatch.NO_CARDS_TO_FLIP);
        assertThat(match.snapshot().winnerUserIds()).containsExactly(A);
        assertThat(match.snapshot().endedAt()).isEqualTo(START.plusSeconds(281));
    }

    @Test
    void 마지막_종_기회_중_상대가_기권하면_남은_참가자가_마지막_생존자로_이긴다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of());
        match.expire(START.plusSeconds(280));

        match.forfeit(B, START.plusSeconds(281));
        match.expire(START.plusSeconds(290));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.endReason()).isEqualTo(HalliGalliMatch.LAST_PLAYER_STANDING);
        assertThat(state.endedAt()).isEqualTo(START.plusSeconds(281));
        assertThat(state.winnerUserIds()).containsExactly(A);
    }

    @Test
    void 활성_3명_이상이면_뒷면이_빈_참가자의_차례를_건너뛰고_그_참가자도_종을_칠_수_있다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(0, card(STRAWBERRY, 1)));
        flip(match, A, "a1", START);
        ring(match, C, "wrong", 1, START);

        match.expire(START.plusSeconds(245));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(3, 3, 0);
        assertThat(match.isActive(C)).isTrue();
        assertThat(state.turnUserId()).isEqualTo(A);
        assertThat(state.turnDeadline()).isEqualTo(START.plusSeconds(250));
        assertThat(state.endedAt()).isNull();
    }

    @Test
    void 활성_3명_이상이면_아무도_공개할_카드가_없을_때_마지막_종_기회_뒤_카드_수로_종료한다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of());
        match.expire(START.plusSeconds(280));
        HalliGalliMatch.Snapshot waiting = match.snapshot();

        match.expire(START.plusSeconds(285));

        assertThat(waiting.turnUserId()).isNull();
        assertThat(waiting.endedAt()).isNull();
        assertThat(match.snapshot().endReason()).isEqualTo(HalliGalliMatch.NO_CARDS_TO_FLIP);
        assertThat(match.snapshot().endedAt()).isEqualTo(START.plusSeconds(285));
        assertThat(match.snapshot().winnerUserIds()).containsExactly(A, B);
        assertThat(match.totalCards()).isEqualTo(56);
    }

    @Test
    void 뒷면이_빈_참가자가_있는_3인에서_기권으로_2인이_되면_그_참가자의_다음_차례가_마지막_종_기회다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of());
        match.expire(START.plusSeconds(270));

        match.forfeit(B, START.plusSeconds(271));
        HalliGalliMatch.Snapshot twoLeft = match.snapshot();
        flip(match, A, "a-last", START.plusSeconds(272));
        HalliGalliMatch.Snapshot waiting = match.snapshot();
        match.expire(START.plusSeconds(277));

        assertThat(twoLeft.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(1, 1, 0);
        assertThat(twoLeft.turnUserId()).isEqualTo(A);
        assertThat(twoLeft.turnDeadline()).isEqualTo(START.plusSeconds(275));
        assertThat(waiting.turnUserId()).isEqualTo(C);
        assertThat(waiting.turnDeadline()).isEqualTo(START.plusSeconds(277));
        assertThat(waiting.endedAt()).isNull();
        assertThat(match.snapshot().endReason()).isEqualTo(HalliGalliMatch.NO_CARDS_TO_FLIP);
        assertThat(match.snapshot().winnerUserIds()).containsExactly(A);
    }

    @Test
    void 공개_차례인_참가자가_기권해_2인이_되면_뒷면이_빈_다음_좌석에_바로_마지막_종_기회를_준다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of());
        match.expire(START.plusSeconds(275));

        match.forfeit(B, START.plusSeconds(276));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.publicPlayers()).extracting(HalliGalliMatch.Player::drawCount).containsExactly(0, 1, 0);
        assertThat(state.turnUserId()).isEqualTo(C);
        assertThat(state.turnDeadline()).isEqualTo(START.plusSeconds(281));
        match.expire(START.plusSeconds(281));
        assertThat(match.snapshot().endReason()).isEqualTo(HalliGalliMatch.NO_CARDS_TO_FLIP);
        assertThat(match.snapshot().winnerUserIds()).containsExactly(A);
    }

    @Test
    void 아무도_공개할_수_없던_3인에서_기권으로_2인이_되면_다음_좌석의_마지막_종_기회로_바꾼다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of());
        match.expire(START.plusSeconds(280));
        HalliGalliMatch.Snapshot noTurn = match.snapshot();

        match.forfeit(C, START.plusSeconds(281));
        match.expire(START.plusSeconds(285));
        HalliGalliMatch.Snapshot afterOldDeadline = match.snapshot();
        match.expire(START.plusSeconds(286));

        assertThat(noTurn.turnUserId()).isNull();
        assertThat(afterOldDeadline.endedAt()).isNull();
        assertThat(afterOldDeadline.turnUserId()).isEqualTo(A);
        assertThat(afterOldDeadline.turnDeadline()).isEqualTo(START.plusSeconds(286));
        assertThat(match.snapshot().endReason()).isEqualTo(HalliGalliMatch.NO_CARDS_TO_FLIP);
        assertThat(match.snapshot().endedAt()).isEqualTo(START.plusSeconds(286));
        assertThat(match.snapshot().winnerUserIds()).containsExactly(B);
    }

    @Test
    void 공개할_카드가_없어도_마감_전_5초_동안은_종을_판정한다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of(54, card(STRAWBERRY, 1), 55, card(BANANA, 1)));
        match.expire(START.plusSeconds(280));

        ring(match, A, "last-chance", 56, START.plusSeconds(285).minusNanos(1));

        HalliGalliMatch.Snapshot state = match.snapshot();
        assertThat(state.lastEvent()).isEqualTo(
                new HalliGalliMatch.Event("RING_PENALTY", A, START.plusSeconds(285).minusNanos(1), 1, 1));
        assertThat(state.endedAt()).isEqualTo(START.plusSeconds(285).minusNanos(1));
        assertThat(state.endReason()).isEqualTo(HalliGalliMatch.LAST_PLAYER_STANDING);
        assertThat(state.winnerUserIds()).containsExactly(B);
        assertThat(match.totalCards()).isEqualTo(56 + 1);
    }

    @Test
    void 연출_시간은_설정값을_따른다() {
        HalliGalliTiming timing = new HalliGalliTiming(Duration.ofSeconds(5), Duration.ofMillis(300));
        HalliGalliMatch match = new HalliGalliMatch("halli", "table", List.of(A, B, C),
                deck(Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3))), START, new Random(5), timing);
        flip(match, A, "a1", START);
        flip(match, B, "b1", START);

        ring(match, C, "bell", 2, START);

        assertThat(match.snapshot().resultUntil()).isEqualTo(START.plusMillis(300));
        assertThat(match.snapshot().turnDeadline()).isEqualTo(START.plusMillis(5_300));
    }

    @Test
    void 종_기록은_창을_연_공개부터_맞힌_종까지의_반응_시간과_늦은_종을_센다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3)));
        flip(match, A, "a1", START);
        flip(match, B, "b1", START.plusMillis(100));

        ring(match, C, "bell", 2, START.plusMillis(520));
        reject(Rejection.STALE_VERSION, () -> ring(match, A, "late", 2, START.plusMillis(700)));

        assertThat(match.bellSummaries()).containsExactly(
                new HalliGalliBellLog.Summary(A, 0, 0, 1, null, null, null, 0, 0),
                new HalliGalliBellLog.Summary(B, 0, 0, 0, null, null, null, 0, 0),
                new HalliGalliBellLog.Summary(C, 1, 0, 0, 420, 420, 420, 0, 0));
    }

    @Test
    void 늦은_종은_남이_가져간_창에_한_사람당_한_번만_세고_가져간_사람의_연타와_지난_창은_세지_않는다() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3)));
        reject(Rejection.INVALID_ACTION, () -> ring(match, B, "before-any-card", 1, START));
        flip(match, A, "a1", START);
        flip(match, B, "b1", START);
        ring(match, C, "bell", 2, START.plusMillis(500));

        reject(Rejection.STALE_VERSION, () -> ring(match, A, "late-1", 2, START.plusMillis(600)));
        reject(Rejection.STALE_VERSION, () -> ring(match, A, "late-2", 2, START.plusMillis(650)));
        reject(Rejection.STALE_VERSION, () -> ring(match, A, "late-1", 2, START.plusMillis(700)));
        reject(Rejection.STALE_VERSION, () -> ring(match, C, "double", 2, START.plusMillis(600)));
        // 결과 연출 뒤 새 카드가 공개되면 창 2는 경쟁이 끝난 지난 창이다.
        flip(match, C, "c1", START.plusMillis(1_500));
        reject(Rejection.STALE_VERSION, () -> ring(match, B, "old-window", 2, START.plusMillis(1_600)));

        assertThat(match.bellSummaries()).extracting(HalliGalliBellLog.Summary::lateRings).containsExactly(1, 0, 0);
    }

    @Test
    void 틀린_종은_벌칙_횟수만_세고_반응_시간에는_넣지_않는다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of(0, card(STRAWBERRY, 1)));
        flip(match, A, "a1", START);

        ring(match, B, "wrong", 1, START.plusMillis(90));

        assertThat(match.bellSummaries().get(1)).isEqualTo(new HalliGalliBellLog.Summary(B, 0, 1, 0, null, null, null, 0, 0));
    }

    @Test
    void 자동_공개는_서버가_처리한_시각부터_반응_시간을_재고_여러_종의_중앙값과_평균을_낸다() {
        HalliGalliMatch match = match(List.of(A, B), Map.of(0, card(STRAWBERRY, 5), 1, card(BANANA, 5)));
        // 마감(5초)보다 0.15초 늦게 처리된 자동 공개를 0.25초에 맞힌다: 반응 100ms.
        match.expire(START.plusMillis(5_150));
        ring(match, B, "fast", 1, START.plusMillis(5_250));
        // 결과 연출 1초 뒤 B가 직접 공개한 바나나 5를 0.6초 뒤에 맞힌다.
        flip(match, B, "b1", START.plusMillis(6_250));
        ring(match, B, "slow", 2, START.plusMillis(6_850));

        assertThat(match.bellSummaries().get(1))
                .isEqualTo(new HalliGalliBellLog.Summary(B, 2, 0, 0, 100, 350, 350, 1, 1));
    }

    private static HalliGalliMatch ringSucceededByC() {
        HalliGalliMatch match = match(List.of(A, B, C), Map.of(0, card(STRAWBERRY, 2), 1, card(STRAWBERRY, 3)));
        flip(match, A, "a1", START);
        flip(match, B, "b1", START);
        ring(match, C, "bell", 2, START.plusSeconds(1));
        return match;
    }

    // A가 첫 카드에서 종을 잘못 쳐 B에게 한 장을 준 뒤 자동 공개로 진행한다. 265초에 B가 공개하면 뒷면이 빈 A의
    // 마지막 종 기회가 270초까지 열린다. 이때 B는 뒷면 2장이 남고 맨 위 카드는 A가 aLast, B가 bLast다(창 54).
    private static HalliGalliMatch lastChanceOfA(FruitCard aLast, FruitCard bLast) {
        HalliGalliMatch match = match(List.of(A, B), Map.of(0, card(STRAWBERRY, 1), 53, bLast, 54, aLast));
        flip(match, A, "a1", START);
        ring(match, A, "wrong", 1, START);
        match.expire(START.plusSeconds(265));
        return match;
    }

    private static HalliGalliMatch match(List<Long> players, Map<Integer, FruitCard> fixed) {
        return new HalliGalliMatch("halli", "table", players, deck(fixed), START, new Random(5), HalliGalliTiming.DEFAULT);
    }

    // 지정한 위치에 카드를 두고 나머지는 기본 순서로 채운다. 좌석 s의 k번째 공개 카드는 위치 s + k × 인원이다.
    private static List<FruitCard> deck(Map<Integer, FruitCard> fixed) {
        List<FruitCard> rest = new ArrayList<>(HalliGalliDeck.standard());
        rest.removeAll(fixed.values());
        List<FruitCard> deck = new ArrayList<>();
        for (int index = 0; index < HalliGalliDeck.STANDARD_SIZE; index++) {
            deck.add(fixed.containsKey(index) ? fixed.get(index) : rest.removeFirst());
        }
        return deck;
    }

    private static FruitCard card(FruitType fruit, int count) {
        return HalliGalliDeck.standard().stream().filter(card -> card.fruit() == fruit && card.count() == count)
                .findFirst().orElseThrow();
    }

    private static GameActionResult flip(HalliGalliMatch match, long user, String actionId, Instant now) {
        return match.apply(command(user, actionId, match.snapshot().version(), Map.of("kind", "flip")), now);
    }

    private static GameActionResult ring(HalliGalliMatch match, long user, String actionId, long window, Instant now) {
        return match.apply(command(user, actionId, match.snapshot().version(),
                Map.of("kind", "ring", "bellWindowId", window)), now);
    }

    private static GameActionCommand command(long user, String actionId, long expectedVersion, Map<String, Object> input) {
        return new GameActionCommand(user, "halli", actionId, expectedVersion, MAPPER.valueToTree(input));
    }

    private static void reject(Rejection reason, ThrowingCallable action) {
        assertThatThrownBy(action).isInstanceOfSatisfying(Rejected.class,
                rejected -> assertThat(rejected.reason()).isEqualTo(reason));
    }
}
