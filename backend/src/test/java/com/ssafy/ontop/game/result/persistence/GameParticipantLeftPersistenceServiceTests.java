package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameParticipantLeft;
import com.ssafy.ontop.game.start.GameStartCommand;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GameParticipantLeftPersistenceServiceTests {
    private final GameSessionRepository sessions = mock(GameSessionRepository.class);
    private final GameParticipantRepository participants = mock(GameParticipantRepository.class);
    private final GameParticipantLeftPersistenceService service =
            new GameParticipantLeftPersistenceService(sessions, participants);
    private final Instant began = Instant.parse("2026-10-26T00:00:00Z");
    private GameSession game;
    private GameParticipant player;

    @BeforeEach
    void setup() {
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "OMOK", List.of(
                new GameStartCommand.Participant("11", 1), new GameStartCommand.Participant("22", 2)), null, 5);
        game = GameSession.prepare(command, new byte[32], "test", UUID.randomUUID(), began);
        ReflectionTestUtils.setField(game, "id", 7L);
        game.reserve(began);
        player = new GameParticipant(7, 11, 1, 0, 5);
        when(sessions.findForUpdateById(7)).thenReturn(Optional.of(game));
        when(participants.findByGameSessionIdOrderByParticipantOrder(7)).thenReturn(List.of(player));
    }

    @Test
    void 이탈은_독립저장하고_예약액과_미확정결과를_유지한다() {
        service.accept(left(began.plusSeconds(1)));
        service.accept(left(began.plusSeconds(1)));

        assertThat(player.leaveReason()).isEqualTo(GameDepartureReason.DISCONNECT_TIMEOUT);
        assertThat(player.leftAt()).isEqualTo(began.plusSeconds(1));
        assertThat(player.reservedAmount()).isEqualTo(5);
        assertThat(player.reservationReleasedAt()).isNull();
        assertThat(player.coinDelta()).isNull();
        assertThat(player.result()).isNull();
        assertThat(game.status()).isEqualTo(GameSession.Status.RESERVED);
    }

    @Test
    void 상충하는_중복이탈과_변조된_이벤트식별자는_거절한다() {
        service.accept(left(began.plusSeconds(1)));
        assertThatThrownBy(() -> service.accept(left(began.plusSeconds(2))))
                .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> service.accept(new GameParticipantLeft("7:left:22", "7", "table", "OMOK",
                2, 11, GameDepartureReason.DISCONNECT_TIMEOUT, began.plusSeconds(1))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(player.leftAt()).isEqualTo(began.plusSeconds(1));
    }

    @Test
    void 종료가_먼저도착하면_일치하는_이탈만_중복으로_인정한다() {
        var at = began.plusSeconds(1);
        game.recordFinish("7:finished", new byte[32], 3, "RECONNECT_EXPIRED", began.plusSeconds(2));
        player.recordFinish(new GameFinished.Participant(11, GameFinished.Result.FORFEIT,
                GameDepartureReason.DISCONNECT_TIMEOUT, at));
        service.accept(left(at));

        assertThat(player.result()).isEqualTo(GameFinished.Result.FORFEIT);
        assertThatThrownBy(() -> service.accept(left(at.plusSeconds(1))))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 기존_이탈을_최종판정이_덮어쓰지못하고_정상결과없이_정산하지않는다() {
        service.accept(left(began.plusSeconds(1)));
        assertThatThrownBy(() -> player.recordFinish(new GameFinished.Participant(11,
                GameFinished.Result.WIN, null, null))).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> player.closeReservation(0, began.plusSeconds(2)))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test
    void 예약전_시각과_최초참가자가_아닌_이탈은_거절한다() {
        assertThatThrownBy(() -> service.accept(left(began.minusSeconds(1))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.accept(new GameParticipantLeft("7:left:33", "7", "table", "OMOK",
                2, 33, GameDepartureReason.LOGOUT, began.plusSeconds(1))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private GameParticipantLeft left(Instant at) {
        return new GameParticipantLeft("7:left:11", "7", "table", "OMOK", 2, 11,
                GameDepartureReason.DISCONNECT_TIMEOUT, at);
    }
}
