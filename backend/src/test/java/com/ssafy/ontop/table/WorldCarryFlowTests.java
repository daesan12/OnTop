package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.map.WorldMapRuntime;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.world.channels[0].channel-id=a", "ontop.world.channels[0].name=A",
        "ontop.world.channels[0].capacity=4", "ontop.world.channels[1].channel-id=b",
        "ontop.world.channels[1].name=B", "ontop.world.channels[1].capacity=4",
        "ontop.world.map.source=generated", "ontop.world.map.require-match=true",
        "ontop.world.map.json-path=../frontend/generated/park/server-map.json",
        "ontop.world.map.manifest-path=../frontend/generated/park/manifest.json"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, WorldCarryFlowTests.CarryWorldFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WorldCarryFlowTests {
    @LocalServerPort private int port;
    @Autowired private WorldChannelRegistry channels;
    @Autowired private TableHub hub;

    @Test
    void 실제소켓에서_들기_양쪽방송_권한_중복_던지기와_채널격리를_확인한다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a");
                var other = client("spectator", "b")) {
            JsonNode picked = first.request("WORLD_CARRY_PICKUP", Map.of("targetId", second.userId));
            assertThat(picked.path("type").asText()).isEqualTo("WORLD_STATE");
            String carryId = carry(picked, first.userId).path("carryId").asText();
            assertThat(carry(picked, first.userId).path("role").asText()).isEqualTo("CARRIER");
            assertThat(carry(second.await(message -> carry(message, second.userId).path("role").asText()
                    .equals("CARRIED")), second.userId).path("carryId").asText()).isEqualTo(carryId);
            assertCode(second.request("WORLD_CARRY_THROW", direction(carryId)), "CARRY_LINK_MISMATCH");
            assertCode(first.request("TABLE_JOIN", Map.of("tableId", hub.listTables("a").tables().getFirst().tableId())),
                    "CARRY_ACTIVITY_CONFLICT");
            other.assertNoMessageDuring(message -> message.path("type").asText().equals("WORLD_STATE")
                    && message.at("/payload/channelId").asText().equals("a"), () -> {
                JsonNode thrown = first.request("WORLD_CARRY_THROW", direction(carryId));
                assertThat(carry(thrown, second.userId).path("role").asText()).isEqualTo("THROWN");
                assertThat(carry(thrown, first.userId).isNull()).isTrue();
                return null;
            });
            assertCode(first.request("WORLD_CARRY_THROW", direction(carryId)), "CARRY_TARGET_UNAVAILABLE");
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"GAME", "MINIGAME", "WATCH", "EMOTE", "FOLLOW"})
    void 양쪽의_게임과_다른행동을_서버에서_거절한다(String activity) throws Exception {
        for (boolean actorBusy : new boolean[]{true, false}) {
            try (var first = client("naver", "a"); var second = client("ssafy", "a")) {
                ScenarioClient busy = actorBusy ? first : second;
                switch (activity) {
                    case "GAME" -> channels.boardGames(Map.of(busy.userId, "game"));
                    case "MINIGAME" -> channels.minigameActivity(busy.userId, actorBusy ? 1 : 2, Duration.ofSeconds(60));
                    case "WATCH" -> channels.gameWatches(Map.of(busy.userId,
                            new WorldChannelRegistry.GameWatch("game", "table")));
                    case "EMOTE" -> assertThat(busy.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "WAVE"))
                            .path("type").asText()).isEqualTo("WORLD_EMOTE_EVENT");
                    case "FOLLOW" -> assertThat(busy.request("WORLD_FOLLOW_START",
                            Map.of("targetId", actorBusy ? second.userId : first.userId)).path("type").asText())
                            .isEqualTo("WORLD_FOLLOW_STATE");
                    default -> throw new IllegalStateException();
                }
                assertCode(first.request("WORLD_CARRY_PICKUP", Map.of("targetId", second.userId)),
                        "CARRY_ACTIVITY_CONFLICT");
                channels.boardGames(Map.of());
                channels.gameWatches(Map.of());
                channels.minigameActivity(busy.userId, actorBusy ? 1 : 2, Duration.ZERO);
            }
        }
    }

    @Test
    void 창을_연_상대는_들수없고_운반중_창을열면_던지지않고_내려놓는다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a")) {
            second.request("WORLD_INTERACTION_SET", Map.of("busy", true));
            assertCode(first.request("WORLD_CARRY_PICKUP", Map.of("targetId", second.userId)),
                    "CARRY_ACTIVITY_CONFLICT");
            second.request("WORLD_INTERACTION_SET", Map.of("busy", false));
            first.request("WORLD_CARRY_PICKUP", Map.of("targetId", second.userId));

            second.request("WORLD_INTERACTION_SET", Map.of("busy", true));

            assertThat(channels.carryState(first.userId)).isNull();
            assertThat(channels.carryState(second.userId)).isNull();
        }
    }

    @Test
    void 상대방이_직접_내려오면_과거_ID로_던질수없다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a")) {
            first.request("WORLD_CARRY_PICKUP", Map.of("targetId", second.userId));
            String carryId = channels.carryState(first.userId).carryId();

            assertThat(second.request("WORLD_CARRY_RELEASE", Map.of("carryId", carryId))
                    .path("type").asText()).isEqualTo("WORLD_STATE");

            assertThat(channels.carryState(first.userId)).isNull();
            assertThat(channels.carryState(second.userId)).isNull();
            assertCode(first.request("WORLD_CARRY_THROW", direction(carryId)), "CARRY_TARGET_UNAVAILABLE");
        }
    }

    @Test
    void 위조필드_자기자신_비정상방향을_거절한다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a")) {
            assertCode(first.request("WORLD_CARRY_PICKUP", Map.of("targetId", second.userId, "userId", "505")),
                    "INVALID_PAYLOAD");
            assertCode(first.request("WORLD_CARRY_PICKUP", Map.of("targetId", first.userId)), "CARRY_TARGET_UNAVAILABLE");
            first.request("WORLD_CARRY_PICKUP", Map.of("targetId", second.userId));
            String carryId = channels.carryState(first.userId).carryId();
            assertCode(first.request("WORLD_CARRY_THROW", Map.of("carryId", carryId, "dx", 1, "dy", 1, "dz", 1)),
                    "INVALID_PAYLOAD");
            assertThat(channels.carryState(first.userId)).isNotNull();
        }
    }

    private ScenarioClient client(String login, String channel) throws Exception {
        var client = new ScenarioClient(port, login);
        client.await(message -> message.path("type").asText().equals("CONNECTED"));
        assertThat(client.request("WORLD_MAP_CONFIRM", channels.mapMetadata()).path("type").asText())
                .isEqualTo("WORLD_MAP_STATE");
        client.request("CHANNEL_JOIN", Map.of("channelId", channel));
        return client;
    }

    private Object direction(String carryId) {
        return Map.of("carryId", carryId, "dx", 0, "dy", .6, "dz", -.8);
    }

    private JsonNode carry(JsonNode message, String userId) {
        for (var avatar : message.at("/payload/avatars")) {
            if (avatar.path("userId").asText().equals(userId)) { return avatar.path("carry"); }
        }
        return com.fasterxml.jackson.databind.node.MissingNode.getInstance();
    }

    private void assertCode(JsonNode message, String code) {
        assertThat(message.path("type").asText()).isEqualTo("ERROR");
        assertThat(message.at("/payload/code").asText()).isEqualTo(code);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class CarryWorldFixture {
        @Bean @Primary
        WorldChannelRegistry carryWorld(WorldChannelProperties properties, WorldMapRuntime runtime) {
            var time = new AtomicLong();
            return new WorldChannelRegistry(properties, Duration.ofNanos(1), time::incrementAndGet, runtime.scene());
        }
    }
}
