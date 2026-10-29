package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.game.result.GameResultCommitted;
import com.ssafy.ontop.game.result.GameResultGateway;
import com.ssafy.ontop.game.result.GameResultView;
import com.ssafy.ontop.game.result.GameResultView.SettlementStatus;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
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
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.websocket.heartbeat.interval=200ms", "ontop.websocket.heartbeat.timeout=2s"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, GameResultWebSocketTests.Fixture.class})
@DirtiesContext
class GameResultWebSocketTests {
    @LocalServerPort
    private int port;
    @Autowired
    private ApplicationEventPublisher events;
    @Autowired
    private Fixture fixture;

    @Test
    void 종료대기와_개인정산완료를_분리하고_재접속후_저장결과만_조회한다() throws Exception {
        try (ScenarioClient first = new ScenarioClient(port, "naver");
                ScenarioClient second = new ScenarioClient(port, "ssafy");
                ScenarioClient spectator = new ScenarioClient(port, "spectator")) {
            first.await(message -> message.path("type").asText().equals("CONNECTED"));
            second.await(message -> message.path("type").asText().equals("CONNECTED"));
            spectator.await(message -> message.path("type").asText().equals("CONNECTED"));
            spectator.assertNoMessageDuring(GameResultWebSocketTests::isResult, () -> {
                fixture.results.put(101L, GameResultTests.result(101, "701", 1, SettlementStatus.PENDING));
                events.publishEvent(new GameResultCommitted(fixture.results.get(101L)));
                assertThat(first.request("GAME_RESULT_CHECK", Map.of("gameSessionId", "701")).path("payload").path("myCoinDelta").isNull())
                        .isTrue();
                for (long user : new long[]{101, 202}) {
                    fixture.results.put(user, GameResultTests.result(user, "701", 2, SettlementStatus.SETTLED));
                    events.publishEvent(new GameResultCommitted(fixture.results.get(user)));
                }
                assertDelta(first.request("GAME_RESULT_CHECK", Map.of("gameSessionId", "701")), 1);
                assertDelta(second.request("GAME_RESULT_CHECK", Map.of("gameSessionId", "701")), -1);
                assertThat(spectator.request("GAME_RESULT_CHECK", Map.of("gameSessionId", "701"))
                        .path("payload").path("code").asText()).isEqualTo("GAME_RESULT_ACCESS_DENIED");
                first.stopPong();
                assertThat(first.awaitClose()).isEqualTo(1001);
                try (ScenarioClient returned = new ScenarioClient(port, "naver")) {
                    assertDelta(returned.request("GAME_RESULT_CHECK", Map.of("gameSessionId", "701")), 1);
                    assertDelta(returned.request("GAME_RESULT_CHECK", Map.of("gameSessionId", "701")), 1);
                }
                return null;
            });
        }
    }

    private static boolean isResult(JsonNode message) {
        return message.path("type").asText().equals("GAME_RESULT");
    }

    private static void assertDelta(JsonNode message, long delta) {
        assertThat(message.path("type").asText()).isEqualTo("GAME_RESULT");
        assertThat(message.path("payload").path("settlementStatus").asText()).isEqualTo("SETTLED");
        assertThat(message.path("payload").path("myCoinDelta").asLong()).isEqualTo(delta);
        assertThat(message.path("payload").has("userId")).isFalse();
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class Fixture {
        private final Map<Long, GameResultView> results = new ConcurrentHashMap<>();

        @Bean
        GameResultGateway results() {
            return (user, game) -> Optional.ofNullable(results.get(user))
                    .filter(result -> result.gameSessionId().equals(game));
        }
    }
}
