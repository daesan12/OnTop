package com.ssafy.ontop.game.farkle;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway.Rejected;
import com.ssafy.ontop.game.action.GameActionGateway.Rejection;
import com.ssafy.ontop.game.action.GameForfeitCommand;
import com.ssafy.ontop.game.engine.GameEngineRouter;
import com.ssafy.ontop.game.farkle.domain.FarkleMatch;
import com.ssafy.ontop.game.farkle.service.FarkleEngine;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.result.GameFinished;
import com.ssafy.ontop.game.result.GameParticipantLeft;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.IntStream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class FarkleMultiplayerTests {
    private static final Instant NOW = Instant.parse("2026-11-03T00:00:00Z");
    private final ObjectMapper mapper = new ObjectMapper();

    @ParameterizedTest
    @ValueSource(ints = {2, 3, 4})
    void 모든_좌석에_점수를_저장하고_좌석순서로_두바퀴_순환한다(int count) {
        List<Long> players = IntStream.rangeClosed(1, count).mapToObj(value -> (long) value).toList();
        FarkleMatch match = new FarkleMatch("dice", "table", players, count - 1, 4000, NOW, () -> 5);

        for (int step = 0; step < count * 2; step++) {
            long actor = players.get((count - 1 + step) % count);
            assertThat(match.snapshot().turnUserId()).isEqualTo(actor);
            match.apply(command(actor, "roll-" + step, match.snapshot().version(), "roll", List.of()), NOW);
            match.apply(command(actor, "bank-" + step, match.snapshot().version(), "bank", List.of(0)), NOW);
        }

        assertThat(match.snapshot().scores()).containsOnly(100L).hasSize(count);
        assertThat(match.snapshot().turnUserId()).isEqualTo(players.getLast());
        assertThat(match.snapshot().round()).isEqualTo(1 + count * 2);
    }

    @Test
    void 기권자는_차례에서_제외하고_지연된_시간초과도_남은_인원으로_순환한다() {
        FarkleMatch match = new FarkleMatch("dice", "table", List.of(1L, 2L, 3L, 4L), 0, 4000, NOW, () -> 5);
        match.forfeit(2L, NOW, "EXPLICIT_LEAVE");
        assertThat(match.snapshot().turnDeadline()).isEqualTo(NOW.plusSeconds(30));

        match.expire(NOW.plusSeconds(90));

        assertThat(match.snapshot().turnUserId()).isEqualTo(1L);
        assertThat(match.snapshot().round()).isEqualTo(4);
        assertThat(match.snapshot().turnDeadline()).isEqualTo(NOW.plusSeconds(120));
        assertThat(match.snapshot().forfeitedUserIds()).containsExactly(2L);
        assertThatThrownBy(() -> match.apply(command(2L, "late", 4, "roll", List.of()), NOW.plusSeconds(91)))
                .isInstanceOfSatisfying(Rejected.class, error -> assertThat(error.reason()).isEqualTo(Rejection.NOT_ACTIVE));
        match.forfeit(1L, NOW.plusSeconds(91), "EXPLICIT_LEAVE");
        assertThat(match.snapshot().turnUserId()).isEqualTo(3L);
        match.forfeit(4L, NOW.plusSeconds(91), "LOGOUT");
        assertThat(match.snapshot().winnerUserId()).isEqualTo(3L);
        assertThat(match.snapshot().endReason()).isEqualTo("LAST_PLAYER_STANDING");
    }

    @Test
    void 네번째_좌석의_목표달성은_즉시_승리하며_중복입력은_재적용하지_않는다() {
        FarkleMatch match = new FarkleMatch("dice", "table", List.of(1L, 2L, 3L, 4L), 3, 2000, NOW, () -> 1);
        match.apply(command(4L, "roll", 0, "roll", List.of()), NOW);
        var bank = command(4L, "win", 1, "bank", List.of(0, 1, 2, 3));
        var receipt = match.apply(bank, NOW);

        assertThat(match.apply(bank, NOW)).isEqualTo(receipt);
        assertThat(match.snapshot().scores()).containsExactly(0L, 0L, 0L, 2000L);
        assertThat(match.snapshot().winnerUserId()).isEqualTo(4L);
        assertThat(match.snapshot().turnDeadline()).isNull();
    }

    @Test
    void 기권_재접속_공개상태와_중복_이탈은_같은_참가명단과_최종결과를_유지한다() {
        List<Object> events = new ArrayList<>();
        GameEngineRouter router = new GameEngineRouter();
        FarkleEngine engine = new FarkleEngine(mapper, Clock.fixed(NOW, ZoneOffset.UTC), events::add, router,
                () -> 5, bound -> bound - 1);
        List<Long> players = List.of(1L, 2L, 3L, 4L);
        engine.create("7", "table", players, 4000);
        engine.create("7", "table", players, 4000);
        var command = new GameForfeitCommand(1L, "7", "leave");
        engine.forfeit(command);
        engine.forfeit(command);

        assertThat(engine.load(1L).orElseThrow().phase().name()).isEqualTo("ELIMINATED");
        assertThat(engine.load(2L).orElseThrow().participantCount()).isEqualTo(4);
        assertThat(engine.load(2L).orElseThrow().phase().name()).isEqualTo("PLAYING");
        var spectator = engine.load(99L, "7").orElseThrow();
        assertThat(spectator.publicState().path("forfeitedUserIds").get(0).asText()).isEqualTo("1");
        assertThat(spectator.privateState().isEmpty()).isTrue();
        var expired = new GameRecoveryGateway.GraceExpiration(java.util.UUID.randomUUID(), 2L, "7", NOW,
                NOW, GameRecoveryGateway.Action.ELIMINATE);
        engine.graceExpired(expired);
        engine.graceExpired(expired);
        engine.forfeit(new GameForfeitCommand(3L, "7", "leave-3"));

        assertThat(events.stream().filter(GameParticipantLeft.class::isInstance)).hasSize(3);
        List<GameFinished> finished = events.stream().filter(GameFinished.class::isInstance).map(GameFinished.class::cast).toList();
        assertThat(finished).hasSize(1);
        assertThat(finished.getFirst().participants()).hasSize(4);
        assertThat(finished.getFirst().participants().stream().filter(player -> player.result() == GameFinished.Result.WIN)
                .map(GameFinished.Participant::userId)).containsExactly(4L);
        assertThat(engine.load(4L).orElseThrow().phase().name()).isEqualTo("FINISHED");
    }

    private GameActionCommand command(long user, String action, long version, String kind, List<Integer> ids) {
        return new GameActionCommand(user, "dice", action, version,
                mapper.valueToTree(java.util.Map.of("kind", kind, "selectedIds", ids)));
    }
}
