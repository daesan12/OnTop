package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChatService;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WorldChatHubTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private final AtomicLong nanos = new AtomicLong();
    private final WorldChannelRegistry registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
            new Channel("one", "하나", 3), new Channel("two", "둘", 3))), Duration.ofNanos(1), () -> 0L);
    private final TableHub hub = new TableHub(mapper, Optional.empty(), false, Optional.empty(),
            Duration.ofSeconds(10), Duration.ofSeconds(10), registry,
            new WorldChatService(Duration.ofSeconds(1), Clock.systemUTC(), nanos::get));

    @AfterEach
    void shutdown() {
        hub.shutdown();
    }

    @Test
    void 채팅은_본인과_같은_채널에만_한_메시지_ID로_전송한다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        Peer other = peer();
        Peer outside = peer();
        first.join("one");
        second.join("one");
        first.next("CHANNEL_STATE");
        first.next("WORLD_STATE");
        other.join("two");
        JsonNode result = first.request("WORLD_CHAT_SEND", Map.of("text", "  <b>안녕</b>  "));
        JsonNode notice = second.next("WORLD_CHAT_MESSAGE");
        assertThat(result.path("type").asText()).isEqualTo("WORLD_CHAT_MESSAGE");
        assertThat(notice.path("requestId").isNull()).isTrue();
        assertThat(notice.path("payload")).isEqualTo(result.path("payload"));
        assertThat(result.path("payload").path("userId").asText()).isEqualTo(first.userId);
        assertThat(result.path("payload").path("text").asText()).isEqualTo("<b>안녕</b>");
        assertThat(result.path("payload").path("channelId").asText()).isEqualTo("one");
        assertThat(other.messages.poll(150, TimeUnit.MILLISECONDS)).isNull();
        assertThat(outside.messages.poll(150, TimeUnit.MILLISECONDS)).isNull();
        assertThat(first.request("WORLD_CHAT_SEND", Map.of("text", "너무 빠름"))
                .path("payload").path("code").asText()).isEqualTo("CHAT_TOO_FREQUENT");
        assertThat(second.messages.poll(150, TimeUnit.MILLISECONDS)).isNull();
    }

    @Test
    void 미입장은_거절하고_대기_착석은_허용하며_채널_이동으로_간격을_초기화하지_않는다() throws Exception {
        Peer user = peer();
        assertThat(user.request("WORLD_CHAT_SEND", Map.of("text", "미입장"))
                .path("payload").path("code").asText()).isEqualTo("NOT_IN_CHANNEL");
        user.join("one");
        user.request("TABLE_JOIN", Map.of("tableId", hub.listTables("one").tables().getFirst().tableId()));
        user.next("WORLD_STATE");
        assertThat(user.request("WORLD_CHAT_SEND", Map.of("text", "대기 중"))
                .path("type").asText()).isEqualTo("WORLD_CHAT_MESSAGE");
        user.request("TABLE_LEAVE", Map.of());
        user.next("WORLD_STATE");
        user.request("CHANNEL_LEAVE", Map.of());
        user.join("two");
        assertThat(user.request("WORLD_CHAT_SEND", Map.of("text", "이동 직후"))
                .path("payload").path("code").asText()).isEqualTo("CHAT_TOO_FREQUENT");
        nanos.set(1_000_000_000);
        assertThat(user.request("WORLD_CHAT_SEND", Map.of("text", "1초 뒤"))
                .path("payload").path("channelId").asText()).isEqualTo("two");
    }

    private Peer peer() throws Exception {
        Peer peer = new Peer();
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(invocation -> {
            if (invocation.getArgument(0) instanceof TextMessage text) {
                peer.messages.add(mapper.readTree(text.getPayload()));
            }
            return null;
        }).when(session).sendMessage(any());
        hub.connect(session);
        peer.userId = peer.next("CONNECTED").path("payload").path("userId").asText();
        return peer;
    }

    private class Peer {

        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
        private String userId;

        private void join(String channel) throws Exception {
            request("CHANNEL_JOIN", Map.of("channelId", channel));
            next("WORLD_STATE");
            assertThat(next("WORLD_CHAT_TYPING_STATE").at("/payload/users")).isEmpty();
            assertThat(next("WORLD_PARK_DEBRIS_STATE").at("/payload/items")).isEmpty();
            registry.move(userId, new WorldChannelRegistry.Position(0, 0, 0, 0, 0));
        }

        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", payload)));
            JsonNode response = messages.poll(5, TimeUnit.SECONDS);
            assertThat(response).isNotNull();
            assertThat(response.path("requestId").asText()).isEqualTo(requestId);
            return response;
        }

        private JsonNode next(String type) throws Exception {
            JsonNode response = messages.poll(5, TimeUnit.SECONDS);
            assertThat(response).isNotNull();
            assertThat(response.path("type").asText()).isEqualTo(type);
            return response;
        }
    }
}
