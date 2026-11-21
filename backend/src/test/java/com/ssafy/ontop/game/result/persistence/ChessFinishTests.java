package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ChessFinishTests {
    private final Instant at = Instant.parse("2026-11-21T00:00:00Z");

    @ParameterizedTest
    @ValueSource(strings = {"STALEMATE", "INSUFFICIENT_MATERIAL", "THREEFOLD_REPETITION", "FIVEFOLD_REPETITION",
            "FIFTY_MOVES", "SEVENTY_FIVE_MOVES", "TIMEOUT_DRAW", "AGREED_DRAW"})
    void 체스_무승부는_두참가자의_DRAW판정을_필수로_검증한다(String reason) {
        assertThat(VerifiedGameFinish.validate(event(reason, List.of(player(101, GameFinished.Result.DRAW),
                player(202, GameFinished.Result.DRAW))))).isEqualTo(188);
        assertThatThrownBy(() -> VerifiedGameFinish.validate(event(reason, List.of(player(101, GameFinished.Result.WIN),
                player(202, GameFinished.Result.LOSE))))).isInstanceOf(IllegalArgumentException.class);
    }

    @ParameterizedTest
    @ValueSource(strings = {"CHECKMATE", "TIMEOUT"})
    void 체크메이트와_시간패는_정확히_한명의_승자를_가진다(String reason) {
        assertThat(VerifiedGameFinish.validate(event(reason, List.of(player(101, GameFinished.Result.WIN),
                player(202, GameFinished.Result.LOSE))))).isEqualTo(188);
        assertThatThrownBy(() -> VerifiedGameFinish.validate(event(reason, List.of(player(101, GameFinished.Result.WIN),
                player(202, GameFinished.Result.WIN))))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> VerifiedGameFinish.validate(event(reason, List.of(player(101, GameFinished.Result.DRAW),
                player(202, GameFinished.Result.DRAW))))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 체스_기권은_공통_이탈사유와_함께_정산한다() {
        assertThat(VerifiedGameFinish.validate(event("EXPLICIT_LEAVE", List.of(
                new GameFinished.Participant(101, GameFinished.Result.FORFEIT, GameDepartureReason.EXPLICIT_LEAVE, at),
                player(202, GameFinished.Result.WIN))))).isEqualTo(188);
    }

    private GameFinished.Participant player(long user, GameFinished.Result result) {
        return new GameFinished.Participant(user, result, null, null);
    }

    private GameFinished event(String reason, List<GameFinished.Participant> players) {
        return new GameFinished("188:finished", "188", "table", "CHESS", 1, players, reason, at);
    }
}
