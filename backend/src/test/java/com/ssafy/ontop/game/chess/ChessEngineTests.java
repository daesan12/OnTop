package com.ssafy.ontop.game.chess;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.chess.service.ChessEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.start.CommittedGameStartService;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartGateway;
import com.ssafy.ontop.game.start.GameStartResult;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ChessEngineTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final MutableClock clock = new MutableClock();
    private final List<Object> events = new ArrayList<>();
    private final GameEngineRouter router = new GameEngineRouter();
    private final ChessEngine engine = new ChessEngine(mapper, clock, events::add, router);

    @Test
    void 같은경기_생성은_멱등이고_다른_참가자나_테이블은_거절한다() {
        engine.create("chess", "table", List.of(101L, 202L));
        engine.create("chess", "table", List.of(101L, 202L));

        assertThat(engine.load(101, "chess").orElseThrow().version()).isZero();
        assertThatThrownBy(() -> engine.create("chess", "other", List.of(101L, 202L)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> engine.create("chess", "table", List.of(202L, 101L)))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 관전자는_공개상태만_받고_행동은_거절하며_참가자는_재접속한다() throws Exception {
        engine.create("chess", "table", List.of(101L, 202L));
        engine.apply(new GameActionCommand(101, "chess", "move", 0,
                mapper.readTree("{\"kind\":\"move\",\"from\":\"e2\",\"to\":\"e4\"}")));

        var spectator = engine.load(505, "chess").orElseThrow();
        assertThat(spectator.privateState().isEmpty()).isTrue();
        assertThat(spectator.version()).isEqualTo(1);
        assertThat(engine.load(101).orElseThrow().version()).isEqualTo(1);
        assertThat(engine.load(505)).isEmpty();
        assertThatThrownBy(() -> engine.apply(new GameActionCommand(505, "chess", "invalid", 1,
                mapper.readTree("{\"kind\":\"drawOffer\"}")))).isInstanceOf(Rejected.class);
    }

    @Test
    void 기권_재전송과_타이머가_종료와_정산이벤트를_중복발행하지_않는다() {
        engine.create("chess", "table", List.of(101L, 202L));
        var command = new GameForfeitCommand(101, "chess", "leave");
        engine.forfeit(command);
        engine.forfeit(command);
        clock.now = clock.now.plusSeconds(1000);
        engine.tick();

        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
        var finished = events.stream().filter(GameFinished.class::isInstance).map(GameFinished.class::cast)
                .findFirst().orElseThrow();
        assertThat(finished.participants()).anyMatch(player -> player.userId() == 101
                && player.result() == GameFinished.Result.FORFEIT);
        assertThat(finished.participants()).anyMatch(player -> player.userId() == 202
                && player.result() == GameFinished.Result.WIN);
        engine.create("next", "table", List.of(101L, 202L));
    }

    @Test
    void 재접속유예만료_기권을_중복처리하지_않는다() {
        engine.create("chess", "table", List.of(101L, 202L));
        Instant deadline = clock.now.plusSeconds(20);
        clock.now = deadline;
        var command = new GameRecoveryGateway.GraceExpiration(UUID.randomUUID(), 101, "chess", clock.now, deadline,
                GameRecoveryGateway.Action.FORFEIT, GameDepartureReason.DISCONNECT_TIMEOUT);
        engine.graceExpired(command);
        engine.graceExpired(command);

        assertThat(events.stream().filter(GameFinished.class::isInstance)).hasSize(1);
        assertThat(engine.load(101, "chess").orElseThrow().publicState().path("endReason").asText())
                .isEqualTo("RECONNECT_EXPIRED");
    }

    @Test
    void 예약_커밋이_확인된_후에만_체스엔진을_생성한다() {
        GameStartGateway gateway = mock(GameStartGateway.class);
        var service = new CommittedGameStartService(gateway, Optional.empty(), Optional.empty(), Optional.empty(),
                true, false);
        service.configureChess(engine);
        UUID attempt = UUID.randomUUID();
        var command = new GameStartCommand(attempt, "table", 1, "CHESS", List.of(
                new GameStartCommand.Participant("101", 1), new GameStartCommand.Participant("202", 2)), null, 0);
        when(gateway.startGame(command)).thenReturn(GameStartResult.pending(attempt));
        service.start(command);
        assertThat(engine.load(101, "local-chess")).isEmpty();

        when(gateway.startGame(command)).thenReturn(GameStartResult.reserved(command, "local-chess"));
        service.start(command);
        service.start(command);
        assertThat(engine.load(101, "local-chess")).isPresent();
    }

    private static final class MutableClock extends Clock {
        private Instant now = Instant.parse("2026-11-21T00:00:00Z");
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return now; }
    }
}
