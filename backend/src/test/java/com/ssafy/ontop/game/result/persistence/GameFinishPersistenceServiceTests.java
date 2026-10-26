package com.ssafy.ontop.game.result.persistence;

import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.start.GameStartCommand;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

class GameFinishPersistenceServiceTests {
    private final GameSessionRepository sessions = mock(GameSessionRepository.class);
    private final GameParticipantRepository participants = mock(GameParticipantRepository.class);
    private final ApplicationEventPublisher events = mock(ApplicationEventPublisher.class);
    private final GameFinishPersistenceService service = new GameFinishPersistenceService(sessions, participants, events);
    private final Instant began = Instant.parse("2026-10-26T00:00:00Z"), ended = began.plusSeconds(10);
    private GameSession game;
    private List<GameParticipant> players;

    @BeforeEach void setup() {
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "OMOK", List.of(
                new GameStartCommand.Participant("11", 1), new GameStartCommand.Participant("22", 2)), null, 5);
        game = GameSession.prepare(command, new byte[32], "test", UUID.randomUUID(), began);
        ReflectionTestUtils.setField(game, "id", 7L); game.reserve(began);
        players = List.of(new GameParticipant(7, 11, 1, 0, 5), new GameParticipant(7, 22, 2, 1, 5));
        when(sessions.findForUpdateById(7)).thenReturn(Optional.of(game));
        when(participants.findByGameSessionIdOrderByParticipantOrder(7)).thenReturn(players);
    }

    private GameFinished event(String reason, List<GameFinished.Participant> outcomes) {
        return new GameFinished("7:finished", "7", "table", "OMOK", 9, outcomes, reason, ended);
    }
    private GameFinished normal() {
        return event("FIVE_IN_ROW", List.of(new GameFinished.Participant(11, GameFinished.Result.WIN, null, null),
                new GameFinished.Participant(22, GameFinished.Result.LOSE, null, null)));
    }

    @Test void 정상결과를_PENDING으로_보존하고_순서만다른중복은_추가반영하지_않는다() {
        assertThat(service.accept(normal())).isEqualTo(7);
        assertThat(game.status()).isEqualTo(GameSession.Status.FINISHED);
        assertThat(game.resultVersion()).isEqualTo(1);
        service.accept(event("FIVE_IN_ROW", List.of(normal().participants().get(1), normal().participants().get(0))));
        verify(events, times(1)).publishEvent(any(GameResultsReady.class));
    }

    @Test void 같은이벤트의_상충판정을_거절한다() {
        service.accept(normal());
        assertThatThrownBy(() -> service.accept(event("FIVE_IN_ROW", List.of(
                new GameFinished.Participant(11, GameFinished.Result.LOSE, null, null),
                new GameFinished.Participant(22, GameFinished.Result.WIN, null, null)))))
                .isInstanceOf(IllegalStateException.class);
    }

    @Test void 타인과_중복참가자_잘못된종료사유를_거절한다() {
        assertThatThrownBy(() -> service.accept(event("FIVE_IN_ROW", List.of(
                normal().participants().getFirst(), new GameFinished.Participant(33, GameFinished.Result.LOSE, null, null)))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.accept(event("FIVE_IN_ROW", List.of(normal().participants().getFirst(), normal().participants().getFirst()))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.accept(event("NORMAL", normal().participants()))).isInstanceOf(IllegalArgumentException.class);
        assertThat(game.status()).isEqualTo(GameSession.Status.RESERVED);
        verifyNoInteractions(events);
    }

    @Test void 수동기권은_최종판정에서_보존하며_일반패배의_가짜이탈사유는_거절한다() {
        service.accept(event("EXPLICIT_LEAVE", List.of(normal().participants().getFirst(),
                new GameFinished.Participant(22, GameFinished.Result.FORFEIT, GameDepartureReason.EXPLICIT_LEAVE, ended))));
        assertThat(players.get(1).result()).isEqualTo(GameFinished.Result.FORFEIT);
    }

    @Test void 무효와_승자없는전원기권은_Story174로_남긴다() {
        var aborted = new GameFinished("7:finished", "7", "table", "LIAR_BRIDGE", 9, List.of(
                new GameFinished.Participant(11, GameFinished.Result.FORFEIT, GameDepartureReason.LOGOUT, ended),
                new GameFinished.Participant(22, GameFinished.Result.FORFEIT, GameDepartureReason.LOGOUT, ended)), "ABORTED_NO_PLAYERS", ended);
        assertThatThrownBy(() -> service.accept(aborted)).isInstanceOf(IllegalArgumentException.class);
        assertThat(game.status()).isEqualTo(GameSession.Status.RESERVED);
    }

    @Test void 무승부는_승자없는정상종료로_저장한다() {
        service.accept(event("BOARD_FULL", List.of(new GameFinished.Participant(11, GameFinished.Result.DRAW, null, null),
                new GameFinished.Participant(22, GameFinished.Result.DRAW, null, null))));
        assertThat(players).allSatisfy(p -> assertThat(p.result()).isEqualTo(GameFinished.Result.DRAW));
    }
}
