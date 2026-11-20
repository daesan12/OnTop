package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.world.channels[0].channel-id=a", "ontop.world.channels[0].name=A",
        "ontop.world.channels[0].capacity=4", "ontop.world.channels[1].channel-id=b",
        "ontop.world.channels[1].name=B", "ontop.world.channels[1].capacity=4",
        "ontop.world.map.source=generated", "ontop.world.map.require-match=true",
        "ontop.world.map.json-path=../frontend/generated/park-renewal/server-map.json",
        "ontop.world.map.manifest-path=../frontend/generated/park-renewal/manifest.json"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, WorldCarryFlowTests.CarryWorldFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WinterSnowballFlowTests {
    @LocalServerPort private int port;
    @Autowired private WorldChannelRegistry channels;
    @Autowired @Qualifier("carryClock") private AtomicLong clock;

    private ScenarioClient client(String login, String channel) throws Exception {
        var client = new ScenarioClient(port, login);
        client.await(m -> m.path("type").asText().equals("CONNECTED"));
        client.request("WORLD_MAP_CONFIRM", channels.mapMetadata());
        client.request("CHANNEL_JOIN", Map.of("channelId", channel));
        return client;
    }
    private void place(ScenarioClient client, double z) {
        channels.releaseFacility(client.userId, new com.ssafy.ontop.world.service.WorldFacilityService.Pose(0, 4.925, z, Math.PI));
    }
    private JsonNode player(JsonNode state, String user) {
        for (JsonNode p : state.at("/payload/players")) {
            if (p.path("userId").asText().equals(user)) { return p; }
        }
        throw new AssertionError("눈싸움 사용자 상태 누락: " + state);
    }

    @Test
    void 조준은_요청자에게만_준비_동작은_같은_채널에만_보내고_실제_발사와_일치한다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a"); var other = client("303", "b")) {
            place(first, 88); place(second, 80);
            var picked = first.request("WORLD_SNOWBALL_PICKUP", Map.of("pileId", "snow-entry"));
            var aim = first.request("WORLD_SNOWBALL_AIM", Map.of("yaw", Math.PI));
            assertThat(aim.path("type").asText()).isEqualTo("WORLD_SNOWBALL_AIM_STATE");
            assertThat(aim.at("/payload/hitUserId").asText()).isEqualTo(second.userId);
            assertThat(first.request("WORLD_SNOWBALL_CHECK", Map.of()).at("/payload/version")).isEqualTo(picked.at("/payload/version"));
            var prepared = first.request("WORLD_SNOWBALL_PREPARE", Map.of("yaw", Math.PI));
            assertThat(prepared.path("type").asText()).isEqualTo("WORLD_SNOWBALL_WINDUP");
            assertThat(prepared.at("/payload/durationMs").asInt()).isEqualTo(300);
            second.await(m -> m.path("type").asText().equals("WORLD_SNOWBALL_WINDUP"));
            second.assertNoMessage(m -> m.path("type").asText().equals("WORLD_SNOWBALL_AIM_STATE"));
            other.assertNoMessage(m -> m.path("type").asText().equals("WORLD_SNOWBALL_WINDUP"));
            assertThat(player(first.request("WORLD_SNOWBALL_CHECK", Map.of()), first.userId).path("snowballs").asInt()).isEqualTo(1);
            var shot = first.request("WORLD_SNOWBALL_THROW", Map.of("yaw", Math.PI));
            assertThat(shot.at("/payload/hitUserId")).isEqualTo(aim.at("/payload/hitUserId"));
            assertThat(shot.at("/payload/endZ")).isEqualTo(aim.at("/payload/endZ"));
            assertThat(first.request("WORLD_SNOWBALL_AIM", Map.of("yaw", 9)).at("/payload/code").asText()).isEqualTo("INVALID_PAYLOAD");
        }
    }

    @Test
    void 눈더미_거리와_소지량을_확인하고_동일_채널에만_발사를_공유한다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a"); var other = client("303", "b")) {
            assertThat(first.request("WORLD_SNOWBALL_THROW", Map.of("yaw", 0)).at("/payload/code").asText())
                    .isEqualTo("SNOWBALL_REQUIRED");
            place(first, 100);
            assertThat(first.request("WORLD_SNOWBALL_PICKUP", Map.of("pileId", "snow-entry")).at("/payload/code").asText())
                    .isEqualTo("SNOW_PILE_OUT_OF_RANGE");
            place(first, 88);
            var pickup = first.request("WORLD_SNOWBALL_PICKUP", Map.of("pileId", "snow-entry"));
            assertThat(player(pickup, first.userId).path("snowballs").asInt()).isEqualTo(1);
            var event = first.request("WORLD_SNOWBALL_THROW", Map.of("yaw", Math.PI));
            assertThat(event.path("type").asText()).isEqualTo("WORLD_SNOWBALL_EVENT");
            second.await(m -> m.path("type").asText().equals("WORLD_SNOWBALL_EVENT"));
            other.assertNoMessage(m -> m.path("type").asText().startsWith("WORLD_SNOWBALL")
                    && m.at("/payload/channelId").asText().equals("a"));
            assertThat(first.request("WORLD_SNOWBALL_THROW", Map.of("yaw", 9)).at("/payload/code").asText())
                    .isEqualTo("INVALID_PAYLOAD");
        }
    }

    @Test
    void 세번_맞은_사용자의_이동과_활동을_막고_AD_교대_입력으로_풀어준다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a")) {
            place(first, 88); place(second, 83);
            for (int i = 0; i < 3; i++) {
                if (i > 0) { Thread.sleep(930); }
                first.request("WORLD_SNOWBALL_PICKUP", Map.of("pileId", "snow-entry"));
                var event = first.request("WORLD_SNOWBALL_THROW", Map.of("yaw", Math.PI));
                assertThat(event.at("/payload/hitUserId").asText()).isEqualTo(second.userId);
            }
            var frozen = player(second.request("WORLD_SNOWBALL_CHECK", Map.of()), second.userId);
            assertThat(frozen.path("hits").asInt()).isEqualTo(3);
            String id = frozen.path("freezeId").asText();
            assertThat(id).isNotBlank();
            second.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            var refreshed = second.await(m -> m.path("type").asText().equals("WORLD_SNOWBALL_STATE"));
            assertThat(player(refreshed, second.userId).path("freezeId").asText()).isEqualTo(id);
            double z = channels.positionOf(second.userId).z();
            second.request("WORLD_MOVE", Map.of("seq", 10, "dx", 0, "dz", 1, "run", false, "jump", false));
            clock.addAndGet(120_000_000L);
            channels.advance(java.util.Set.of(), java.util.List.of());
            assertThat(channels.positionOf(second.userId).z()).isEqualTo(z);
            assertThat(second.request("WORLD_CARRY_PICKUP", Map.of("targetId", first.userId))
                    .at("/payload/code").asText()).isEqualTo("SNOWBALL_FROZEN");
            JsonNode state = null;
            for (int i = 0; i < 6; i++) {
                Thread.sleep(45);
                state = second.request("WORLD_SNOWBALL_ESCAPE", Map.of("freezeId", id, "key", i % 2 == 0 ? "A" : "D"));
            }
            assertThat(player(state, second.userId).path("freezeId").asText()).isEmpty();
            assertThat(player(state, second.userId).path("hits").asInt()).isZero();
            clock.addAndGet(40_000_000L);
            channels.advance(java.util.Set.of(), java.util.List.of());
            second.request("WORLD_MOVE", Map.of("seq", 11, "dx", 0, "dz", 1, "run", false, "jump", false));
            clock.addAndGet(80_000_000L);
            channels.advance(java.util.Set.of(), java.util.List.of());
            assertThat(channels.positionOf(second.userId).z()).isGreaterThan(z + .05);
            second.request("CHANNEL_LEAVE", Map.of());
            second.request("CHANNEL_JOIN", Map.of("channelId", "a"));
            assertThat(second.request("WORLD_SNOWBALL_CHECK", Map.of()).at("/payload/players").findValues("userId"))
                    .noneMatch(n -> n.asText().equals(second.userId));
        }
    }
}
