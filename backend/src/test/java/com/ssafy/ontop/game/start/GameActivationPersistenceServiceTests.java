package com.ssafy.ontop.game.start;

import com.ssafy.ontop.game.domain.GameSession;
import com.ssafy.ontop.game.repository.GameSessionRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class GameActivationPersistenceServiceTests {
    private final GameSessionRepository sessions = mock(GameSessionRepository.class);
    private final GameRuntimeIdentity identity = new GameRuntimeIdentity("test");
    private final Instant began = Instant.parse("2026-10-26T00:00:00Z");
    private final GameActivationPersistenceService activations = new GameActivationPersistenceService(
            sessions, identity, Clock.fixed(began.plusSeconds(1), ZoneOffset.UTC));
    private GameStartCommand command;
    private GameSession game;

    @BeforeEach
    void setup() {
        command = new GameStartCommand(UUID.randomUUID(), "table", 1, "OMOK", List.of(
                new GameStartCommand.Participant("11", 1), new GameStartCommand.Participant("22", 2)), null, 5);
        game = GameSession.prepare(command, GameReservationRequest.from(command).fingerprint(),
                identity.instanceId(), identity.bootId(), began);
        ReflectionTestUtils.setField(game, "id", 7L);
        game.reserve(began);
        when(sessions.findForUpdateById(7)).thenReturn(Optional.of(game));
    }

    @Test
    void 현재_boot의_예약만_승인하고_엔진생성_확인후_RUNNING을_기록한다() {
        assertThat(activations.authorize(command, "7")).isTrue();
        assertThat(game.status()).isEqualTo(GameSession.Status.RESERVED);
        activations.started(command, "7");
        activations.started(command, "7");
        assertThat(game.status()).isEqualTo(GameSession.Status.RUNNING);
        assertThat(ReflectionTestUtils.getField(game, "startedAt")).isEqualTo(began.plusSeconds(1));
    }

    @Test
    void 다른_boot는_활성화도_무효반환도_수행하지않는다() {
        var anotherBoot = new GameActivationPersistenceService(sessions, new GameRuntimeIdentity("test"),
                Clock.fixed(began.plusSeconds(1), ZoneOffset.UTC));
        assertThatThrownBy(() -> anotherBoot.authorize(command, "7")).isInstanceOf(IllegalStateException.class);
        assertThat(game.status()).isEqualTo(GameSession.Status.RESERVED);
        assertThat(game.settlementStatus()).isEqualTo(GameSession.SettlementStatus.PENDING);
        verify(sessions, never()).flush();
    }

    @Test
    void 종결된_예약은_활성화할수없고_지연된_시작확인으로_되돌리지않는다() {
        game.recordFinish("7:finished", new byte[32], 2, "FIVE_IN_ROW", began.plusSeconds(1));
        assertThat(activations.authorize(command, "7")).isFalse();
        activations.started(command, "7");
        assertThat(game.status()).isEqualTo(GameSession.Status.FINISHED);
        verify(sessions, never()).flush();
    }

    @Test
    void 같은_시도에서도_참가비가_변조되면_거절한다() {
        var modified = new GameStartCommand(command.startAttemptId(), "table", 1, "OMOK",
                command.participants(), null, 6);
        assertThatThrownBy(() -> activations.authorize(modified, "7")).isInstanceOf(IllegalStateException.class);
        assertThat(game.status()).isEqualTo(GameSession.Status.RESERVED);
    }
}
