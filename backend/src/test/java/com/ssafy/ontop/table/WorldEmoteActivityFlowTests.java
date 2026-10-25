package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.world.channels[0].channel-id=a", "ontop.world.channels[0].name=A",
        "ontop.world.channels[0].capacity=5", "ontop.world.channels[1].channel-id=b",
        "ontop.world.channels[1].name=B", "ontop.world.channels[1].capacity=5"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, FrozenWorldFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WorldEmoteActivityFlowTests {

    @LocalServerPort private int port;
    @Autowired private WorldChannelRegistry channels;
    @Autowired private TableHub hub;

    @Test
    void 수락한_이동은_tick_전에_표현을_취소하고_다른채널과_재전송에는_알리지_않는다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a");
                var other = client("spectator", "b")) {
            JsonNode started = emote(first);
            second.await(message -> message.path("type").asText().equals("WORLD_EMOTE_EVENT"));
            var input = Map.of("seq", 1, "dx", 1, "dz", 0, "run", false);

            JsonNode changed = other.assertNoMessageDuring(this::cancelled, () -> {
                JsonNode ack = first.request("WORLD_MOVE", input);
                assertThat(ack.at("/payload/avatars/0/position/moving").asBoolean()).isFalse();
                return cancellation(second, started, "MOVEMENT");
            });
            assertThat(first.await(this::cancelled).path("payload")).isEqualTo(changed.path("payload"));
            assertCode(emote(first), "EMOTE_ACTIVITY_CONFLICT");

            second.assertNoMessageDuring(this::cancelled, () -> first.request("WORLD_MOVE", input));
            first.request("WORLD_MOVE", Map.of("seq", 2, "dx", 0, "dz", 0, "run", false));
            assertCode(emote(first), "EMOTE_TOO_FREQUENT");
        }
    }

    @Test
    void 잘못된_입력과_실패한_활동은_표현을_취소하지_않고_점프_입력은_취소한다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a")) {
            JsonNode started = emote(first);
            second.await(message -> message.path("type").asText().equals("WORLD_EMOTE_EVENT"));
            second.assertNoMessageDuring(this::cancelled, () -> {
                assertCode(first.request("WORLD_EMOTE_CANCELLED", Map.of()), "UNSUPPORTED_MESSAGE_TYPE");
                assertCode(first.request("WORLD_MOVE", Map.of("seq", 1, "dx", 2, "dz", 0, "run", false)),
                        "INVALID_PAYLOAD");
                assertCode(first.request("TABLE_JOIN", Map.of("tableId", "unknown")), "TABLE_NOT_FOUND");
                assertCode(first.request("WORLD_FACILITY_USE", Map.of("facilityId", "unknown", "seatIndex", 0)),
                        "FACILITY_NOT_FOUND");
                return first.request("WORLD_MOVE", Map.of("seq", 1, "dx", 0, "dz", 0, "run", false));
            });
            first.request("WORLD_MOVE", Map.of("seq", 2, "dx", 0, "dz", 0, "run", false, "jump", true));
            cancellation(second, started, "MOVEMENT");
            assertCode(emote(first), "EMOTE_ACTIVITY_CONFLICT");
        }
    }

    @Test
    void 테이블_착석은_주변_비관전자에게도_취소를_알리고_새표현을_막는다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a")) {
            JsonNode started = emote(first);
            second.await(message -> message.path("type").asText().equals("WORLD_EMOTE_EVENT"));
            String table = hub.listTables("a").tables().getFirst().tableId();

            assertThat(first.request("TABLE_JOIN", Map.of("tableId", table)).path("type").asText())
                    .isEqualTo("TABLE_STATE");
            cancellation(second, started, "ACTIVITY_STARTED");
            assertCode(emote(first), "EMOTE_ACTIVITY_CONFLICT");
        }
    }

    @ParameterizedTest
    @CsvSource({"bench-0,-9,0.8,34.75", "walker-1,-65,0.855,33", "telescope-1,49.1,18.92,48.2"})
    void 모든_시설의_이용승인은_표현을_취소하고_이용중_새표현을_막는다(
            String facility, double x, double y, double z) throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a")) {
            channels.move(first.userId, new WorldChannelRegistry.Position(1, x, y, z, 0));
            JsonNode started = emote(first);
            second.await(message -> message.path("type").asText().equals("WORLD_EMOTE_EVENT"));

            assertThat(first.request("WORLD_FACILITY_USE", Map.of("facilityId", facility, "seatIndex", 0))
                    .path("type").asText()).isEqualTo("WORLD_FACILITY_STATE");
            cancellation(second, started, "ACTIVITY_STARTED");
            assertCode(emote(first), "EMOTE_ACTIVITY_CONFLICT");
        }
    }

    @ParameterizedTest
    @CsvSource({"true,false,false", "false,true,false", "false,false,true"})
    void 서버가_이동_달리기_수영으로_판정하면_사용을_거절한다(
            boolean moving, boolean running, boolean swimming) throws Exception {
        try (var first = client("naver", "a")) {
            channels.move(first.userId, new WorldChannelRegistry.Position(1, 0, .8, 0, 0,
                    moving, running, swimming));
            assertCode(emote(first), "EMOTE_ACTIVITY_CONFLICT");
        }
    }

    @Test
    void 채널_퇴장은_취소를_알리고_재입장으로_간격을_초기화하지_않는다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a")) {
            JsonNode started = emote(first);
            second.await(message -> message.path("type").asText().equals("WORLD_EMOTE_EVENT"));
            first.request("CHANNEL_LEAVE", Map.of());
            cancellation(second, started, "CHANNEL_LEFT");
            second.assertNoMessageDuring(this::cancelled, () -> {
                first.request("CHANNEL_JOIN", Map.of("channelId", "a"));
                assertCode(emote(first), "EMOTE_TOO_FREQUENT");
                return null;
            });
        }
    }

    @Test
    void 실제_소켓_종료는_같은채널에_취소를_알린다() throws Exception {
        try (var second = client("ssafy", "a")) {
            JsonNode started;
            try (var first = client("naver", "a")) {
                started = emote(first);
                second.await(message -> message.path("type").asText().equals("WORLD_EMOTE_EVENT"));
            }
            cancellation(second, started, "DISCONNECTED");
        }
    }

    private ScenarioClient client(String login, String channel) throws Exception {
        var client = new ScenarioClient(port, login);
        client.await(message -> message.path("type").asText().equals("CONNECTED"));
        client.request("CHANNEL_JOIN", Map.of("channelId", channel));
        return client;
    }

    private JsonNode emote(ScenarioClient client) throws Exception {
        return client.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "WAVE"));
    }

    private boolean cancelled(JsonNode message) {
        return message.path("type").asText().equals("WORLD_EMOTE_CANCELLED");
    }

    private JsonNode cancellation(ScenarioClient receiver, JsonNode started, String reason) throws Exception {
        JsonNode message = receiver.await(this::cancelled);
        assertThat(message.path("requestId").isNull()).isTrue();
        assertThat(message.at("/payload/emoteEventId")).isEqualTo(started.at("/payload/eventId"));
        assertThat(message.at("/payload/channelId")).isEqualTo(started.at("/payload/channelId"));
        assertThat(message.at("/payload/userId")).isEqualTo(started.at("/payload/userId"));
        assertThat(message.at("/payload/reason").asText()).isEqualTo(reason);
        return message;
    }

    private void assertCode(JsonNode message, String code) {
        assertThat(message.path("type").asText()).isEqualTo("ERROR");
        assertThat(message.at("/payload/code").asText()).isEqualTo(code);
    }
}
