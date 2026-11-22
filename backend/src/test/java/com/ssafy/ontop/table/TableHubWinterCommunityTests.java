package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.winter.community.WinterCommunity;
import com.ssafy.ontop.world.winter.community.WinterCommunityException;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TableHubWinterCommunityTests {
    @Test
    void 여러_워커의_눈굴리기_갱신과_눈싸움_요청이_활동_제한을_안전하게_유지한다() throws Exception {
        try (var client = new ParkClient(); var workers = Executors.newFixedThreadPool(2)) {
            var start = new CountDownLatch(1);
            var updates = workers.submit(() -> {
                start.await();
                for (int i = 0; i < 80; i++) {
                    client.hub.winterCommunityChanged("park", building("park", i, i % 2 == 0));
                }
                return null;
            });
            var requests = workers.submit(() -> {
                start.await();
                for (int i = 0; i < 80; i++) {
                    assertThat(client.send("WORLD_SNOWBALL_PREPARE", Map.of("yaw", 0)).at("/payload/code").asText())
                            .isIn("SNOWBALL_ACTIVITY_CONFLICT", "SNOWBALL_REQUIRED");
                }
                return null;
            });
            start.countDown();
            updates.get(10, TimeUnit.SECONDS);
            requests.get(10, TimeUnit.SECONDS);

            client.hub.winterCommunityChanged("park", building("park", 100, true));
            client.hub.winterCommunityChanged("other", building("other", 101, false));
            assertThat(client.send("WORLD_SNOWBALL_PREPARE", Map.of("yaw", 0)).at("/payload/code").asText())
                    .isEqualTo("SNOWBALL_ACTIVITY_CONFLICT");
            client.hub.winterCommunityChanged("park", building("park", 102, false));
            assertThat(client.send("WORLD_SNOWBALL_PREPARE", Map.of("yaw", 0)).at("/payload/code").asText())
                    .isEqualTo("SNOWBALL_REQUIRED");
        }
    }

    @Test
    void 연결을_끊고_재입장하면_이전_눈굴리기_제한을_남기지_않는다() throws Exception {
        try (var client = new ParkClient()) {
            client.hub.winterCommunityChanged("park", building("park", 1, true));
            assertThat(client.send("WORLD_SNOWBALL_PREPARE", Map.of("yaw", 0)).at("/payload/code").asText())
                    .isEqualTo("SNOWBALL_ACTIVITY_CONFLICT");

            client.hub.disconnect(client.socket);
            client.connect();

            assertThat(client.send("WORLD_SNOWBALL_PREPARE", Map.of("yaw", 0)).at("/payload/code").asText())
                    .isEqualTo("SNOWBALL_REQUIRED");
        }
    }

    private static WinterCommunity.BuildingState building(String channel, long revision, boolean rolling) {
        var balls = rolling ? List.of(new WinterCommunity.SnowBall("ball", 0, 0, 0, .4, List.of("101"), false))
                : List.<WinterCommunity.SnowBall>of();
        return new WinterCommunity.BuildingState(channel, revision, Instant.now().toString(), balls, List.of());
    }

    private static final class ParkClient implements AutoCloseable {
        final ObjectMapper mapper = new ObjectMapper();
        final LinkedBlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
        final String socket = UUID.randomUUID().toString();
        final TableHub hub = new TableHub(mapper, Optional.empty(), false, Optional.empty(),
                Duration.ofSeconds(30), Duration.ofSeconds(30), new WorldChannelRegistry(new WorldChannelProperties(
                        List.of(new WorldChannelProperties.Channel("park", "공원", 10)))));
        final WebSocketSession session = mock(WebSocketSession.class);

        ParkClient() throws Exception {
            when(session.getId()).thenReturn(socket);
            doAnswer(call -> {
                if (call.getArgument(0) instanceof TextMessage message) {
                    messages.add(mapper.readTree(message.getPayload()));
                }
                return null;
            }).when(session).sendMessage(any());
            try {
                connect();
            } catch (Exception | AssertionError failure) {
                hub.shutdown();
                throw failure;
            }
        }

        void connect() throws Exception {
            messages.clear();
            assertThat(hub.connectAuthenticated(session, new VerifiedWebSocketUser(101,
                    VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID))).isTrue();
            JsonNode connected;
            do {
                connected = messages.poll(3, TimeUnit.SECONDS);
                assertThat(connected).isNotNull();
            } while (!connected.path("type").asText().equals("CONNECTED"));
            assertThat(send("WORLD_MAP_CONFIRM", connected.at("/payload/map")).path("type").asText()).isNotEqualTo("ERROR");
            assertThat(send("CHANNEL_JOIN", Map.of("channelId", "park")).path("type").asText()).isNotEqualTo("ERROR");
        }

        JsonNode send(String type, Object payload) throws Exception {
            String id = UUID.randomUUID().toString();
            hub.receive(socket, mapper.writeValueAsString(Map.of("requestId", id, "type", type, "payload", payload)));
            JsonNode reply;
            do {
                reply = messages.poll(3, TimeUnit.SECONDS);
                assertThat(reply).isNotNull();
            } while (!id.equals(reply.path("requestId").asText()));
            return reply;
        }

        @Override
        public void close() {
            hub.shutdown();
        }
    }

    @Test void 소켓_UUID와_다른_계정_ID로_현재_공원_사용자를_조회한다() throws Exception {
        var mapper = new ObjectMapper();
        var channels = new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new WorldChannelProperties.Channel("park", "공원", 10))));
        var hub = new TableHub(mapper, Optional.empty(), false, Optional.empty(),
                Duration.ofSeconds(30), Duration.ofSeconds(30), channels);
        var messages = new LinkedBlockingQueue<JsonNode>();
        String socketId = UUID.randomUUID().toString();
        var session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(socketId);
        doAnswer(call -> {
            if (call.getArgument(0) instanceof TextMessage message) { messages.add(mapper.readTree(message.getPayload())); }
            return null;
        }).when(session).sendMessage(any());
        try {
            assertThat(hub.connectAuthenticated(session, new VerifiedWebSocketUser(101,
                    VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID))).isTrue();
            var connected = messages.poll(3, TimeUnit.SECONDS);
            assertThat(connected).isNotNull();
            request(hub, mapper, messages, socketId, "WORLD_MAP_CONFIRM", connected.at("/payload/map"));
            request(hub, mapper, messages, socketId, "CHANNEL_JOIN", Map.of("channelId", "park"));
            assertThat(hub.winterPlayer(101, "park").userId()).isEqualTo("101");
            assertThat(hub.winterPlayers("park")).extracting(p -> p.userId()).containsExactly("101");
            assertThat(hub.winterPlayer(101, "park").free()).isTrue();
            request(hub, mapper, messages, socketId, "WORLD_INTERACTION_SET", Map.of("busy", true));
            assertThat(hub.winterPlayer(101, "park").free()).isTrue();
            assertThat(hub.winterPlayer(101, "park").inputBusy()).isTrue();
            assertThatThrownBy(() -> hub.winterPlayer(101, "other")).isInstanceOf(WinterCommunityException.class);
            hub.disconnect(socketId);
            assertThatThrownBy(() -> hub.winterPlayer(101, "park")).isInstanceOf(WinterCommunityException.class);
        } finally { hub.shutdown(); }
    }

    private static void request(TableHub hub, ObjectMapper mapper, LinkedBlockingQueue<JsonNode> messages,
            String socket, String type, Object payload) throws Exception {
        String id = UUID.randomUUID().toString();
        hub.receive(socket, mapper.writeValueAsString(Map.of("requestId", id, "type", type, "payload", payload)));
        JsonNode reply;
        do { reply = messages.poll(3, TimeUnit.SECONDS); assertThat(reply).isNotNull(); }
        while (!id.equals(reply.path("requestId").asText()));
        assertThat(reply.path("type").asText()).isNotEqualTo("ERROR");
    }
}
