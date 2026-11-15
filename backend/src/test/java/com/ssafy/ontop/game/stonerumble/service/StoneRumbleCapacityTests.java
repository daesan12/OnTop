package com.ssafy.ontop.game.stonerumble.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.result.GameResultView;
import java.time.Instant;
import java.util.stream.LongStream;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class StoneRumbleCapacityTests {
    @Test
    void 돌탑_복구만_여덟명을_허용한다() {
        var mapper = new ObjectMapper();
        var state = mapper.createObjectNode();
        state.putObject("publicState").put("gameCode", "STONE_RUMBLE");

        assertThat(new GameRecoverySnapshot(101, "7", 8, 1, GameRecoverySnapshot.Phase.PLAYING, state)
                .participantCount()).isEqualTo(8);
        state.withObject("publicState").put("gameCode", "DICE");
        assertThatThrownBy(() -> new GameRecoverySnapshot(101, "7", 8, 1,
                GameRecoverySnapshot.Phase.PLAYING, state)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 돌탑의_공개결과는_여덟명을_표현하고_기존_게임은_네명을_넘지_않는다() {
        var players = LongStream.rangeClosed(1, 8).mapToObj(id -> new GameResultView.Participant(
                Long.toString(id), id == 8 ? "WIN" : "LOSE")).toList();

        var result = new GameResultView(1, 1, "7", "STONE_RUMBLE", GameResultView.Status.FINISHED,
                "LAST_PLAYER_STANDING", GameResultView.SettlementStatus.PENDING, 0, players, null, Instant.now());

        assertThat(result.participants()).hasSize(8);
        assertThatThrownBy(() -> new GameResultView(1, 1, "7", "DICE", GameResultView.Status.FINISHED,
                "LAST_PLAYER_STANDING", GameResultView.SettlementStatus.PENDING, 0, players, null, Instant.now()))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
