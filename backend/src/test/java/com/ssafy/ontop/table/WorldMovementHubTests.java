package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.minigame.service.MinigameActivityChanged;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WorldMovementHubTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private final WorldChannelRegistry registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
            new Channel("one", "하나", 3), new Channel("two", "둘", 3))), Duration.ofNanos(1), () -> 0L);
    private final TableHub hub = new TableHub(mapper, Optional.empty(), false, Optional.empty(),
            Duration.ofSeconds(10), Duration.ofSeconds(10), registry);

    @AfterEach
    void shutdown() {
        hub.shutdown();
    }

    @Test
    void 위치는_같은_채널에만_알리고_재전송은_본인에게만_응답한다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        Peer other = peer();
        first.request("CHANNEL_JOIN", Map.of("channelId", "one"));
        first.next("WORLD_STATE");
        second.request("CHANNEL_JOIN", Map.of("channelId", "one"));
        second.next("WORLD_STATE");
        first.next("CHANNEL_STATE");
        first.next("WORLD_STATE");
        other.request("CHANNEL_JOIN", Map.of("channelId", "two"));
        other.next("WORLD_STATE");

        JsonNode result = first.request("WORLD_MOVE", move(1, 3));
        // 입력 ACK는 본인에게만 간다. 주기 방송은 실제 소켓 검사에서 확인한다.
        assertThat(result.path("requestId").isTextual()).isTrue();


        assertThat(other.messages.poll(150, TimeUnit.MILLISECONDS)).isNull();
        assertThat(first.request("WORLD_MOVE", move(1, 999)).path("payload")).isEqualTo(result.path("payload"));
        assertThat(second.messages.poll(150, TimeUnit.MILLISECONDS)).isNull();
        assertThat(other.messages.poll(150, TimeUnit.MILLISECONDS)).isNull();
        assertThat(first.request("CHANNEL_JOIN", Map.of("channelId", "one"))
                .path("payload").path("version").asLong()).isEqualTo(2);
    }

    @Test
    void 미입장과_착석_중_이동은_위치를_바꾸지_않는다() throws Exception {
        Peer user = peer();
        assertThat(user.request("WORLD_MOVE", move(0, 1)).path("payload").path("code").asText())
                .isEqualTo("NOT_IN_CHANNEL");
        user.request("CHANNEL_JOIN", Map.of("channelId", "one"));
        user.next("WORLD_STATE");
        user.request("WORLD_MOVE", move(0, 1));
        var position = registry.worldState("one");
        user.request("TABLE_JOIN", Map.of("tableId", hub.listTables("one").tables().getFirst().tableId()));
        user.next("WORLD_STATE");
        var seated = registry.worldState("one");
        assertThat(seated.avatars().getFirst().position()).isEqualTo(position.avatars().getFirst().position());
        assertThat(seated.avatars().getFirst().tableSeat()).isNotNull();
        assertThat(user.request("WORLD_MOVE", move(1, 100)).path("payload").path("code").asText())
                .isEqualTo("TABLE_BUSY");
        assertThat(registry.worldState("one")).isEqualTo(seated);
        user.request("TABLE_LEAVE", Map.of());
        user.next("WORLD_STATE");
        user.request("CHANNEL_LEAVE", Map.of());
        assertThat(registry.worldState("one").avatars()).isEmpty();
        assertThat(user.request("WORLD_MOVE", move(1, 100)).path("payload").path("code").asText())
                .isEqualTo("NOT_IN_CHANNEL");
    }

    @Test
    void 붕어빵_이용_상태와_종료를_본인과_같은_채널_접속자에게만_방송한다() throws Exception {
        Peer first = peer(101L);
        Peer second = peer(102L);
        Peer outside = peer(103L);
        first.request("CHANNEL_JOIN", Map.of("channelId", "one"));
        first.next("WORLD_STATE");
        second.request("CHANNEL_JOIN", Map.of("channelId", "one"));
        second.next("WORLD_STATE");
        first.next("CHANNEL_STATE");
        first.next("WORLD_STATE");
        outside.request("CHANNEL_JOIN", Map.of("channelId", "two"));
        outside.next("WORLD_STATE");

        hub.minigameActivityChanged(new MinigameActivityChanged(101, 10, Instant.now().plusSeconds(60)));
        for (Peer peer : List.of(first, second)) {
            var avatars = peer.next("WORLD_STATE").path("payload").path("avatars");
            assertThat(avatars.get(0).path("activity").asText()).isEqualTo("BUNGEOPPANG");
            assertThat(avatars.get(0).has("tableSeat")).isTrue();
            assertThat(avatars.get(1).path("activity").isNull()).isTrue();
        }
        assertThat(outside.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();

        // The same start again changes nothing visible, so nobody receives a new WORLD_STATE.
        hub.minigameActivityChanged(new MinigameActivityChanged(101, 10, Instant.now().plusSeconds(60)));
        assertThat(first.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();

        hub.minigameActivityChanged(new MinigameActivityChanged(101, 10, null));
        for (Peer peer : List.of(first, second)) {
            assertThat(peer.next("WORLD_STATE").path("payload").path("avatars").get(0).path("activity").isNull())
                    .isTrue();
        }
        assertThat(outside.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
    }

    private Map<String, Object> move(long sequence, double x) {
        return Map.of("seq", sequence + 1, "dx", 0, "dz", 0, "run", false);
    }

    private Peer peer() throws Exception {
        return peer(null);
    }

    private Peer peer(Long accountId) throws Exception {
        Peer peer = new Peer();
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(invocation -> {
            if (invocation.getArgument(0) instanceof TextMessage text) {
                JsonNode message = mapper.readTree(text.getPayload());
                // 잔해·입력 중 상태는 전용 테스트에서 검증하며 이동 알림 순서는 그대로 검사한다.
                String type = message.path("type").asText();
                if (!type.equals("WORLD_PARK_DEBRIS_STATE") && !type.equals("WORLD_CHAT_TYPING_STATE")) {
                    peer.messages.add(message);
                }
            }
            return null;
        }).when(session).sendMessage(any());
        if (accountId == null) {
            hub.connect(session);
        } else {
            assertThat(hub.connectAuthenticated(session, new VerifiedWebSocketUser(accountId,
                    VerifiedWebSocketUser.Provider.NAVER, TestLoginSessions.ID))).isTrue();
        }
        peer.next("CONNECTED");
        return peer;
    }

    private class Peer {

        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();

        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", payload)));
            JsonNode response = messages.poll(5, TimeUnit.SECONDS);
            assertThat(response).isNotNull();
            assertThat(response.path("requestId").asText()).isEqualTo(requestId);
            return response;
        }

        private JsonNode next(String type) throws Exception {
            JsonNode message = messages.poll(5, TimeUnit.SECONDS);
            assertThat(message).isNotNull();
            assertThat(message.path("type").asText()).isEqualTo(type);
            return message;
        }
    }
}
