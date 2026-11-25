package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.result.GameFinished;
import java.time.Instant;
import java.util.List;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StoneRumbleFinishTests {
    @Test
    void 돌탑만_여덟명_결과를_허용하고_다른_게임의_네명_제한은_유지한다() {
        var players = LongStream.rangeClosed(1, 8).mapToObj(id -> new GameFinished.Participant(id,
                id == 8 ? GameFinished.Result.WIN : GameFinished.Result.LOSE, null, null,
                (int) (9 - id), id * 10)).toList();
        var result = new GameFinished("7:finished", "7", "arena", "STONE_RUMBLE", 9,
                players, "LAST_PLAYER_STANDING", Instant.now());

        assertThat(VerifiedGameFinish.validate(result)).isEqualTo(7);
        assertThatThrownBy(() -> VerifiedGameFinish.validate(new GameFinished("7:finished", "7", "table", "DICE",
                9, players, "LAST_PLAYER_STANDING", Instant.now()))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 마지막_생존자와_동시낙하_무승부를_각각_검증한다() {
        assertThat(VerifiedGameFinish.validate(event("LAST_PLAYER_STANDING",
                GameFinished.Result.WIN, GameFinished.Result.LOSE))).isEqualTo(7);
        assertThat(VerifiedGameFinish.validate(event("ALL_FALLEN",
                GameFinished.Result.DRAW, GameFinished.Result.DRAW))).isEqualTo(7);
        assertThatThrownBy(() -> VerifiedGameFinish.validate(event("LAST_PLAYER_STANDING",
                GameFinished.Result.WIN, GameFinished.Result.WIN))).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 제한시간_공동생존자는_공동일위_보상으로_정상_정산한다() {
        assertThat(VerifiedGameFinish.validate(event("MATCH_TIME_LIMIT",
                GameFinished.Result.WIN, GameFinished.Result.WIN))).isEqualTo(7);
    }

    @Test
    void 서버_지연_중단은_무효로_분류한다() {
        var result = event("SIMULATION_LIMIT", GameFinished.Result.DRAW, GameFinished.Result.DRAW);

        assertThat(VerifiedGameFinish.validate(result)).isEqualTo(7);
        assertThat(VerifiedGameFinish.invalid(result)).isTrue();
    }

    private GameFinished event(String reason, GameFinished.Result first, GameFinished.Result second) {
        boolean invalid = reason.equals("SIMULATION_LIMIT") || reason.equals("LOADING_TIMEOUT");
        boolean tie = first == second;
        return new GameFinished("7:finished", "7", "table", "STONE_RUMBLE", 9,
                List.of(new GameFinished.Participant(101, first, null, null, invalid ? null : 1, invalid ? null : tie ? 15L : 20L),
                        new GameFinished.Participant(202, second, null, null, invalid ? null : tie ? 1 : 2, invalid ? null : tie ? 15L : 10L)), reason, Instant.now());
    }

    @Test
    void 여덟명_결과_수신자와_정산_반환은_누락되지_않는다() {
        var players = java.util.stream.IntStream.rangeClosed(1, 8)
                .mapToObj(index -> new com.ssafy.ontop.game.result.GameResultView.Participant(
                        Integer.toString(index * 101), index == 1 ? "WIN" : "LOSE")).toList();
        var results = java.util.stream.IntStream.rangeClosed(1, 8).mapToObj(index ->
                new com.ssafy.ontop.game.result.GameResultView(index * 101L, 1, "7", "STONE_RUMBLE",
                        com.ssafy.ontop.game.result.GameResultView.Status.FINISHED, "LAST_PLAYER_STANDING",
                        com.ssafy.ontop.game.result.GameResultView.SettlementStatus.SETTLED,
                        5, players, index == 1 ? 35L : -5L, Instant.EPOCH)).toList();
        var payload = new GameResultOutboxPayload(1, "table", results.stream()
                .map(GameResultOutboxPayload.MemberResult::from).toList());
        var calculation = GameSettlementCalculation.calculate(5, java.util.stream.IntStream.range(0, 8)
                .mapToObj(index -> index == 0 ? GameFinished.Result.WIN : GameFinished.Result.LOSE).toList());

        assertThat(payload.results()).hasSize(8);
        assertThat(calculation.awards()).hasSize(8);
        assertThat(calculation.awards().stream().mapToLong(GameSettlementCalculation.Award::netDelta).sum()).isZero();
        assertThat(GameSettlementCalculation.refund(8).awards()).hasSize(8);
    }
}
