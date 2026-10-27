package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.world.movement.ParkScene;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.world.map.require-match=true",
        "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=하나",
        "ontop.world.channels[0].capacity=3"
})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class WorldMapWebSocketTests {
    @LocalServerPort
    private int port;

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void 로딩한_맵_정보를_전달하고_확인_전_입력과_복구를_차단한다() throws Exception {
        try (ScenarioClient client = new ScenarioClient(port, "naver")) {
            JsonNode connected = client.await(message -> message.path("type").asText().equals("CONNECTED"));
            assertThat(connected.path("payload").path("map"))
                    .isEqualTo(mapper.valueToTree(ParkScene.load().metadata()));
            assertThat(connected.path("payload").path("mapVerificationRequired").asBoolean()).isTrue();
            for (String type : new String[] {"CHANNEL_JOIN", "TABLE_JOIN", "WORLD_MOVE", "GAME_RECONNECT_CHECK"}) {
                Map<String, ?> payload = switch (type) {
                    case "CHANNEL_JOIN" -> Map.of("channelId", "one");
                    case "TABLE_JOIN" -> Map.of("tableId", "table-1");
                    case "WORLD_MOVE" -> Map.of("seq", 1, "dx", 0, "dz", -1, "run", false);
                    default -> Map.of();
                };
                JsonNode error = client.request(type, payload);
                assertThat(error.path("payload").path("code").asText()).isEqualTo("MAP_VERSION_REQUIRED");
                assertThat(error.path("payload").path("serverMap"))
                        .isEqualTo(connected.path("payload").path("map"));
            }
            client.assertNoMessage(message -> message.path("type").asText().equals("GAME_CONNECTION_STATE")
                    || message.path("type").asText().equals("WORLD_STATE"));

            assertThat(client.request("WORLD_MAP_CONFIRM", ParkScene.load().metadata())
                    .path("type").asText()).isEqualTo("WORLD_MAP_STATE");
            assertThat(client.request("CHANNEL_JOIN", Map.of("channelId", "one"))
                    .path("type").asText()).isEqualTo("CHANNEL_STATE");
            JsonNode world = client.await(message -> message.path("type").asText().equals("WORLD_STATE"));
            assertThat(world.path("payload").path("mapVersion").asText()).isEqualTo(ParkScene.load().version());
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"mapId", "schemaVersion", "mapVersion"})
    void 식별자_스키마_버전_중_하나라도_다르면_입장을_허용하지_않는다(String field) throws Exception {
        try (ScenarioClient client = new ScenarioClient(port, "ssafy")) {
            client.await(message -> message.path("type").asText().equals("CONNECTED"));
            var actual = ParkScene.load().metadata();
            Map<String, Object> mismatch = new HashMap<>(Map.of("mapId", actual.mapId(),
                    "schemaVersion", actual.schemaVersion(), "mapVersion", actual.mapVersion()));
            mismatch.put(field, field.equals("schemaVersion") ? 2 : field.equals("mapId") ? "another" : "0".repeat(64));

            JsonNode error = client.request("WORLD_MAP_CONFIRM", mismatch);
            assertThat(error.path("type").asText()).isEqualTo("ERROR");
            assertThat(error.path("payload").path("code").asText()).isEqualTo("MAP_VERSION_MISMATCH");
            assertThat(client.request("CHANNEL_JOIN", Map.of("channelId", "one"))
                    .path("payload").path("code").asText()).isEqualTo("MAP_VERSION_REQUIRED");
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "{\"mapId\":\"park\",\"schemaVersion\":1,\"mapVersion\":\"bad\"}",
            "{\"mapId\":\"park\",\"schemaVersion\":1.5,\"mapVersion\":\"bad\"}"})
    void 잘못된_확인_요청은_버전_승인으로_처리하지_않는다(String json) throws Exception {
        try (ScenarioClient client = new ScenarioClient(port, "spectator")) {
            client.await(message -> message.path("type").asText().equals("CONNECTED"));
            assertThat(client.request("WORLD_MAP_CONFIRM", mapper.readTree(json))
                    .path("payload").path("code").asText()).isEqualTo("INVALID_PAYLOAD");
        }
    }
}
