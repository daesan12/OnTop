package com.ssafy.ontop.game.result;

import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GameResultViewTests {
    private final List<GameResultView.Participant> unknown = List.of(
            new GameResultView.Participant("11", null), new GameResultView.Participant("22", null));

    @Test
    void 판정없는_무효결과는_PENDING과_SETTLED에서_null을_유지한다() {
        assertThat(view(GameResultView.Status.INVALID, GameResultView.SettlementStatus.PENDING, null)
                .participants()).allSatisfy(player -> assertThat(player.result()).isNull());
        assertThat(view(GameResultView.Status.INVALID, GameResultView.SettlementStatus.SETTLED, 0L)
                .myCoinDelta()).isZero();
    }

    @Test
    void 정상종료의_null판정과_무효경기의_잔액변경은_거절한다() {
        assertThatThrownBy(() -> view(GameResultView.Status.FINISHED,
                GameResultView.SettlementStatus.PENDING, null)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> view(GameResultView.Status.INVALID,
                GameResultView.SettlementStatus.SETTLED, 1L)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void JSON에서도_판정없음을_null로_전달하고_문자열로_위장하지않는다() {
        var mapper = new com.fasterxml.jackson.databind.ObjectMapper().findAndRegisterModules();
        com.fasterxml.jackson.databind.JsonNode json = mapper.valueToTree(view(GameResultView.Status.INVALID,
                GameResultView.SettlementStatus.SETTLED, 0L));
        assertThat(json.at("/participants/0/result").isNull()).isTrue();
        assertThat(json.has("userId")).isFalse();
    }

    private GameResultView view(GameResultView.Status status, GameResultView.SettlementStatus settlement,
            Long delta) {
        return new GameResultView(11, 1, "7", "OMOK", status, "ENGINE_LOST", settlement, 5,
                unknown, delta, Instant.parse("2026-10-26T00:00:10Z"));
    }
}
