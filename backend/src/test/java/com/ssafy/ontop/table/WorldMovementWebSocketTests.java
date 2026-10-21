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
    void 서버계산_입력부터_채널위치동기화_좌표주입차단까지_확인한다() throws Exception {
        try (ScenarioClient first = connect("naver"); ScenarioClient second = connect("ssafy");
                ScenarioClient isolated = connect("spectator")) {
            JsonNode initial = join(first, "one");
            join(second, "one");
            join(isolated, "two");
            double startZ = avatar(initial,"101").path("position").path("z").asDouble();
            assertThat(initial.path("mapVersion").asText()).hasSize(64);
            assertThat(first.request("WORLD_MOVE", Map.of("sequence",1,"x",999,"y",0,"z",0,"yaw",0))
                    .path("payload").path("code").asText()).isEqualTo("INVALID_PAYLOAD");
            for (int i=1;i<=8;i++) {
                assertThat(first.request("WORLD_MOVE", Map.of("seq",i,"dx",0,"dz",-1,"run",false))
                        .path("type").asText()).isEqualTo("WORLD_STATE");
                Thread.sleep(60);
            }
            JsonNode pushed = second.await(m -> m.path("type").asText().equals("WORLD_STATE")
                    && avatar(m.path("payload"),"101").path("position").path("z").asDouble() < startZ-1);
            assertThat(pushed.path("requestId").isNull()).isTrue();
            assertThat(avatar(pushed.path("payload"),"101").path("position").path("moving").asBoolean()).isTrue();
            JsonNode duplicate = first.request("WORLD_MOVE", Map.of("seq",1,"dx",1,"dz",0,"run",true));
            assertThat(avatar(duplicate.path("payload"),"101").path("position").path("lastInputSeq").asLong()).isEqualTo(8);
            JsonNode stopped = second.await(m -> m.path("type").asText().equals("WORLD_STATE")
                    && !avatar(m.path("payload"),"101").path("position").path("moving").asBoolean()
                    && avatar(m.path("payload"),"101").path("position").path("lastInputSeq").asLong()==8);
            double traveled = startZ-avatar(stopped.path("payload"),"101").path("position").path("z").asDouble();
            assertThat(traveled).isBetween(1.0,6.5);
            isolated.assertNoMessage(m -> m.path("type").asText().equals("WORLD_STATE")
                    && !avatar(m.path("payload"),"101").isMissingNode());
            JsonNode seat = first.request("TABLE_JOIN", Map.of("tableId", tableId("one")));
            assertThat(seat.path("type").asText()).isEqualTo("TABLE_STATE");
            assertThat(first.request("WORLD_MOVE",Map.of("seq",9,"dx",1,"dz",0,"run",true))
                    .path("payload").path("code").asText()).isEqualTo("TABLE_BUSY");
        }
    }

    @Test
    void heartbeat단절은_입력을제거하고_재입장은_서버스폰과_새순번을준다() throws Exception {
        try (ScenarioClient first = connect("naver"); ScenarioClient silent = connect("ssafy")) {
            join(first,"one");
            join(silent,"one");
            silent.request("WORLD_MOVE",Map.of("seq",20,"dx",0,"dz",-1,"run",true));
            silent.stopPong();
            assertThat(silent.awaitClose()).isEqualTo(1001);
            JsonNode cleaned = first.await(m -> m.path("type").asText().equals("WORLD_STATE")
                    && m.path("payload").path("avatars").size()==1).path("payload");
            assertThat(avatar(cleaned,"202").isMissingNode()).isTrue();
            try (ScenarioClient returned = connect("ssafy")) {
                JsonNode fresh = join(returned,"one");
                assertThat(avatar(fresh,"202").path("position").path("lastInputSeq").asLong()).isZero();
                assertThat(avatar(fresh,"202").path("position").path("moving").asBoolean()).isFalse();
                assertThat(returned.request("WORLD_MOVE",Map.of("seq",1,"dx",0,"dz",0,"run",false))
                        .path("type").asText()).isEqualTo("WORLD_STATE");
            }
        }
    }

    private String tableId(String channel) {
        return "table-"+java.util.UUID.nameUUIDFromBytes((channel+"\0table-1").getBytes(java.nio.charset.StandardCharsets.UTF_8));
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

}
