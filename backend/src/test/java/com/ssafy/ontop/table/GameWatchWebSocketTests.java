package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.state.GameStateChanged;
import com.ssafy.ontop.game.state.GameStateGateway;
import com.ssafy.ontop.game.state.GameStateView;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicBoolean;
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
@Import({AuthenticatedWebSocketTests.AuthFixture.class, GameWatchWebSocketTests.Fixture.class, AllowedWatchFixture.class})
@DirtiesContext
class GameWatchWebSocketTests {

    @LocalServerPort
    private int port;

    @Autowired
    private ApplicationEventPublisher events;

    @Autowired
    private AtomicLong version;

    @Autowired
    private AtomicBoolean allowed;

    @Test
    void 실제소켓에서_참가자개인상태와_관전자공개상태를_분리하고_해제와_권한회수를_반영한다() throws Exception {
        try (ScenarioClient player = new ScenarioClient(port, "naver");
                ScenarioClient spectator = new ScenarioClient(port, "ssafy")) {
            player.state("RESTORED");
            spectator.state("LOBBY");
            assertPublic(spectator.request("GAME_WATCH", Map.of("gameId", "game-1")), 8);
            version.set(9);
            spectator.assertNoMessageDuring(message -> message.toString().contains("mine-101"), () -> {
                events.publishEvent(new GameStateChanged("game-1", 9));
                assertPublic(spectator.await(GameWatchWebSocketTests::automaticState), 9);
                return null;
            });
            var playerState = player.await(GameWatchWebSocketTests::automaticState);
            assertThat(playerState.path("payload").path("privateState").path("hand").asText()).isEqualTo("mine-101");
            assertThat(spectator.request("GAME_UNWATCH", Map.of()).path("type").asText()).isEqualTo("GAME_WATCH_LEFT");
            version.set(10);
            events.publishEvent(new GameStateChanged("game-1", 10));
            spectator.assertNoMessage(GameWatchWebSocketTests::automaticState);
            assertPublic(spectator.request("GAME_WATCH", Map.of("gameId", "game-1")), 10);
            allowed.set(false);
            events.publishEvent(new GameStateChanged("game-1", 10));
            var revoked = spectator.await(message -> message.path("type").asText().equals("ERROR"));
            assertThat(revoked.path("payload").path("code").asText()).isEqualTo("GAME_STATE_ACCESS_DENIED");
            assertThat(spectator.request("GAME_UNWATCH", Map.of()).path("payload").path("code").asText())
                    .isEqualTo("GAME_NOT_WATCHING");
        }
    }

    private static boolean automaticState(JsonNode message) {
        return message.path("type").asText().equals("GAME_STATE") && message.path("requestId").isNull();
    }

    private void assertPublic(JsonNode message, long expectedVersion) {
        assertThat(message.path("type").asText()).isEqualTo("GAME_STATE");
        assertThat(message.path("payload").path("role").asText()).isEqualTo("SPECTATOR");
        assertThat(message.path("payload").path("version").asLong()).isEqualTo(expectedVersion);
        assertThat(message.path("payload").path("privateState").isEmpty()).isTrue();
        assertThat(message.toString()).doesNotContain("mine-101");
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Fixture {
        private final ObjectMapper mapper = new ObjectMapper();

        @Bean
        AtomicLong version() {
            return new AtomicLong(8);
        }

        @Bean
        AtomicBoolean allowed() {
            return new AtomicBoolean(true);
        }

        @Bean
        GameStateGateway states(AtomicLong version, AtomicBoolean allowed) {
            return (userId, gameId) -> {
                if (!gameId.equals("game-1") || (userId == 202 && !allowed.get())) {
                    return Optional.empty();
                }
                boolean player = userId == 101;
                return Optional.of(new GameStateView(userId, gameId, version.get(),
                        player ? GameStateView.Role.PLAYER : GameStateView.Role.SPECTATOR,
                        mapper.createObjectNode().put("turn", 101), player
                                ? mapper.createObjectNode().put("hand", "mine-101") : mapper.createObjectNode()));
            };
        }

        @Bean
        GameRecoveryGateway recovery(AtomicLong version) {
            return new GameRecoveryGateway() {
                @Override
                public Optional<GameRecoverySnapshot> load(long userId) {
                    return userId == 101 ? Optional.of(new GameRecoverySnapshot(101, "game-1", 2, version.get(),
                            GameRecoverySnapshot.Phase.PLAYING, mapper.createObjectNode())) : Optional.empty();
                }

                @Override
                public void graceExpired(GraceExpiration expiration) {
                    // 실제 엔진을 대신하는 관전 연결 검증 대역.
                }
            };
        }
    }
}
