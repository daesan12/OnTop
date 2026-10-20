package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateGateway;
import com.ssafy.ontop.game.state.GameStateView;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, GameStatePushWebSocketTests.Fixture.class})
@DirtiesContext
class GameStatePushWebSocketTests {

    @LocalServerPort
    private int port;

    @Autowired
    private ApplicationEventPublisher events;

    @Autowired
    private AtomicLong version;

    @Test
    void 실제두소켓에_입력후와_서버이벤트후_각자개인상태가_자동도착한다() throws Exception {
        try (ScenarioClient first = new ScenarioClient(port, "naver");
                ScenarioClient second = new ScenarioClient(port, "ssafy")) {
            first.state("RESTORED");
            second.state("RESTORED");
            var accepted = first.request("GAME_ACTION_SEND", Map.of("gameId", "game-1", "actionId", "a",
                    "expectedVersion", 8, "input", Map.of("x", 3)));
            assertThat(accepted.path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
            assertState(first.await(GameStatePushWebSocketTests::automaticState), 101, 9);
            assertState(second.await(GameStatePushWebSocketTests::automaticState), 202, 9);
            version.set(10);
            events.publishEvent(new GameStateChanged("game-1", 10));
            assertState(first.await(GameStatePushWebSocketTests::automaticState), 101, 10);
            assertState(second.await(GameStatePushWebSocketTests::automaticState), 202, 10);
            events.publishEvent(new GameStateChanged("game-1", 9));
            first.assertNoMessage(GameStatePushWebSocketTests::automaticState);
            second.assertNoMessage(GameStatePushWebSocketTests::automaticState);
        }
    }

    private static boolean automaticState(JsonNode message) {
        return message.path("type").asText().equals("GAME_STATE") && message.path("requestId").isNull();
    }

    private void assertState(JsonNode message, long userId, long expectedVersion) {
        assertThat(message.path("payload").path("version").asLong()).isEqualTo(expectedVersion);
        assertThat(message.path("payload").path("publicState").path("turn").asInt()).isEqualTo(101);
        assertThat(message.path("payload").path("privateState").path("hand").asText()).isEqualTo("mine-" + userId);
        assertThat(message.toString()).doesNotContain("mine-" + (userId == 101 ? 202 : 101));
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Fixture {
        private final ObjectMapper mapper = new ObjectMapper();

        @Bean
        AtomicLong version() {
            return new AtomicLong(8);
        }

        @Bean
        GameStateGateway states(AtomicLong version) {
            return (userId, gameId) -> Optional.of(new GameStateView(userId, gameId, version.get(),
                    GameStateView.Role.PLAYER, mapper.createObjectNode().put("turn", 101),
                    mapper.createObjectNode().put("hand", "mine-" + userId)));
        }

        @Bean
        GameActionGateway actions(AtomicLong version) {
            return command -> new GameActionResult(command.userId(), command.gameId(), command.actionId(),
                    version.incrementAndGet());
        }

        @Bean
        GameRecoveryGateway recovery(AtomicLong version) {
            return new GameRecoveryGateway() {
                @Override
                public Optional<GameRecoverySnapshot> load(long userId) {
                    return Optional.of(new GameRecoverySnapshot(userId, "game-1", 2, version.get(),
                            GameRecoverySnapshot.Phase.PLAYING, mapper.createObjectNode()));
                }

                @Override
                public void graceExpired(GraceExpiration expiration) {
                    // 실제 기권 처리가 없는 상태 전송 검증 대역.
                }
            };
        }
    }
}
