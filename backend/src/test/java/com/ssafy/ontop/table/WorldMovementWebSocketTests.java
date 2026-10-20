package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.websocket.heartbeat.interval=100ms", "ontop.websocket.heartbeat.timeout=1s",
        "ontop.world.movement.minimum-interval=1ns",
        "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=하나",
        "ontop.world.channels[0].capacity=3",
        "ontop.world.channels[1].channel-id=two", "ontop.world.channels[1].name=둘",
        "ontop.world.channels[1].capacity=3"
})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WorldMovementWebSocketTests {

    @LocalServerPort
    private int port;

    @Test
    void 다른_채널_위치는_보내지_않고_늦은_입장자에게_최신_위치를_준다() throws Exception {
        try (ScenarioClient first = connect("naver"); ScenarioClient second = connect("ssafy")) {
            join(first, "one");
            JsonNode moved = first.request("WORLD_MOVE", move(1, 12)).path("payload");
            assertThat(avatar(moved, "101").path("position").path("x").asDouble()).isEqualTo(12);
            JsonNode isolated = join(second, "two");
            assertThat(isolated.path("avatars")).hasSize(1);
            assertThat(isolated.path("avatars").get(0).path("userId").asText()).isEqualTo("202");
            second.request("CHANNEL_LEAVE", Map.of());
            JsonNode late = join(second, "one");
            assertThat(avatar(late, "101").path("position").path("x").asDouble()).isEqualTo(12);
            assertThat(avatar(late, "202").path("position").isNull()).isTrue();
            first.await(message -> message.path("type").asText().equals("WORLD_STATE")
                    && message.path("payload").path("avatars").size() == 2);
            JsonNode latest = second.request("WORLD_MOVE", move(0, -3)).path("payload");
            assertThat(first.await(message -> message.path("type").asText().equals("WORLD_STATE"))
                    .path("payload")).isEqualTo(latest);
            assertThat(second.request("WORLD_MOVE", move(0, 999)).path("payload")).isEqualTo(latest);
        }
    }

    @Test
    void heartbeat로_위치를_정리하고_같은_계정_재접속은_과거_위치를_복구하지_않는다() throws Exception {
        try (ScenarioClient first = connect("naver"); ScenarioClient silent = connect("ssafy")) {
            join(first, "one");
            join(silent, "one");
            first.request("WORLD_MOVE", move(10, 5));
            silent.request("WORLD_MOVE", move(20, 8));
            first.await(message -> message.path("type").asText().equals("WORLD_STATE")
                    && avatar(message.path("payload"), "202").path("position").path("sequence").asLong() == 20);
            silent.stopPong();
            silent.awaitClose();
            JsonNode cleaned = first.await(message -> message.path("type").asText().equals("WORLD_STATE")
                    && message.path("payload").path("avatars").size() == 1).path("payload");
            assertThat(avatar(cleaned, "101").path("position").path("x").asDouble()).isEqualTo(5);
            try (ScenarioClient returned = connect("ssafy")) {
                JsonNode state = join(returned, "one");
                assertThat(avatar(state, "202").path("position").isNull()).isTrue();
                JsonNode newMove = returned.request("WORLD_MOVE", move(0, 2)).path("payload");
                assertThat(avatar(newMove, "202").path("position").path("sequence").asLong()).isZero();
            }
        }
    }

    private ScenarioClient connect(String login) throws Exception {
        ScenarioClient client = new ScenarioClient(port, login);
        client.await(message -> message.path("type").asText().equals("CONNECTED"));
        return client;
    }

    private JsonNode join(ScenarioClient client, String channel) throws Exception {
        client.request("CHANNEL_JOIN", Map.of("channelId", channel));
        return client.await(message -> message.path("type").asText().equals("WORLD_STATE")).path("payload");
    }

    private JsonNode avatar(JsonNode state, String userId) {
        for (JsonNode avatar : state.path("avatars")) {
            if (avatar.path("userId").asText().equals(userId)) {
                return avatar;
            }
        }
        return com.fasterxml.jackson.databind.node.MissingNode.getInstance();
    }

    private Map<String, Object> move(long sequence, double x) {
        return Map.of("sequence", sequence, "x", x, "y", 0, "z", -2, "yaw", 0.5);
    }
}
