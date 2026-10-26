package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.util.Map;
import org.junit.jupiter.api.Test;
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
        "ontop.world.channels[0].channel-id=a", "ontop.world.channels[0].name=A",
        "ontop.world.channels[0].capacity=4", "ontop.world.channels[1].channel-id=b",
        "ontop.world.channels[1].name=B", "ontop.world.channels[1].capacity=4"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, FrozenWorldFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WorldFollowFlowTests {

    @LocalServerPort private int port;
    @Autowired private WorldChannelRegistry channels;
    @Autowired private TableHub hub;

    @Test
    void 시작_중복_종료와_채널_격리를_실제_소켓으로_확인한다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a");
                var other = client("spectator", "b")) {
            JsonNode started = other.assertNoMessageDuring(this::followState,
                    () -> first.request("WORLD_FOLLOW_START", Map.of("targetId", second.userId)));
            assertThat(started.path("type").asText()).isEqualTo("WORLD_FOLLOW_STATE");
            assertThat(second.await(this::followState).path("payload")).isEqualTo(started.path("payload"));
            String id = started.at("/payload/links/0/followId").asText();
            assertThat(started.at("/payload/links/0/followerId").asText()).isEqualTo(first.userId);
            assertThat(started.at("/payload/links/0/targetId").asText()).isEqualTo(second.userId);
            second.assertNoMessageDuring(this::followState, () -> {
                assertThat(first.request("WORLD_FOLLOW_START", Map.of("targetId", second.userId))
                        .path("payload")).isEqualTo(started.path("payload"));
                return first.request("WORLD_FOLLOW_CHECK", Map.of());
            });
            second.request("WORLD_FOLLOW_STOP", Map.of("followId", id));
            assertThat(first.request("WORLD_FOLLOW_CHECK", Map.of()).at("/payload/links")).hasSize(1);
            JsonNode ended = first.request("WORLD_FOLLOW_STOP", Map.of("followId", id));
            assertThat(ended.at("/payload/links")).isEmpty();
            second.await(this::followState);
            second.assertNoMessageDuring(this::followState, () -> {
                assertThat(first.request("WORLD_FOLLOW_STOP", Map.of("followId", id)).path("payload"))
                        .isEqualTo(ended.path("payload"));
                return null;
            });
        }
    }

    @Test
    void 본인_위조필드_다른채널_거리초과와_과거_해제는_거절한다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a");
                var third = client("spectator", "a")) {
            assertCode(first.request("WORLD_FOLLOW_START", Map.of("targetId", first.userId)),
                    "FOLLOW_SELF_NOT_ALLOWED");
            assertCode(first.request("WORLD_FOLLOW_START", Map.of("targetId", second.userId, "userId", "505")),
                    "INVALID_PAYLOAD");
            pose(second, 1, 12.01, .8);
            assertCode(first.request("WORLD_FOLLOW_START", Map.of("targetId", second.userId)), "FOLLOW_OUT_OF_RANGE");
            pose(second, 2, 12, 2.8);
            var firstLink = first.request("WORLD_FOLLOW_START", Map.of("targetId", second.userId));
            var next = first.request("WORLD_FOLLOW_START", Map.of("targetId", third.userId));
            assertThat(next.at("/payload/links/0/followId")).isNotEqualTo(firstLink.at("/payload/links/0/followId"));
            assertCode(first.request("WORLD_FOLLOW_STOP", Map.of("followId", firstLink.at("/payload/links/0/followId")
                    .asText())), "FOLLOW_LINK_MISMATCH");
            second.request("CHANNEL_LEAVE", Map.of());
            second.request("CHANNEL_JOIN", Map.of("channelId", "b"));
            assertCode(first.request("WORLD_FOLLOW_START", Map.of("targetId", second.userId)),
                    "FOLLOW_TARGET_UNAVAILABLE");
        }
    }

    @Test
    void 단절_후_재접속하면_기존_관계를_복구하지_않는다() throws Exception {
        try (var first = client("naver", "a")) {
            var second = client("ssafy", "a");
            try {
                first.request("WORLD_FOLLOW_START", Map.of("targetId", second.userId));
            } finally {
                second.close();
            }
            org.awaitility.Awaitility.await().atMost(java.time.Duration.ofSeconds(5))
                    .until(() -> channels.channelOf("202") == null);
            assertThat(first.request("WORLD_FOLLOW_CHECK", Map.of()).at("/payload/links")).isEmpty();
            try (var reconnected = client("ssafy", "a")) {
                assertThat(reconnected.request("WORLD_FOLLOW_CHECK", Map.of()).at("/payload/links")).isEmpty();
                assertThat(first.request("WORLD_FOLLOW_START", Map.of("targetId", reconnected.userId))
                        .at("/payload/links")).hasSize(1);
            }
        }
    }

    @Test
    void 직접_이동은_해제하지만_정지와_과거_입력은_해제하지_않는다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a")) {
            var start = first.request("WORLD_FOLLOW_START", Map.of("targetId", second.userId));
            second.await(this::followState);
            first.request("WORLD_MOVE", Map.of("seq", 1, "dx", 0, "dz", 0, "run", false));
            first.request("WORLD_MOVE", Map.of("seq", 1, "dx", 1, "dz", 0, "run", false));
            assertThat(first.request("WORLD_FOLLOW_CHECK", Map.of()).path("payload")).isEqualTo(start.path("payload"));
            first.request("WORLD_MOVE", Map.of("seq", 2, "dx", 1, "dz", 0, "run", false));
            assertThat(second.await(this::followState).at("/payload/links")).isEmpty();
            assertThat(first.request("WORLD_FOLLOW_CHECK", Map.of()).at("/payload/links")).isEmpty();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"TABLE", "BENCH", "CHANNEL", "RANGE", "HEIGHT", "SWIM"})
    void 대상의_활동_퇴장_범위초과는_관계를_해제한다(String action) throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a")) {
            pose(first, 1, -9, .8);
            pose(second, 1, -9, .8);
            first.request("WORLD_FOLLOW_START", Map.of("targetId", second.userId));
            second.await(this::followState);
            switch (action) {
                case "TABLE" -> second.request("TABLE_JOIN",
                        Map.of("tableId", hub.listTables("a").tables().getFirst().tableId()));
                case "BENCH" -> second.request("WORLD_FACILITY_USE", Map.of("facilityId", "bench-0", "seatIndex", 0));
                case "CHANNEL" -> second.request("CHANNEL_LEAVE", Map.of());
                case "RANGE" -> pose(second, 2, 15.001, .8);
                case "HEIGHT" -> pose(second, 2, -9, 4.301);
                case "SWIM" -> channels.move(second.userId, new WorldChannelRegistry.Position(2, -9, .8, 34.75, 0,
                        false, false, true));
                default -> throw new IllegalStateException();
            }
            assertThat(first.request("WORLD_FOLLOW_CHECK", Map.of()).at("/payload/links")).isEmpty();
            assertThat(first.request("WORLD_FOLLOW_CHECK", Map.of()).path("type").asText())
                    .isEqualTo("WORLD_FOLLOW_STATE");
        }
    }

    private ScenarioClient client(String login, String channel) throws Exception {
        var client = new ScenarioClient(port, login);
        client.await(message -> message.path("type").asText().equals("CONNECTED"));
        client.request("CHANNEL_JOIN", Map.of("channelId", channel));
        pose(client, 0, 0, .8);
        return client;
    }

    private void pose(ScenarioClient client, long sequence, double x, double y) {
        channels.move(client.userId, new WorldChannelRegistry.Position(sequence, x, y, 34.75, 0));
    }

    private boolean followState(JsonNode message) {
        return message.path("type").asText().equals("WORLD_FOLLOW_STATE");
    }

    private void assertCode(JsonNode message, String code) {
        assertThat(message.path("type").asText()).isEqualTo("ERROR");
        assertThat(message.at("/payload/code").asText()).isEqualTo(code);
    }
}
