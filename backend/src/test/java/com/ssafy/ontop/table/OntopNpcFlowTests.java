package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.movement.ParkNavigation;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldFacilityService.Pose;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true", "AI_JEV_ENABLED=false",
        "ontop.ai.enabled=true",
        "ontop.world.channels[0].channel-id=a", "ontop.world.channels[0].name=A",
        "ontop.world.channels[0].capacity=4", "ontop.world.channels[1].channel-id=b",
        "ontop.world.channels[1].name=B", "ontop.world.channels[1].capacity=4",
        "ontop.world.map.source=generated", "ontop.world.map.require-match=true",
        "ontop.world.map.json-path=../frontend/generated/park-renewal/server-map.json",
        "ontop.world.map.manifest-path=../frontend/generated/park-renewal/manifest.json"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, WorldCarryFlowTests.CarryWorldFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class OntopNpcFlowTests {
    @LocalServerPort private int port;
    @Autowired private WorldChannelRegistry channels;
    @Autowired private WorldMapRuntime map;
    @Autowired @Qualifier("carryClock") private java.util.concurrent.atomic.AtomicLong clock;

    private ScenarioClient client(String login, String channel) throws Exception {
        var client = new ScenarioClient(port, login);
        client.await(message -> message.path("type").asText().equals("CONNECTED"));
        client.request("WORLD_MAP_CONFIRM", channels.mapMetadata());
        client.request("CHANNEL_JOIN", Map.of("channelId", channel));
        return client;
    }

    private JsonNode talk(ScenarioClient client, String text) throws Exception {
        var response = client.request("WORLD_CHAT_SEND", Map.of("text", "/온탑 " + text));
        if (response.at("/payload/pending").asBoolean()) {
            String id = response.at("/payload/id").asText();
            return client.await(message -> message.path("type").asText().equals("WORLD_ONTOP_DIALOGUE")
                    && message.at("/payload/id").asText().equals(id)
                    && !message.at("/payload/pending").asBoolean());
        }
        return response;
    }

    @Test
    void 실제_맵에서_개인대화와_눈싸움_점유를_격리하고_중단시_공원_눈싸움을_복구한다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a"); var other = client("303", "b");
                var navigation = new ParkNavigation(map.scene())) {
            var home = navigation.groundPoint(-5, 44);
            channels.releaseFacility(first.userId, new Pose(home.x(), home.y(), home.z() + 4, Math.PI));
            channels.releaseFacility(second.userId, new Pose(home.x() + 1, home.y(), home.z() + 4, Math.PI));
            var greeting = talk(first, "");
            assertThat(greeting.path("type").asText()).isEqualTo("WORLD_ONTOP_DIALOGUE");
            second.assertNoMessage(message -> message.path("type").asText().equals("WORLD_ONTOP_DIALOGUE"));
            second.assertNoMessage(message -> message.path("type").asText().equals("WORLD_CHAT_MESSAGE")
                    && message.at("/payload/text").asText().startsWith("/온탑"));
            assertThat(talk(first, "눈싸움하자").at("/payload/invited").asBoolean()).isTrue();
            Thread.sleep(1_050);
            assertThat(talk(first, "시작").at("/payload/speech").asText()).contains("좋아, 시작");
            var state = second.await(message -> message.path("type").asText().equals("WORLD_ONTOP_STATE")
                    && message.at("/payload/opponentId").asText().equals(first.userId));
            String npc = state.at("/payload/id").asText();
            long versionBeforeMoving = state.at("/payload/version").asLong();
            first.request("WORLD_MOVE", Map.of("seq", 10, "dx", 1, "dz", 0, "run", false, "jump", false));
            assertThat(channels.hasMovementActivity(first.userId)).isTrue();
            second.await(message -> message.path("type").asText().equals("WORLD_ONTOP_STATE")
                    && message.at("/payload/version").asLong() > versionBeforeMoving + 3
                    && message.at("/payload/opponentId").asText().equals(first.userId));
            clock.addAndGet(100_000_000L);
            first.request("WORLD_MOVE", Map.of("seq", 11, "dx", 0, "dz", 0, "run", false, "jump", false));
            first.request("WORLD_INTERACTION_SET", Map.of("busy", true));
            second.await(message -> message.path("type").asText().equals("WORLD_ONTOP_STATE")
                    && message.at("/payload/opponentId").asText().equals(first.userId)
                    && message.at("/payload/action").asText().equals("WAITING"));
            first.request("WORLD_INTERACTION_SET", Map.of("busy", false));
            assertThat(talk(second, "눈싸움하자").at("/payload/speech").asText()).contains("다른 친구");
            other.assertNoMessage(message -> message.path("type").asText().equals("WORLD_ONTOP_STATE")
                    && message.at("/payload/channelId").asText().equals("a"));

            channels.releaseFacility(first.userId, new Pose(home.x(), home.y(), home.z() + 1, Math.PI));
            assertThat(first.request("WORLD_SNOWBALL_PICKUP", Map.of("pileId", "snow-plaza-west"))
                    .path("type").asText()).isEqualTo("WORLD_SNOWBALL_STATE");
            var aim = first.request("WORLD_SNOWBALL_AIM", Map.of("yaw", Math.PI));
            assertThat(aim.at("/payload/hitUserId").asText()).isEqualTo(npc);
            assertThat(first.request("WORLD_SNOWBALL_THROW", Map.of("yaw", Math.PI))
                    .at("/payload/hitUserId").asText()).isEqualTo(npc);
            assertThat(talk(first, "그만").at("/payload/speech").asText()).contains("그만");
            first.await(message -> message.path("type").asText().equals("WORLD_ONTOP_STATE")
                    && message.at("/payload/opponentId").asText().isEmpty());
            assertThat(talk(first, "종료").at("/payload/closed").asBoolean()).isTrue();
            var normal = first.request("WORLD_CHAT_SEND", Map.of("text", "주변 대화 복귀"));
            assertThat(normal.path("type").asText()).isEqualTo("WORLD_CHAT_MESSAGE");
            second.await(message -> message.path("type").asText().equals("WORLD_CHAT_MESSAGE")
                    && message.at("/payload/text").asText().equals("주변 대화 복귀"));
        }
    }
}
