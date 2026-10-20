package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.game.action.GameActionCommand;
import com.ssafy.ontop.game.action.GameActionGateway;
import com.ssafy.ontop.game.action.GameActionResult;
import com.ssafy.ontop.game.reconnect.GameRecoveryGateway;
import com.ssafy.ontop.game.reconnect.GameRecoverySnapshot;
import com.ssafy.ontop.game.state.GameStateGateway;
import com.ssafy.ontop.game.state.GameStateView;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, GameCommunicationFlowTests.Fixture.class})
@DirtiesContext
class GameCommunicationFlowTests {

    @LocalServerPort
    private int port;
    @Autowired
    private Engine engine;

    @Test
    void 경기입력과_개인상태와_관전을_복귀후까지_이어검증한다() throws Exception {
        System.out.println("[SIMULATED] 인증·경기는 테스트 대역. 실제 게임 규칙·DB·정산 검증 아님.");
        try (ScenarioClient first = new ScenarioClient(port, "naver");
                ScenarioClient second = new ScenarioClient(port, "ssafy");
                ScenarioClient spectator = new ScenarioClient(port, "spectator")) {
            first.state("RESTORED");
            second.state("RESTORED");
            spectator.state("LOBBY");
            spectator.assertNoMessageDuring(GameCommunicationFlowTests::privateOrActionResult, () -> {
                assertState(spectator.request("GAME_WATCH", Map.of("gameId", "flow-game")), 505, 8);
                assertAction(first, "first", 8);
                assertState(first.await(GameCommunicationFlowTests::automaticState), 101, 9);
                assertState(second.await(GameCommunicationFlowTests::automaticState), 202, 9);
                assertState(spectator.await(GameCommunicationFlowTests::automaticState), 505, 9);
                pass("입력 확정 → 참가자 두 명의 본인 상태 / 관전자 공개 상태 분리");

                var denied = spectator.request("GAME_ACTION_SEND", action("forbidden", 9));
                assertThat(denied.path("type").asText()).isEqualTo("ERROR");
                assertThat(denied.path("payload").path("code").asText()).isEqualTo("GAME_RECOVERY_REQUIRED");
                assertThat(engine.actionCount).isEqualTo(1);
                pass("관전자 입력이 경기 담당까지 전달되지 않음");

                engine.loads.clear();
                first.stopPong();
                assertThat(first.awaitClose()).isEqualTo(1001);
                assertThat(engine.loads.poll(5, TimeUnit.SECONDS)).isEqualTo(101L);
                assertAction(second, "while-offline", 9);
                assertState(second.await(GameCommunicationFlowTests::automaticState), 202, 10);
                assertState(spectator.await(GameCommunicationFlowTests::automaticState), 505, 10);

                try (ScenarioClient returned = new ScenarioClient(port, "naver")) {
                    var restored = returned.state("RESTORED");
                    assertThat(restored.path("gameId").asText()).isEqualTo("flow-game");
                    assertThat(restored.path("version").asLong()).isEqualTo(10);
                    assertThat(restored.path("state").path("hand").asText()).isEqualTo("mine-101");
                    assertState(returned.request("GAME_STATE_CHECK", Map.of("gameId", "flow-game")), 101, 10);
                    assertAction(returned, "returned", 10);
                    assertState(returned.await(GameCommunicationFlowTests::automaticState), 101, 11);
                    assertState(second.await(GameCommunicationFlowTests::automaticState), 202, 11);
                    assertState(spectator.await(GameCommunicationFlowTests::automaticState), 505, 11);
                    pass("heartbeat 단절 중 경기 진행 → 같은 계정 최신 상태 복귀 → 입력 재개");

                    var left = spectator.request("GAME_UNWATCH", Map.of());
                    assertThat(left.path("type").asText()).isEqualTo("GAME_WATCH_LEFT");
                    spectator.assertNoMessageDuring(message -> automaticState(message)
                            || privateOrActionResult(message), () -> {
                        assertAction(returned, "after-unwatch", 11);
                        assertState(returned.await(GameCommunicationFlowTests::automaticState), 101, 12);
                        assertState(second.await(GameCommunicationFlowTests::automaticState), 202, 12);
                        return null;
                    });
                    assertThat(engine.actionCount).isEqualTo(4);
                    pass("관전 해제 후 갱신 미수신 / 참가자는 계속 갱신");
                }
                return null;
            });
        }
    }

    private static Map<String, Object> action(String id, long version) {
        return Map.of("gameId", "flow-game", "actionId", id, "expectedVersion", version,
                "input", Map.of("step", 1));
    }

    private static void assertAction(ScenarioClient client, String id, long version) throws Exception {
        var result = client.request("GAME_ACTION_SEND", action(id, version));
        assertThat(result.path("type").asText()).isEqualTo("GAME_ACTION_RESULT");
        assertThat(result.path("payload").path("actionId").asText()).isEqualTo(id);
        assertThat(result.path("payload").path("version").asLong()).isEqualTo(version + 1);
        assertThat(result.toString()).doesNotContain("mine-");
    }

    private static boolean automaticState(JsonNode message) {
        return message.path("type").asText().equals("GAME_STATE") && message.path("requestId").isNull();
    }

    private static boolean privateOrActionResult(JsonNode message) {
        return message.toString().contains("mine-") || message.path("type").asText().equals("GAME_ACTION_RESULT");
    }

    private static void assertState(JsonNode message, long userId, long version) {
        assertThat(message.path("type").asText()).isEqualTo("GAME_STATE");
        var payload = message.path("payload");
        assertThat(payload.path("gameId").asText()).isEqualTo("flow-game");
        assertThat(payload.path("version").asLong()).isEqualTo(version);
        assertThat(payload.path("publicState").path("step").asLong()).isEqualTo(version - 8);
        assertThat(payload.has("userId")).isFalse();
        assertThat(payload.path("role").asText()).isEqualTo(userId == 505 ? "SPECTATOR" : "PLAYER");
        if (userId == 505) {
            assertThat(payload.path("privateState").isObject()).isTrue();
            assertThat(payload.path("privateState").isEmpty()).isTrue();
        } else {
            assertThat(payload.path("privateState").path("hand").asText()).isEqualTo("mine-" + userId);
            assertThat(message.toString()).doesNotContain("mine-" + (userId == 101 ? 202 : 101));
        }
    }

    private static void pass(String message) {
        System.out.println("[PASS] " + message);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Fixture {
        @Bean
        Engine engine() {
            return new Engine();
        }
    }

    // 게임별 규칙·영속 멱등성을 구현하지 않는 통신 검증 대역이다.
    static class Engine implements GameRecoveryGateway, GameStateGateway, GameActionGateway {
        private final ObjectMapper mapper = new ObjectMapper();
        private final BlockingQueue<Long> loads = new LinkedBlockingQueue<>();
        private long version = 8;
        private int actionCount;

        @Override
        public synchronized GameActionResult apply(GameActionCommand command) {
            assertThat(Set.of(101L, 202L)).contains(command.userId());
            assertThat(command.gameId()).isEqualTo("flow-game");
            assertThat(command.expectedVersion()).isEqualTo(version);
            actionCount++;
            return new GameActionResult(command.userId(), command.gameId(), command.actionId(), ++version);
        }

        @Override
        public synchronized Optional<GameStateView> load(long userId, String gameId) {
            if (!gameId.equals("flow-game") || !Set.of(101L, 202L, 505L).contains(userId)) {
                return Optional.empty();
            }
            boolean spectator = userId == 505;
            return Optional.of(new GameStateView(userId, gameId, version,
                    spectator ? GameStateView.Role.SPECTATOR : GameStateView.Role.PLAYER,
                    mapper.createObjectNode().put("step", version - 8), spectator
                            ? mapper.createObjectNode() : mapper.createObjectNode().put("hand", "mine-" + userId)));
        }

        @Override
        public synchronized Optional<GameRecoverySnapshot> load(long userId) {
            loads.add(userId);
            return Set.of(101L, 202L).contains(userId)
                    ? Optional.of(new GameRecoverySnapshot(userId, "flow-game", 2, version,
                            GameRecoverySnapshot.Phase.PLAYING, mapper.createObjectNode().put("hand", "mine-" + userId)))
                    : Optional.empty();
        }

        @Override
        public void graceExpired(GraceExpiration expiration) {
            throw new AssertionError("이 시나리오는 30초 유예 안에 복귀해야 함");
        }
    }
}
