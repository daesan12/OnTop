package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameFinished;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class QuoridorFinishTests {
    private GameFinished event(List<GameFinished.Participant> players) {
        return new GameFinished("7:finished", "7", "table", "QUORIDOR", 9, players, "GOAL_REACHED",
                Instant.parse("2026-11-21T00:00:00Z"));
    }

    private GameFinished.Participant player(long id, GameFinished.Result result) {
        return new GameFinished.Participant(id, result, null, null);
    }

    @Test
    void 도착_승자는_한_명이어야_하며_두_명과_네_명만_정산한다() {
        var win = player(1, GameFinished.Result.WIN);
        var lose = player(2, GameFinished.Result.LOSE);

        assertThat(VerifiedGameFinish.validate(event(List.of(win, lose)))).isEqualTo(7);
        assertThat(VerifiedGameFinish.validate(event(List.of(win, lose,
                player(3, GameFinished.Result.LOSE), player(4, GameFinished.Result.LOSE))))).isEqualTo(7);
        assertThatThrownBy(() -> VerifiedGameFinish.validate(event(List.of(win, player(2, GameFinished.Result.WIN)))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> VerifiedGameFinish.validate(event(List.of(win, lose, player(3, GameFinished.Result.LOSE)))))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
