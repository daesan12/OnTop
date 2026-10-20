package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.table.service.TableHub;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "spring.profiles.active=local", "ontop.websocket.authenticated=true",
        "ontop.websocket.heartbeat.interval=100ms", "ontop.websocket.heartbeat.timeout=1s",
        "ontop.world.channels[0].channel-id=one", "ontop.world.channels[0].name=하나",
        "ontop.world.channels[0].capacity=4",
        "ontop.world.channels[1].channel-id=two", "ontop.world.channels[1].name=둘",
        "ontop.world.channels[1].capacity=4"
})
@Import({AuthenticatedWebSocketTests.AuthFixture.class, AllowedWatchFixture.class})
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class TableWatchWebSocketTests {

    @LocalServerPort
    private int port;

    @Autowired
    private TableHub hub;

    @Test
    void 실제_소켓에서_인증된_구독자가_공개상태를_받고_채널_퇴장으로_정리한다() throws Exception {
        try (ScenarioClient player = connect("naver"); ScenarioClient viewer = connect("ssafy")) {
            join(player, "one");
            join(viewer, "one");
            String table = hub.listTables("one").tables().getFirst().tableId();
            assertThat(viewer.request("TABLE_WATCH", Map.of("tableId", table, "userId", "101"))
                    .path("payload").path("code").asText()).isEqualTo("INVALID_PAYLOAD");
            assertThat(viewer.request("TABLE_WATCH", Map.of("tableId", hub.listTables("two").tables().getFirst().tableId()))
                    .path("payload").path("code").asText()).isEqualTo("TABLE_CHANNEL_MISMATCH");
            assertThat(viewer.request("TABLE_WATCH", Map.of("tableId", table)).path("type").asText())
                    .isEqualTo("TABLE_WATCH_STATE");
            player.request("TABLE_JOIN", Map.of("tableId", table));
            JsonNode publicState = viewer.await(message -> message.path("type").asText().equals("TABLE_WATCH_STATE"));
            assertThat(publicState.path("requestId").isNull()).isTrue();
            assertThat(publicState.path("payload").path("seats").get(0).path("userId").asText()).isEqualTo("101");
            player.request("GAME_SELECT", Map.of("gameCode", "OMOK"));
            assertThat(viewer.await(message -> message.path("type").asText().equals("TABLE_WATCH_STATE"))
                    .path("payload").path("gameCode").asText()).isEqualTo("OMOK");
            viewer.request("CHANNEL_LEAVE", Map.of());
            join(viewer, "two");
            assertThat(viewer.request("TABLE_UNWATCH", Map.of()).path("payload").path("code").asText())
                    .isEqualTo("NOT_WATCHING");
        }
    }

    @Test
    void heartbeat로_끊긴_같은_계정은_구독을_물려받지_않고_재구독할_수_있다() throws Exception {
        try (ScenarioClient player = connect("naver"); ScenarioClient viewer = connect("ssafy")) {
            join(player, "one");
            join(viewer, "one");
            String table = hub.listTables("one").tables().getFirst().tableId();
            viewer.request("TABLE_WATCH", Map.of("tableId", table));
            try (ScenarioClient duplicate = new ScenarioClient(port, "ssafy")) {
                assertThat(duplicate.awaitClose()).isEqualTo(1008);
            }
            player.request("TABLE_JOIN", Map.of("tableId", table));
            viewer.await(message -> message.path("type").asText().equals("TABLE_WATCH_STATE"));
            viewer.stopPong();
            viewer.awaitClose();
            try (ScenarioClient returned = connect("ssafy")) {
                join(returned, "one");
                assertThat(returned.request("TABLE_UNWATCH", Map.of()).path("payload").path("code").asText())
                        .isEqualTo("NOT_WATCHING");
                assertThat(returned.request("TABLE_WATCH", Map.of("tableId", table)).path("type").asText())
                        .isEqualTo("TABLE_WATCH_STATE");
            }
        }
    }

    private ScenarioClient connect(String login) throws Exception {
        ScenarioClient client = new ScenarioClient(port, login);
        client.await(message -> message.path("type").asText().equals("CONNECTED"));
        return client;
    }

    private void join(ScenarioClient client, String channel) throws Exception {
        client.request("CHANNEL_JOIN", Map.of("channelId", channel));
        client.await(message -> message.path("type").asText().equals("WORLD_STATE"));
    }
}
