package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.service.WorldClock;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
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
        "ontop.world.channels[0].channel-id=a", "ontop.world.channels[0].name=A",
        "ontop.world.channels[0].capacity=5", "ontop.world.channels[1].channel-id=b",
        "ontop.world.channels[1].name=B", "ontop.world.channels[1].capacity=5"
})
@Import(AuthenticatedWebSocketTests.AuthFixture.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class WorldPublicSeatFlowTests {
    @LocalServerPort int port;
    @Autowired TableHub hub;

    @Test
    void 비착석자는_선택게임만_즉시받고_늦은입장도_동일한_공개준비상태를_받는다() throws Exception {
        try (var host = client("naver", "a"); var observer = client("ssafy", "a");
                var other = client("spectator", "b")) {
            String table = hub.listTables("a").tables().getFirst().tableId();
            JsonNode state = host.request("TABLE_JOIN", Map.of("tableId", table));
            for (String game : new String[] { "OMOK", "ONE_CARD", "DICE_LEDGER" }) {
                state = host.request("TABLE_CONFIGURE", Map.of("gameCode", game, "selectedPlayers", 2,
                        "betAmountPerPlayer", 1, "expectedVersion", state.at("/payload/version").asLong()));
                assertThat(state.path("type").asText()).isEqualTo("TABLE_STATE");
                JsonNode published = observer.await(message -> world(message)
                        && game.equals(publicTable(message, table).path("gameCode").asText()));
                assertThat(publicTable(published, table).size()).isEqualTo(4);
                assertThat(publicTable(published, table).has("privateState")).isFalse();
                assertThat(publicTable(published, table).has("betAmountPerPlayer")).isFalse();
                assertThat(publicTable(other.request("WORLD_FOLLOW_CHECK", Map.of()), table).isMissingNode()).isTrue();
            }
            observer.close();
            host.await(message -> world(message) && avatar(message, observer.userId).isMissingNode());
            try (var late = client("ssafy", "a")) {
                JsonNode initial = late.await(message -> world(message)
                        && "DICE_LEDGER".equals(publicTable(message, table).path("gameCode").asText()));
                assertThat(publicTable(initial, table).path("chairCount").asInt()).isEqualTo(2);
            }
        }
    }

    private static JsonNode publicTable(JsonNode message, String tableId) {
        for (JsonNode table : message.at("/payload/tables")) {
            if (table.path("tableId").asText().equals(tableId)) { return table; }
        }
        return com.fasterxml.jackson.databind.node.MissingNode.getInstance();
    }

    @Test
    void 비관전자도_좌석만_바뀐_월드와_퇴장후_null을_받고_다른_채널에는_전송하지_않는다() throws Exception {
        try (var first = client("naver", "a"); var observer = client("ssafy", "a");
                var other = client("spectator", "b")) {
            JsonNode initial = observer.await(message -> world(message) && avatar(message, first.userId).has("tableSeat"));
            assertThat(avatar(initial, first.userId).path("tableSeat").isNull()).isTrue();
            String table = hub.listTables("a").tables().getFirst().tableId();
            JsonNode joined = first.request("TABLE_JOIN", Map.of("tableId", table));
            assertThat(joined.path("type").asText()).isEqualTo("TABLE_STATE");
            JsonNode seated = other.assertNoMessageDuring(message -> world(message)
                    && !avatar(message, first.userId).isMissingNode(), () -> observer.await(message ->
                            world(message) && avatar(message, first.userId).path("tableSeat").isObject()));
            assertThat(seated.path("requestId").isNull()).isTrue();
            assertThat(seated.at("/payload/version").asLong()).isGreaterThan(initial.at("/payload/version").asLong());
            assertThat(avatar(seated, first.userId).path("tableSeat").path("tableId").asText()).isEqualTo(table);
            assertThat(avatar(seated, first.userId).path("tableSeat").path("seatNumber").asInt()).isEqualTo(1);
            assertThat(avatar(seated, first.userId).path("tableSeat").size()).isEqualTo(2);

            assertThat(first.request("TABLE_LEAVE", Map.of()).path("type").asText()).isEqualTo("TABLE_LEFT");
            JsonNode left = observer.await(message -> world(message)
                    && message.at("/payload/version").asLong() > seated.at("/payload/version").asLong()
                    && avatar(message, first.userId).path("tableSeat").isNull());
            assertThat(avatar(left, first.userId).has("tableSeat")).isTrue();
        }
    }

    @Test
    void 늦은_입장과_재접속_초기_스냅샷은_보존된_실제_좌석을_포함한다() throws Exception {
        try (var first = client("naver", "a"); var observer = client("ssafy", "a")) {
            String table = hub.listTables("a").tables().getFirst().tableId();
            JsonNode joined = first.request("TABLE_JOIN", Map.of("tableId", table));
            first.request("TABLE_CONFIGURE", Map.of("gameCode", "OMOK", "selectedPlayers", 2,
                    "betAmountPerPlayer", 1, "expectedVersion", joined.at("/payload/version").asLong()));
            try (var late = client("spectator", "a")) {
                JsonNode initial = late.await(message -> world(message) && avatar(message, first.userId).isObject());
                assertThat(avatar(initial, first.userId).path("tableSeat").path("tableId").asText()).isEqualTo(table);
            }
            first.close();
            observer.await(message -> world(message) && avatar(message, first.userId).isMissingNode());
            try (var returned = client("naver", "a")) {
                JsonNode restored = returned.await(message -> world(message) && avatar(message, first.userId).isObject());
                assertThat(avatar(restored, first.userId).path("tableSeat").path("tableId").asText()).isEqualTo(table);
                assertThat(avatar(restored, first.userId).path("tableSeat").path("seatNumber").asInt()).isEqualTo(1);
            }
        }
    }

    @Test
    void 정원을_줄여_좌석을_재배치하면_월드도_실제_새_좌석번호를_전송한다() throws Exception {
        try (var first = client("naver", "a"); var second = client("ssafy", "a");
                var third = client("spectator", "a")) {
            String table = hub.listTables("a").tables().getFirst().tableId();
            first.request("TABLE_JOIN", Map.of("tableId", table));
            second.request("TABLE_JOIN", Map.of("tableId", table));
            third.request("TABLE_JOIN", Map.of("tableId", table));
            first.request("TABLE_LEAVE", Map.of());
            JsonNode state = second.await(message -> message.path("type").asText().equals("TABLE_STATE")
                    && message.at("/payload/seats/0/userId").isNull());
            JsonNode configured = second.request("TABLE_CONFIGURE", Map.of("gameCode", "OMOK",
                    "selectedPlayers", 2, "betAmountPerPlayer", 1,
                    "expectedVersion", state.at("/payload/version").asLong()));
            assertThat(configured.path("type").asText()).isEqualTo("TABLE_STATE");
            JsonNode repacked = first.await(message -> world(message)
                    && avatar(message, second.userId).path("tableSeat").path("seatNumber").asInt() == 1
                    && avatar(message, third.userId).path("tableSeat").path("seatNumber").asInt() == 2);
            assertThat(avatar(repacked, first.userId).path("tableSeat").isNull()).isTrue();
        }
    }

    @Test
    void 방장_대기_만료의_강제_퇴장도_비참가자의_월드에서_착석_표시를_해제한다() throws Exception {
        Instant now = Instant.parse("2026-10-28T00:00:00Z");
        hub.configureWorldClock(new WorldClock(Clock.fixed(now, ZoneOffset.UTC)));
        try (var first = client("naver", "a"); var second = client("ssafy", "a");
                var observer = client("spectator", "a")) {
            String table = hub.listTables("a").tables().getFirst().tableId();
            first.request("TABLE_JOIN", Map.of("tableId", table));
            JsonNode joined = second.request("TABLE_JOIN", Map.of("tableId", table));
            first.request("TABLE_CONFIGURE", Map.of("gameCode", "OMOK", "selectedPlayers", 2,
                    "betAmountPerPlayer", 1, "expectedVersion", joined.at("/payload/version").asLong()));
            first.request("READY_SET", Map.of("ready", true));
            assertThat(second.request("READY_SET", Map.of("ready", true)).at("/payload/allReady").asBoolean()).isTrue();
            JsonNode before = observer.await(message -> world(message)
                    && avatar(message, first.userId).path("tableSeat").isObject());
            hub.configureWorldClock(new WorldClock(Clock.fixed(now.plusSeconds(120), ZoneOffset.UTC)));
            // Timeout processing may publish WORLD_STATE before the correlated check reply.
            // Do not consume that broadcast while waiting for the unrelated follow response.
            observer.sendRequest("WORLD_FOLLOW_CHECK", Map.of());
            JsonNode after = observer.await(message -> world(message)
                    && message.at("/payload/version").asLong() > before.at("/payload/version").asLong()
                    && avatar(message, first.userId).path("tableSeat").isNull());
            assertThat(avatar(after, second.userId).path("tableSeat").path("tableId").asText()).isEqualTo(table);
            assertThat(first.await(message -> message.path("type").asText().equals("TABLE_HOST_TIMEOUT"))
                    .at("/payload/reason").asText()).isEqualTo("HOST_START_TIMEOUT");
        }
    }

    private ScenarioClient client(String login, String channel) throws Exception {
        var client = new ScenarioClient(port, login);
        client.await(message -> message.path("type").asText().equals("CONNECTED"));
        assertThat(client.request("CHANNEL_JOIN", Map.of("channelId", channel)).path("type").asText())
                .isEqualTo("CHANNEL_STATE");
        return client;
    }

    private static boolean world(JsonNode message) {
        return message.path("type").asText().equals("WORLD_STATE");
    }

    private static JsonNode avatar(JsonNode message, String user) {
        for (JsonNode avatar : message.at("/payload/avatars")) {
            if (avatar.path("userId").asText().equals(user)) { return avatar; }
        }
        return com.fasterxml.jackson.databind.node.MissingNode.getInstance();
    }
}
