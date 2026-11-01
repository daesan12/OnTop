package com.ssafy.ontop.game.result.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.domain.GameParticipant;
import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.halligalli.domain.HalliGalliTiming;
import com.ssafy.ontop.game.halligalli.service.HalliGalliEngine;
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
import java.util.Map;
import java.util.Optional;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.stream.IntStream;
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

/** 할리갈리 엔진이 낸 종료 이벤트가 공통 종료 검증(VerifiedGameFinish)과 결과 저장을 통과하는지 확인한다. */
class HalliGalliFinishPersistenceTests {
    private final GameSessionRepository sessions = mock(GameSessionRepository.class);
    private final GameParticipantRepository participants = mock(GameParticipantRepository.class);
    private final ApplicationEventPublisher published = mock(ApplicationEventPublisher.class);
    private final GameFinishPersistenceService service =
            new GameFinishPersistenceService(sessions, participants, published);
    private final TestClock clock = new TestClock();
    private final List<Object> events = new CopyOnWriteArrayList<>();
    private final ObjectMapper mapper = new ObjectMapper();
    // 기본 덱 순서를 그대로 쓴다. 마지막 공개 카드가 자두 4·4·5라 끝까지 공개해도 종 정답이 없다.
    private final HalliGalliEngine engine = new HalliGalliEngine(mapper, clock, events::add, new GameEngineRouter(),
            cards -> { }, new Random(5), HalliGalliTiming.DEFAULT);
    private GameSession game;
    private List<GameParticipant> players;

    @Test
    void 규칙상_탈락자는_LOSE이고_남은_한명의_단독승리로_저장한다() {
        start(2);
        clock.advance(275);
        engine.tick();

        engine.apply(new GameActionCommand(11, "7", "wrong", version(), mapper.valueToTree(
                Map.of("kind", "ring", "bellWindowId", 55))));

        GameFinished finished = finished();
        assertThat(finished.endReason()).isEqualTo("LAST_PLAYER_STANDING");
        assertThat(service.accept(finished)).isEqualTo(7);
        assertThat(players).extracting(GameParticipant::result)
                .containsExactly(GameFinished.Result.LOSE, GameFinished.Result.WIN);
    }

    @Test
    void 카드_수_동점은_전원_공동승리로_저장하고_중복_종료는_한번만_반영한다() {
        start(2);
        clock.advance(285);
        engine.tick();

        GameFinished finished = finished();
        assertThat(finished.endReason()).isEqualTo("NO_CARDS_TO_FLIP");
        assertThat(service.accept(finished)).isEqualTo(7);
        assertThat(service.accept(finished)).isEqualTo(7);
        assertThat(game.status()).isEqualTo(GameSession.Status.FINISHED);
        assertThat(players).allSatisfy(player -> assertThat(player.result()).isEqualTo(GameFinished.Result.WIN));
        verify(published, times(1)).publishEvent(any(GameResultsReady.class));
    }

    @Test
    void 기권자를_포함한_공동승리는_기권자만_FORFEIT으로_저장한다() {
        start(4);
        engine.forfeit(new GameForfeitCommand(14, "7", "leave-14"));
        clock.advance(300);
        engine.tick();

        GameFinished finished = finished();
        assertThat(finished.endReason()).isEqualTo("NO_CARDS_TO_FLIP");
        assertThat(service.accept(finished)).isEqualTo(7);
        assertThat(players).extracting(GameParticipant::result).containsExactly(GameFinished.Result.WIN,
                GameFinished.Result.WIN, GameFinished.Result.WIN, GameFinished.Result.FORFEIT);
        assertThat(finished.participants().get(3).leaveReason()).isEqualTo(GameDepartureReason.EXPLICIT_LEAVE);
    }

    @Test
    void 두명중_기권은_남은_사람의_단독승리와_FORFEIT으로_저장한다() {
        start(2);

        engine.forfeit(new GameForfeitCommand(11, "7", "leave-11"));

        GameFinished finished = finished();
        assertThat(finished.endReason()).isEqualTo("LAST_PLAYER_STANDING");
        assertThat(service.accept(finished)).isEqualTo(7);
        assertThat(players).extracting(GameParticipant::result)
                .containsExactly(GameFinished.Result.FORFEIT, GameFinished.Result.WIN);
    }

    @Test
    void 카드수_공동승리는_허용하고_최후1인의_복수승자와_다른게임의_종료사유는_거절한다() {
        start(3);
        var leaving = new GameFinished.Participant(13, GameFinished.Result.FORFEIT,
                GameDepartureReason.EXPLICIT_LEAVE, clock.instant());
        var twoWinners = List.of(win(11), win(12), leaving);

        assertThatThrownBy(() -> service.accept(event("ALL_CATEGORIES_FILLED", twoWinners)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.accept(event("PLAYER_LEFT", twoWinners)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> service.accept(event("LAST_PLAYER_STANDING", twoWinners)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThat(game.status()).isEqualTo(GameSession.Status.RESERVED);

        assertThat(service.accept(event("CARD_COUNT", twoWinners))).isEqualTo(7);
        assertThat(players).extracting(GameParticipant::result).containsExactly(
                GameFinished.Result.WIN, GameFinished.Result.WIN, GameFinished.Result.FORFEIT);
    }

    private void start(int count) {
        List<Long> users = IntStream.rangeClosed(1, count).mapToObj(i -> 10L + i).toList();
        var command = new GameStartCommand(UUID.randomUUID(), "table", 1, "HALLI_GALLI",
                IntStream.rangeClosed(1, count).mapToObj(i -> new GameStartCommand.Participant(
                        String.valueOf(10 + i), i)).toList(), null, 5);
        game = GameSession.prepare(command, new byte[32], "test", UUID.randomUUID(), clock.instant());
        ReflectionTestUtils.setField(game, "id", 7L);
        game.reserve(clock.instant());
        players = IntStream.range(0, count).mapToObj(i -> new GameParticipant(7, users.get(i), i + 1, i, 5)).toList();
        when(sessions.findForUpdateById(7)).thenReturn(Optional.of(game));
        when(participants.findByGameSessionIdOrderByParticipantOrder(7)).thenReturn(players);
        engine.create("7", "table", users);
    }

    private long version() {
        return engine.load(11, "7").orElseThrow().version();
    }

    private GameFinished finished() {
        return events.stream().filter(GameFinished.class::isInstance).map(GameFinished.class::cast)
                .reduce((first, second) -> { throw new AssertionError("종료 이벤트는 한 번만 발행해야 합니다."); })
                .orElseThrow();
    }

    private GameFinished event(String reason, List<GameFinished.Participant> outcomes) {
        return new GameFinished("7:finished", "7", "table", "HALLI_GALLI", 9, outcomes, reason,
                clock.instant().plusSeconds(1));
    }

    private static GameFinished.Participant win(long userId) {
        return new GameFinished.Participant(userId, GameFinished.Result.WIN, null, null);
    }

    private static final class TestClock extends Clock {
        private Instant now = Instant.parse("2026-11-01T00:00:00Z");

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
