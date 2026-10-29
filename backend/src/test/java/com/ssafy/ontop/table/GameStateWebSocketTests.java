package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.state.GameStateGateway;
import com.ssafy.ontop.game.state.GameStateView;
import java.util.Map;
import java.util.Optional;
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
@Import({AuthenticatedWebSocketTests.AuthFixture.class, GameStateWebSocketTests.Fixture.class, AllowedWatchFixture.class})
@DirtiesContext
class GameStateWebSocketTests {

    @LocalServerPort
    private int port;

    @Test
    void 실제소켓에서_참가자와_관전자_정보를_분리한다() throws Exception {
        try (ScenarioClient player = new ScenarioClient(port, "naver");
                ScenarioClient spectator = new ScenarioClient(port, "ssafy")) {
            player.state("RESTORED");
            spectator.state("LOBBY");
            var state = player.request("GAME_STATE_CHECK", Map.of("gameId", "game-1"));
            assertThat(state.path("type").asText()).isEqualTo("GAME_STATE");
            assertThat(state.path("payload").path("privateState").path("hand").asText()).isEqualTo("mine-101");
            spectator.assertNoMessage(message -> message.path("type").asText().equals("GAME_STATE"));
            var watched = spectator.request("GAME_STATE_CHECK", Map.of("gameId", "game-1"));
            assertThat(watched.path("type").asText()).isEqualTo("GAME_STATE");
            assertThat(watched.path("payload").path("role").asText()).isEqualTo("SPECTATOR");
            assertThat(watched.path("payload").path("privateState").isEmpty()).isTrue();
            assertThat(watched.toString()).doesNotContain("mine-101");
            var denied = player.request("GAME_STATE_CHECK", Map.of("gameId", "other"));
            assertThat(denied.path("payload").path("code").asText()).isEqualTo("GAME_STATE_ACCESS_DENIED");
        }
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Fixture {
        private final ObjectMapper mapper = new ObjectMapper();

        @Bean
        GameStateGateway states() {
            return (userId, gameId) -> {
                if (!gameId.equals("game-1")) {
                    return Optional.empty();
                }
                boolean player = userId == 101;
                return Optional.of(new GameStateView(userId, gameId, 8,
                        player ? GameStateView.Role.PLAYER : GameStateView.Role.SPECTATOR,
                        mapper.createObjectNode().put("turn", 101),
                        player ? mapper.createObjectNode().put("hand", "mine-101") : mapper.createObjectNode()));
            };
        }

        @Bean
        GameRecoveryGateway recovery() {
            return new GameRecoveryGateway() {
                @Override
                public Optional<GameRecoverySnapshot> load(long userId) {
                    return userId == 101 ? Optional.of(new GameRecoverySnapshot(101, "game-1", 2, 8,
                            GameRecoverySnapshot.Phase.PLAYING, mapper.createObjectNode())) : Optional.empty();
                }

                @Override
                public void graceExpired(GraceExpiration expiration) {
                    // 종료를 만들지 않는 조회 전용 테스트 대역.
                }
            };
        }
    }
}
