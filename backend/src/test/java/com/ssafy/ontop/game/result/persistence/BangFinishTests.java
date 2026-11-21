package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.start.GameStartCommand;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class BangFinishTests {
    private final Instant now = Instant.parse("2026-11-21T00:00:00Z");

    @Test
    void 일곱_명_중_여러_팀원의_공동_승리를_검증한다() {
        var participants = IntStream.rangeClosed(1, 7).mapToObj(index -> new GameFinished.Participant(index,
                index <= 3 ? GameFinished.Result.WIN : GameFinished.Result.LOSE, null, null)).toList();
        var event = new GameFinished("77:finished", "77", "table", "BANG", 8, participants, "LAW_WINS", now);

        assertThat(VerifiedGameFinish.validate(event)).isEqualTo(77);
        assertThat(VerifiedGameFinish.invalid(event)).isFalse();
    }

    @Test
    void 승리_자격자가_모두_기권한_경기는_공통_무효_종료로_저장한다() {
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "BANG", IntStream.rangeClosed(1, 4)
                .mapToObj(index -> new GameStartCommand.Participant(Integer.toString(index), index)).toList(), null, 10);
        var game = GameSession.prepare(command, new byte[32], "test", UUID.randomUUID(), now);
        game.reserve(now);
        var event = new GameFinished("77:finished", "77", "table", "BANG", 8, List.of(
                new GameFinished.Participant(1, GameFinished.Result.DRAW, null, null),
                new GameFinished.Participant(2, GameFinished.Result.FORFEIT, GameDepartureReason.EXPLICIT_LEAVE, now),
                new GameFinished.Participant(3, GameFinished.Result.FORFEIT, GameDepartureReason.EXPLICIT_LEAVE, now),
                new GameFinished.Participant(4, GameFinished.Result.DRAW, null, null)), "NO_ELIGIBLE_WINNERS", now.plusSeconds(1));

        VerifiedGameFinish.validate(event);
        game.recordInvalidFinish(event.eventId(), VerifiedGameFinish.hash(event), event.version(), event.endReason(), event.endedAt());

        assertThat(VerifiedGameFinish.invalid(event)).isTrue();
        assertThat(game.status()).isEqualTo(GameSession.Status.INVALID);
    }

    @Test
    void 네_명_미만의_잘못된_뱅_결과를_거부한다() {
        var event = new GameFinished("77:finished", "77", "table", "BANG", 8, List.of(
                new GameFinished.Participant(1, GameFinished.Result.WIN, null, null),
                new GameFinished.Participant(2, GameFinished.Result.LOSE, null, null)), "LAW_WINS", now);

        assertThatThrownBy(() -> VerifiedGameFinish.validate(event)).isInstanceOf(IllegalArgumentException.class);
    }
}
