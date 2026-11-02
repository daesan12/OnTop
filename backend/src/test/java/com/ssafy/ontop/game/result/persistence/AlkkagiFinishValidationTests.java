package com.ssafy.ontop.game.result.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.alkkagi.service.AlkkagiEngine;
import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.start.GameStartCommand;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class AlkkagiFinishValidationTests {
    private static final Instant ENDED_AT = Instant.parse("2026-11-02T00:00:00Z");

    @ParameterizedTest
    @ValueSource(strings = {"PIECES_OUT", "MATCH_TIME_LIMIT", "AFK_FORFEIT"})
    void 단독승패를_승인한다(String reason) {
        assertThat(VerifiedGameFinish.validate(event(reason, GameFinished.Result.WIN, GameFinished.Result.LOSE)))
                .isEqualTo(7);
    }

    @ParameterizedTest
    @ValueSource(strings = {"EXPLICIT_LEAVE", "DISCONNECT_TIMEOUT", "LOGOUT", "MEMBER_DEACTIVATED"})
    void 이탈자는_사유와_시각을_보존한다(String reason) {
        var event = new GameFinished("7:finished", "7", "table", "ALKKAGI", 9, List.of(
                new GameFinished.Participant(11, GameFinished.Result.FORFEIT,
                        GameDepartureReason.valueOf(reason), ENDED_AT),
                player(22, GameFinished.Result.WIN)), reason, ENDED_AT);
        assertThat(VerifiedGameFinish.validate(event)).isEqualTo(7);
    }

    @ParameterizedTest
    @ValueSource(strings = {"PIECES_OUT", "MATCH_TIME_LIMIT"})
    void 양쪽_무승부는_정상종료와_예약금반환이다(String reason) {
        var event = event(reason, GameFinished.Result.DRAW, GameFinished.Result.DRAW);
        assertThat(VerifiedGameFinish.validate(event)).isEqualTo(7);
        assertThat(VerifiedGameFinish.invalid(event)).isFalse();
        assertThat(GameSettlementCalculation.calculate(5,
                event.participants().stream().map(GameFinished.Participant::result).toList()).release()).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"SIMULATION_INVALID", "SIMULATION_LIMIT"})
    void 물리오류는_무효와_예약금반환이다(String reason) {
        var event = event(reason, GameFinished.Result.DRAW, GameFinished.Result.DRAW);
        assertThat(VerifiedGameFinish.validate(event)).isEqualTo(7);
        assertThat(VerifiedGameFinish.invalid(event)).isTrue();
        assertThat(GameSettlementCalculation.refund(2).release()).isTrue();
        assertThatThrownBy(() -> VerifiedGameFinish.validate(
                event(reason, GameFinished.Result.WIN, GameFinished.Result.LOSE)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 가짜공동승리와_혼합무승부_알수없는종료를_거절한다() {
        assertThatThrownBy(() -> VerifiedGameFinish.validate(
                event("PIECES_OUT", GameFinished.Result.WIN, GameFinished.Result.WIN)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> VerifiedGameFinish.validate(
                event("MATCH_TIME_LIMIT", GameFinished.Result.WIN, GameFinished.Result.DRAW)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> VerifiedGameFinish.validate(
                event("UNKNOWN", GameFinished.Result.WIN, GameFinished.Result.LOSE)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> VerifiedGameFinish.validate(
                event("AFK_FORFEIT", GameFinished.Result.DRAW, GameFinished.Result.DRAW)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 두명만_참가할수있다() {
        var event = new GameFinished("7:finished", "7", "table", "ALKKAGI", 9,
                List.of(player(11, GameFinished.Result.WIN), player(22, GameFinished.Result.LOSE),
                        player(33, GameFinished.Result.LOSE)), "PIECES_OUT", ENDED_AT);
        assertThatThrownBy(() -> VerifiedGameFinish.validate(event)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 실제엔진의_기권을_저장하고_동일종료를_재수신해도_한번만_반영한다() {
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "ALKKAGI", List.of(
                new GameStartCommand.Participant("11", 1), new GameStartCommand.Participant("22", 2)), null, 5);
        var game = GameSession.prepare(command, new byte[32], "test", UUID.randomUUID(), ENDED_AT);
        ReflectionTestUtils.setField(game, "id", 7L);
        game.reserve(ENDED_AT);
        var players = List.of(new GameParticipant(7, 11, 1, 0, 5), new GameParticipant(7, 22, 2, 1, 5));
        var sessions = mock(GameSessionRepository.class);
        var participants = mock(GameParticipantRepository.class);
        var published = mock(ApplicationEventPublisher.class);
        when(sessions.findForUpdateById(7)).thenReturn(Optional.of(game));
        when(participants.findByGameSessionIdOrderByParticipantOrder(7)).thenReturn(players);
        var service = new GameFinishPersistenceService(sessions, participants, published);
        var events = new ArrayList<Object>();
        var engine = new AlkkagiEngine(new ObjectMapper(), Clock.fixed(ENDED_AT, ZoneOffset.UTC),
                events::add, new GameEngineRouter());
        engine.create("7", "table", 11, 22);
        engine.forfeit(new GameForfeitCommand(11, "7", "leave-11"));
        var finished = events.stream().filter(GameFinished.class::isInstance).map(GameFinished.class::cast)
                .findFirst().orElseThrow();

        assertThat(service.accept(finished)).isEqualTo(7);
        assertThat(service.accept(finished)).isEqualTo(7);
        assertThat(game.status()).isEqualTo(GameSession.Status.FINISHED);
        assertThat(players).extracting(GameParticipant::result)
                .containsExactly(GameFinished.Result.FORFEIT, GameFinished.Result.WIN);
        verify(published, times(1)).publishEvent(any(GameResultsReady.class));
    }

    private static GameFinished event(String reason, GameFinished.Result first, GameFinished.Result second) {
        return new GameFinished("7:finished", "7", "table", "ALKKAGI", 9,
                List.of(player(11, first), player(22, second)), reason, ENDED_AT);
    }

    private static GameFinished.Participant player(long id, GameFinished.Result result) {
        return new GameFinished.Participant(id, result, null, null);
    }
}
