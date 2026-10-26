package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.movement.ParkScene;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.world.map.require-match=true",
        "ontop.websocket.heartbeat.interval=100ms", "ontop.websocket.heartbeat.timeout=1s"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, FullFlowTests.Fixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WorldMapRecoveryTests {
    @LocalServerPort
    private int port;

    @Autowired
    private FullFlowTests.Engine engine;

    @Autowired
    private FullFlowTests.TestClock clock;

    @ParameterizedTest
    @ValueSource(ints = {29, 30})
    void 확인_전_복구를_보류하고_재확인으로_기존_30초_기한을_연장하지_않는다(int seconds) throws Exception {
        try (ScenarioClient first = connect("naver"); ScenarioClient second = connect("ssafy")) {
            confirm(first);
            confirm(second);
            first.state("LOBBY");
            second.state("LOBBY");
            first.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            second.request("TABLE_JOIN", Map.of("tableId", "table-1"));
            JsonNode selected = first.request("GAME_SELECT", Map.of("gameCode", "DICE", "targetScore", 2000,
                    "betAmountPerPlayer", 1));
            assertThat(selected.path("type").asText()).isEqualTo("TABLE_STATE");
            ready(first);
            engine.activate(ready(second).path("payload"));
            engine.loads.clear();
            // 단절 처리가 끝날 때까지 TestClock은 고정되어 서버의 disconnectedAt과 같은 시각이다.
            var originalDeadline = clock.instant().plusSeconds(30);
            first.stopPong();
            assertThat(first.awaitClose()).isEqualTo(1001);
            assertThat(engine.loads.poll(5, TimeUnit.SECONDS)).isEqualTo(101L);
            clock.now = clock.now.plusSeconds(29);

            try (ScenarioClient returned = connect("naver")) {
                returned.assertNoMessage(message -> message.path("type").asText().equals("GAME_CONNECTION_STATE"));
                assertThat(engine.loads).isEmpty();
                assertThat(returned.request("GAME_RECONNECT_CHECK", Map.of())
                        .path("payload").path("code").asText()).isEqualTo("MAP_VERSION_REQUIRED");
                clock.now = clock.now.plusSeconds(seconds - 29);
                confirm(returned);
                JsonNode state = returned.state(seconds == 29 ? "RESTORED" : "EXPIRED");
                if (seconds == 29) {
                    assertThat(state.path("state").path("turnDeadline").asText()).isEqualTo(engine.turnDeadline);
                    assertThat(engine.expirations).isEmpty();
                } else {
                    assertThat(state.path("state").isNull()).isTrue();
                    var expiration = engine.expirations.poll(5, TimeUnit.SECONDS);
                    assertThat(expiration).isNotNull();
                    assertThat(expiration.deadline()).isEqualTo(originalDeadline);
                }
                engine.loads.clear();
                confirm(returned);
                returned.assertNoMessage(message -> message.path("type").asText().equals("GAME_CONNECTION_STATE"));
                assertThat(engine.loads).isEmpty();
            }
        }
    }

    private ScenarioClient connect(String login) throws Exception {
        ScenarioClient client = new ScenarioClient(port, login);
        client.await(message -> message.path("type").asText().equals("CONNECTED"));
        return client;
    }

    private JsonNode ready(ScenarioClient client) throws Exception {
        // 같은 테이블 재조회는 좌석/준비/version을 바꾸지 않으며 최신 TABLE_STATE를 응답한다.
        JsonNode response = client.request("TABLE_JOIN", Map.of("tableId", "table-1"));
        assertThat(response.path("type").asText()).isEqualTo("TABLE_STATE");
        JsonNode observed = response.path("payload");
        JsonNode reply = client.request("READY_SET", Map.of("ready", true,
                "betAmountPerPlayer", observed.path("betAmountPerPlayer").longValue(),
                "expectedVersion", observed.path("version").longValue()));
        assertThat(reply.path("type").asText()).as("READY_SET 오류 코드=%s", reply.at("/payload/code").asText())
                .isEqualTo("TABLE_STATE");
        return reply;
    }

    private void confirm(ScenarioClient client) throws Exception {
        JsonNode reply = client.request("WORLD_MAP_CONFIRM", ParkScene.load().metadata());
        assertThat(reply.path("type").asText()).isEqualTo("WORLD_MAP_STATE");
        assertThat(reply.path("payload").path("verified").asBoolean()).isTrue();
    }
}
