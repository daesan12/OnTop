package com.ssafy.ontop.game;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.bridge.service.BridgeEngine;
import com.ssafy.ontop.game.engine.GameEngine;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.farkle.service.FarkleEngine;
import com.ssafy.ontop.game.omok.service.OmokEngine;
import com.ssafy.ontop.game.onecard.domain.ForfeitHandPolicy;
import com.ssafy.ontop.game.onecard.service.OneCardEngine;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway.Action;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway.GraceExpiration;
import com.ssafy.ontop.game.result.GameDepartureReason;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameParticipantLeft;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GameLifecycleTests {
    private final Instant now = Instant.parse("2026-10-23T03:00:00Z");
    private final ObjectMapper mapper = new ObjectMapper();
    private final List<Object> events = new ArrayList<>();
    private final GameEngineRouter router = new GameEngineRouter();
    private final java.util.concurrent.atomic.AtomicReference<Instant> time =
            new java.util.concurrent.atomic.AtomicReference<>(now);

    @ParameterizedTest
    @ValueSource(strings = {"OMOK", "DICE", "ONE_CARD", "LIAR_BRIDGE"})
    void 네엔진은중복이탈에도공통이탈과최종결과를한번발행한다(String code) {
        GameEngine engine = create(code, List.of(101L, 202L), now);
        GraceExpiration command = departure(101, GameDepartureReason.LOGOUT);
        engine.graceExpired(command);
        engine.graceExpired(command);
        engine.load(202);
        var left = departures();
        assertThat(left).hasSize(1);
        assertThat(left.getFirst().leaveReason()).isEqualTo(GameDepartureReason.LOGOUT);
        GameFinished finished = finished();
        assertThat(finished.gameCode()).isEqualTo(code);
        assertThat(finished.participants()).extracting(GameFinished.Participant::result)
                .containsExactly(GameFinished.Result.FORFEIT, GameFinished.Result.WIN);
        assertThat(finished.participants().getFirst().leftAt()).isEqualTo(now);
        assertThat(finished.participants().getFirst().leaveReason()).isEqualTo(GameDepartureReason.LOGOUT);
        assertThat(events.indexOf(left.getFirst())).isLessThan(events.indexOf(finished));
        assertThatThrownBy(() -> finished.participants().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @ParameterizedTest
    @CsvSource({"ONE_CARD,3", "ONE_CARD,4", "LIAR_BRIDGE,3", "LIAR_BRIDGE,4"})
    void 다인경기중도탈락은종료와분리되고최종결과에도모든이탈자가남는다(String code, int count) {
        List<Long> players = List.of(101L, 202L, 303L, 404L).subList(0, count);
        GameEngine engine = create(code, players, now);
        engine.graceExpired(departure(101, GameDepartureReason.MEMBER_DEACTIVATED));
        assertThat(departures()).hasSize(1);
        assertThat(events.stream().filter(GameFinished.class::isInstance)).isEmpty();
        for (int index = 1; index < count - 1; index++) {
            engine.graceExpired(departure(players.get(index), GameDepartureReason.DISCONNECT_TIMEOUT));
        }
        GameFinished finished = finished();
        assertThat(finished.participants()).hasSize(count);
        assertThat(finished.participants().getFirst().leaveReason()).isEqualTo(GameDepartureReason.MEMBER_DEACTIVATED);
        assertThat(finished.participants().getLast().result()).isEqualTo(GameFinished.Result.WIN);
        assertThat(finished.participants().stream().filter(p -> p.result() == GameFinished.Result.FORFEIT))
                .hasSize(count - 1);
    }

    @Test
    void 먼저끝난오목시간패는탈퇴기권으로덮지않는다() {
        GameEngine engine = create("OMOK", List.of(101L, 202L), now.minusSeconds(31));
        engine.graceExpired(departure(101, GameDepartureReason.MEMBER_DEACTIVATED));
        assertThat(finished().endReason()).isEqualTo("TURN_TIMEOUT");
        assertThat(departures()).isEmpty();
        assertThat(finished().participants().getFirst().result()).isEqualTo(GameFinished.Result.LOSE);
    }

    @Test
    void 다리판정중탈퇴도즉시참가자격을잃지만기존판정단계는유지한다() {
        GameEngine engine = create("LIAR_BRIDGE", List.of(101L, 202L, 303L), now);
        engine.apply(new GameActionCommand(101, "game", "roll", 0, mapper.createObjectNode().put("kind", "roll")));
        engine.graceExpired(departure(101, GameDepartureReason.LOGOUT));
        assertThat(departures()).hasSize(1);
        var snapshot = engine.load(101).orElseThrow();
        assertThat(snapshot.phase().name()).isEqualTo("ELIMINATED");
        assertThat(snapshot.state().path("publicState").path("stage").asText()).isEqualTo("DECLARING");
        assertThat(events.stream().filter(GameFinished.class::isInstance)).isEmpty();
    }

    private GameEngine create(String code, List<Long> players, Instant start) {
        time.set(start);
        Clock clock = new Clock() {
            @Override public java.time.ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(java.time.ZoneId zone) { return this; }
            @Override public Instant instant() { return time.get(); }
        };
        switch (code) {
            case "OMOK" -> {
                OmokEngine engine = new OmokEngine(mapper, clock, events::add, router);
                engine.create("game", "table", players.get(0), players.get(1));
                time.set(now);
                return engine;
            }
            case "DICE" -> {
                FarkleEngine engine = new FarkleEngine(mapper, clock, events::add, router, () -> 1, () -> 0);
                engine.create("game", "table", players, 2000);
                return engine;
            }
            case "ONE_CARD" -> {
                OneCardEngine engine = new OneCardEngine(mapper, clock, events::add, router,
                        cards -> { }, bound -> 0, ForfeitHandPolicy.REMOVE);
                engine.create("game", "table", players);
                return engine;
            }
            case "LIAR_BRIDGE" -> {
                BridgeEngine engine = new BridgeEngine(mapper, clock, events::add, router, () -> 1, bound -> 0);
                engine.create("game", "table", players);
                return engine;
            }
            default -> throw new IllegalArgumentException(code);
        }
    }

    private GraceExpiration departure(long userId, GameDepartureReason reason) {
        return new GraceExpiration(UUID.randomUUID(), userId, "game", now, now, Action.FORFEIT, reason);
    }

    private List<GameParticipantLeft> departures() {
        return events.stream().filter(GameParticipantLeft.class::isInstance).map(GameParticipantLeft.class::cast).toList();
    }

    private GameFinished finished() {
        var finished = events.stream().filter(GameFinished.class::isInstance).map(GameFinished.class::cast).toList();
        assertThat(finished).hasSize(1);
        return finished.getFirst();
    }
}
