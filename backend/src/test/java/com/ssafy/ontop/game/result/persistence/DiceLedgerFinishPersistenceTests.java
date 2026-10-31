package com.ssafy.ontop.game.result.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.ledger.service.DiceLedgerEngine;
import com.ssafy.ontop.game.repository.GameParticipantRepository;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.start.GameStartCommand;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/** 주사위 장부 엔진이 낸 종료 이벤트가 공통 종료 검증(VerifiedGameFinish)과 결과 저장을 통과하는지 확인한다. */
class DiceLedgerFinishPersistenceTests {
    private static final List<Long> USERS = List.of(11L, 22L, 33L);
    private final GameSessionRepository sessions = mock(GameSessionRepository.class);
    private final GameParticipantRepository participants = mock(GameParticipantRepository.class);
    private final ApplicationEventPublisher published = mock(ApplicationEventPublisher.class);
    private final GameFinishPersistenceService service =
            new GameFinishPersistenceService(sessions, participants, published);
    private final TestClock clock = new TestClock();
    private final List<Object> events = new CopyOnWriteArrayList<>();
    // 모든 주사위가 6으로 나오므로 시간 초과 자동 기록만으로 세 사람이 같은 점수로 장부를 완성한다.
    private final DiceLedgerEngine engine = new DiceLedgerEngine(new ObjectMapper(), clock, events::add,
            new GameEngineRouter(), () -> 6, count -> 0);
    private GameSession game;
    private List<GameParticipant> players;

    @BeforeEach
    void setup() {
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "DICE_LEDGER", List.of(
                new GameStartCommand.Participant("11", 1), new GameStartCommand.Participant("22", 2),
                new GameStartCommand.Participant("33", 3)), null, 5);
        game = GameSession.prepare(command, new byte[32], "test", UUID.randomUUID(), clock.instant());
        ReflectionTestUtils.setField(game, "id", 7L);
        game.reserve(clock.instant());
        players = List.of(new GameParticipant(7, 11, 1, 0, 5), new GameParticipant(7, 22, 2, 1, 5),
                new GameParticipant(7, 33, 3, 2, 5));
        when(sessions.findForUpdateById(7)).thenReturn(Optional.of(game));
        when(participants.findByGameSessionIdOrderByParticipantOrder(7)).thenReturn(players);
        engine.create("7", "table", USERS);
    }

    @Test
    void 열두칸을_모두_채운_동점은_전원_공동승리로_저장하고_중복_종료는_한번만_반영한다() {
        clock.advance(30L * 12 * USERS.size());
        engine.tick();

        GameFinished finished = finished();
        assertThat(finished.endReason()).isEqualTo("ALL_CATEGORIES_FILLED");
        assertThat(service.accept(finished)).isEqualTo(7);
        assertThat(service.accept(finished)).isEqualTo(7);
        assertThat(game.status()).isEqualTo(GameSession.Status.FINISHED);
        assertThat(players).allSatisfy(player -> assertThat(player.result()).isEqualTo(GameFinished.Result.WIN));
        verify(published, times(1)).publishEvent(any(GameResultsReady.class));
    }

    @Test
    void 기권이_이어져_한명만_남으면_최후1인_승리와_기권자_FORFEIT을_저장한다() {
        engine.forfeit(new GameForfeitCommand(22, "7", "leave-22"));
        engine.forfeit(new GameForfeitCommand(33, "7", "leave-33"));

        GameFinished finished = finished();
        assertThat(finished.endReason()).isEqualTo("LAST_PLAYER_STANDING");
        assertThat(service.accept(finished)).isEqualTo(7);
        assertThat(players).extracting(GameParticipant::result).containsExactly(
                GameFinished.Result.WIN, GameFinished.Result.FORFEIT, GameFinished.Result.FORFEIT);
    }

    @Test
    void 일부_공동승리는_허용하고_다른게임의_종료사유와_최후1인의_복수승자는_거절한다() {
        var leaving = new GameFinished.Participant(33, GameFinished.Result.FORFEIT,
                GameDepartureReason.EXPLICIT_LEAVE, clock.instant());
        var twoWinners = List.of(win(11), win(22), leaving);

        assertThatThrownBy(() -> service.accept(event("TARGET_REACHED", twoWinners)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.accept(event("LAST_PLAYER_STANDING", twoWinners)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(game.status()).isEqualTo(GameSession.Status.RESERVED);

        var partial = List.of(win(11), win(22), new GameFinished.Participant(33, GameFinished.Result.LOSE, null, null));
        assertThat(service.accept(event("ALL_CATEGORIES_FILLED", partial))).isEqualTo(7);
        assertThat(players).extracting(GameParticipant::result).containsExactly(
                GameFinished.Result.WIN, GameFinished.Result.WIN, GameFinished.Result.LOSE);
    }

    private GameFinished finished() {
        return events.stream().filter(GameFinished.class::isInstance).map(GameFinished.class::cast)
                .reduce((first, second) -> { throw new AssertionError("종료 이벤트는 한 번만 발행해야 합니다."); })
                .orElseThrow();
    }

    private GameFinished event(String reason, List<GameFinished.Participant> outcomes) {
        return new GameFinished("7:finished", "7", "table", "DICE_LEDGER", 9, outcomes, reason,
                clock.instant().plusSeconds(1));
    }

    private static GameFinished.Participant win(long userId) {
        return new GameFinished.Participant(userId, GameFinished.Result.WIN, null, null);
    }

    private static final class TestClock extends Clock {
        private Instant now = Instant.parse("2026-10-31T00:00:00Z");

        void advance(long seconds) {
            now = now.plusSeconds(seconds);
        }

        @Override
        public ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(ZoneId zone) {
            return Clock.fixed(now, zone);
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
