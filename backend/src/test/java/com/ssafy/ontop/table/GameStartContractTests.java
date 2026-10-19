package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.start.GameStartCommand;
import com.ssafy.ontop.game.start.GameStartCommand.Participant;
import com.ssafy.ontop.game.start.GameStartResult;
import com.ssafy.ontop.game.start.GameStartResult.Outcome;
import com.ssafy.ontop.game.start.LocalGameStartGateway;
import com.ssafy.ontop.game.start.LocalGameStartGateway.Scenario;
import com.ssafy.ontop.table.domain.TableStartAttempt;
import com.ssafy.ontop.table.dto.TableProtocol;
import com.ssafy.ontop.table.dto.TableProtocol.RequestException;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class GameStartContractTests {

    private final GameStartCommand command = new GameStartCommand(UUID.randomUUID(), "table-1", 4, "OMOK",
            List.of(new Participant("dev-first", 1), new Participant("dev-second", 2)));

    @Test
    void 검증_대역은_같은_ID에_같은_결과를_주고_다른_내용은_충돌로_거절한다() {
        LocalGameStartGateway gateway = new LocalGameStartGateway(Scenario.SUCCESS, 0);
        GameStartResult first = gateway.startGame(command);
        GameStartResult duplicate = gateway.startGame(command);
        GameStartCommand other = new GameStartCommand(command.startAttemptId(), "table-2", 4, "OMOK",
                command.participants());

        assertThat(duplicate).isEqualTo(first);
        assertThat(gateway.findStartResult(command.startAttemptId())).isEqualTo(first);
        assertThat(gateway.startGame(other).outcome()).isEqualTo(Outcome.CONFLICT);
        assertThat(first.gameSessionId()).startsWith("demo-game-");
    }

    @Test
    void 검증_대역의_거절과_지연_결과를_구분한다() {
        LocalGameStartGateway rejected = new LocalGameStartGateway(Scenario.REJECT, 0);
        LocalGameStartGateway delayed = new LocalGameStartGateway(Scenario.DELAYED_SUCCESS, 60000);

        assertThat(rejected.startGame(command).outcome()).isEqualTo(Outcome.REJECTED);
        assertThat(delayed.startGame(command).outcome()).isEqualTo(Outcome.PENDING);
        assertThat(delayed.findStartResult(command.startAttemptId()).outcome()).isEqualTo(Outcome.PENDING);
        assertThat(delayed.findStartResult(UUID.randomUUID()).outcome()).isEqualTo(Outcome.PENDING);
    }

    @Test
    void 검증_대역에_실제_계정_ID를_전달하지_않는다() {
        LocalGameStartGateway gateway = new LocalGameStartGateway(Scenario.SUCCESS, 0);
        GameStartCommand realAccount = new GameStartCommand(UUID.randomUUID(), "table-1", 4, "OMOK",
                List.of(new Participant("101", 1), new Participant("102", 2)));

        assertThatThrownBy(() -> gateway.startGame(realAccount)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 참가자_중복과_좌석_중복을_허용하지_않는다() {
        assertThatThrownBy(() -> new GameStartCommand(UUID.randomUUID(), "table-1", 4, "OMOK",
                List.of(new Participant("dev-first", 1), new Participant("dev-first", 2))))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> new GameStartCommand(UUID.randomUUID(), "table-1", 4, "OMOK",
                List.of(new Participant("dev-first", 1), new Participant("dev-second", 1))))
                .isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    void 성공_참가자_판돈_게임_ID와_거절_모순을_검사한다() {
        List<GameStartResult> invalid = List.of(
                new GameStartResult(command.startAttemptId(), Outcome.SUCCEEDED, null,
                        command.participants(), 1, 2, null),
                new GameStartResult(command.startAttemptId(), Outcome.SUCCEEDED, "game", List.of(), 1, 2, null),
                new GameStartResult(command.startAttemptId(), Outcome.SUCCEEDED, "game",
                        command.participants(), 2, 4, null),
                new GameStartResult(command.startAttemptId(), Outcome.REJECTED, "game", List.of(), 0, 0, "REJECTED"));

        for (GameStartResult result : invalid) {
            TableStartAttempt attempt = new TableStartAttempt(command, 0);
            attempt.apply(result);

            assertThat(attempt.starting()).isTrue();
            assertThat(attempt.view(1).code()).isEqualTo("START_RESULT_INVALID");
        }
    }

    @Test
    void 추가_조회_메시지는_검증_모드에서만_빈_payload로_허용한다() {
        String request = "{\"requestId\":\"check-1\",\"type\":\"GAME_START_CHECK\",\"payload\":{}}";
        TableProtocol disabled = new TableProtocol(new ObjectMapper());
        TableProtocol enabled = new TableProtocol(new ObjectMapper(), true);

        assertThatThrownBy(() -> disabled.parse(request)).isInstanceOfSatisfying(RequestException.class,
                exception -> assertThat(exception.code()).isEqualTo("UNSUPPORTED_MESSAGE_TYPE"));
        assertThat(enabled.parse(request).type()).isEqualTo("GAME_START_CHECK");
        assertThatThrownBy(() -> enabled.parse(request.replace("{}", "{\"tableId\":\"table-1\"}")))
                .isInstanceOfSatisfying(RequestException.class,
                        exception -> assertThat(exception.code()).isEqualTo("INVALID_PAYLOAD"));
    }
}
