package com.ssafy.ontop.table;

import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.action.GameActionResult;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, GameStateWebSocketTests.Fixture.class,
        GameActionWebSocketTests.Fixture.class})
@DirtiesContext
class GameActionWebSocketTests {

    @LocalServerPort
    private int port;

    @Test
    void 실제인증소켓의_복구후입력과_관전자입력차단을_확인한다() throws Exception {
        try (ScenarioClient player = new ScenarioClient(port, "naver");
                ScenarioClient spectator = new ScenarioClient(port, "ssafy")) {
            player.state("RESTORED");
            spectator.state("LOBBY");
            var payload = Map.of("gameId", "game-1", "actionId", "action-1", "expectedVersion", 8,
                    "input", Map.of("x", 3));
            var accepted = player.request("GAME_ACTION_SEND", payload);
            assertThat(accepted.path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
            assertThat(accepted.path("payload").path("version").asLong()).isEqualTo(9);
            spectator.assertNoMessage(message -> message.path("type").asText().equals("GAME_ACTION_RESULT"));
            var denied = spectator.request("GAME_ACTION_SEND", payload);
            assertThat(denied.path("payload").path("code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
            var wrongGame = player.request("GAME_ACTION_SEND", Map.of("gameId", "other", "actionId", "a",
                    "expectedVersion", 8, "input", Map.of()));
            assertThat(wrongGame.path("payload").path("code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Fixture {
        @Bean
        GameActionGateway actions() {
            return command -> {
                assertThat(command.userId()).isEqualTo(101);
                assertThat(command.gameId()).isEqualTo("game-1");
                return new GameActionResult(command.userId(), command.gameId(), command.actionId(), 9);
            };
        }
    }
}
