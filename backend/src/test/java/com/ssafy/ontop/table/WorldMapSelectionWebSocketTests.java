package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.map.PreparedParkMap;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.movement.ParkScene;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.world.map.source=generated", "ontop.world.map.require-match=true",
        "ontop.world.channels[0].channel-id=channel-1", "ontop.world.channels[0].name=선택검증",
        "ontop.world.channels[0].capacity=4"
})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
@EnabledIfEnvironmentVariable(named = "TEST_GENERATED_MAP_DIR", matches = ".+")
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class WorldMapSelectionWebSocketTests {
    @LocalServerPort
    private int port;
    @Autowired
    private WorldMapRuntime runtime;
    @Autowired
    private TableHub hub;
    private final ObjectMapper mapper = new ObjectMapper();

    @DynamicPropertySource
    static void files(DynamicPropertyRegistry properties) {
        Path input = Path.of(System.getenv("TEST_GENERATED_MAP_DIR"));
        properties.add("ontop.world.map.json-path", () -> input.resolve("server-map.json").toAbsolutePath().toString());
        properties.add("ontop.world.map.manifest-path",
                () -> input.resolve("manifest.json").toAbsolutePath().toString());
    }

    @Test
    void 실제_앱의_선택설정으로_새맵_확인과_16번_착석_준비를_연결한다() throws Exception {
        try (ScenarioClient first = new ScenarioClient(port, "naver");
                ScenarioClient second = new ScenarioClient(port, "ssafy")) {
            var connected = first.await(message -> message.path("type").asText().equals("CONNECTED"));
            assertThat(connected.path("payload").path("map")).isEqualTo(mapper.valueToTree(runtime.scene().metadata()));
            assertThat(first.request("WORLD_MAP_CONFIRM", ParkScene.load().metadata())
                    .path("payload").path("code").asText()).isEqualTo("MAP_VERSION_MISMATCH");
            assertThat(first.request("WORLD_MAP_CONFIRM", runtime.scene().metadata()).path("type").asText())
                    .isEqualTo("WORLD_MAP_STATE");
            assertThat(second.request("WORLD_MAP_CONFIRM", runtime.scene().metadata()).path("type").asText())
                    .isEqualTo("WORLD_MAP_STATE");
            first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            second.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
            assertThat(hub.listTables("channel-1").tables()).hasSize(16);
            String table = PreparedParkMap.serverTableId("channel-1", 16);
            first.request("TABLE_JOIN", Map.of("tableId", table));
            assertThat(first.request("GAME_SELECT", Map.of("gameCode", "OMOK", "betAmountPerPlayer", 1))
                    .path("type").asText()).isEqualTo("TABLE_STATE");
            second.request("TABLE_JOIN", Map.of("tableId", table));
            ready(first, table);
            assertThat(ready(second, table).path("payload").path("allReady").asBoolean()).isTrue();
            assertThat(ParkScene.load().metadata().schemaVersion()).isEqualTo(1);
        }
    }

    private JsonNode ready(ScenarioClient client, String table) throws Exception {
        JsonNode state = client.request("TABLE_JOIN", Map.of("tableId", table)).path("payload");
        return client.request("READY_SET", Map.of("ready", true,
                "betAmountPerPlayer", state.path("betAmountPerPlayer").longValue(),
                "expectedVersion", state.path("version").longValue()));
    }
}
