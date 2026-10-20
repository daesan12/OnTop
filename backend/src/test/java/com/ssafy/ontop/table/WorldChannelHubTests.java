package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Duration;
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

class WorldChannelHubTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private final WorldChannelRegistry registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
            new Channel("channel-1", "검증 채널 1", 3), new Channel("channel-2", "검증 채널 2", 3))));
    private final TableHub hub = new TableHub(mapper, Optional.empty(), false, Optional.empty(),
            Duration.ofSeconds(10), Duration.ofSeconds(10), registry);

    @AfterEach
    void shutdown() {
        hub.shutdown();
    }

    @Test
    void 입장_반복_퇴장_알림은_같은_채널에만_순서대로_전송한다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        Peer other = peer();
        Peer outside = peer();
        first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
        other.request("CHANNEL_JOIN", Map.of("channelId", "channel-2"));

        JsonNode joined = second.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
        JsonNode notice = first.next();
        assertThat(notice.path("requestId").isNull()).isTrue();
        assertThat(notice.path("payload")).isEqualTo(joined.path("payload"));
        JsonNode repeated = second.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
        assertThat(repeated.path("payload")).isEqualTo(joined.path("payload"));
        assertThat(first.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
        assertThat(other.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
        assertThat(outside.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();

        assertThat(second.request("CHANNEL_LEAVE", Map.of()).path("type").asText()).isEqualTo("CHANNEL_LEFT");
        assertThat(first.next().path("payload").path("currentUsers").asInt()).isEqualTo(1);
        assertThat(other.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
        assertThat(second.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
    }

    @Test
    void 테이블_착석_중에는_채널을_바꾸지_않고_종료시에는_둘_다_정리한다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
        second.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
        first.next();
        first.request("TABLE_JOIN", Map.of("tableId", "table-1"));

        assertThat(first.request("CHANNEL_LEAVE", Map.of()).path("payload").path("code").asText())
                .isEqualTo("TABLE_BUSY");
        assertThat(first.request("CHANNEL_JOIN", Map.of("channelId", "channel-2"))
                .path("payload").path("code").asText()).isEqualTo("TABLE_BUSY");
        assertThat(first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"))
                .path("type").asText()).isEqualTo("CHANNEL_STATE");

        hub.disconnect(first.id);
        hub.disconnect(first.id);
        JsonNode disconnected = second.next().path("payload");
        assertThat(disconnected.path("currentUsers").asInt()).isEqualTo(1);
        assertThat(disconnected.path("version").asLong()).isEqualTo(3);
        assertThat(registry.snapshot().get("channel-1")).isEqualTo(1);
        assertThat(hub.listTables().tables().getFirst().occupiedSeats()).isZero();
        assertThat(second.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
    }

    private Peer peer() throws Exception {
        Peer peer = new Peer(UUID.randomUUID().toString());
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(invocation -> {
            Object message = invocation.getArgument(0);
            if (message instanceof TextMessage text) {
                peer.messages.add(mapper.readTree(text.getPayload()));
            }
            return null;
        }).when(session).sendMessage(any());
        hub.connect(session);
        assertThat(peer.next().path("type").asText()).isEqualTo("CONNECTED");
        return peer;
    }

    private class Peer {

        private final String id;
        private final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();

        private Peer(String id) {
            this.id = id;
        }

        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type,
                    "payload", payload)));
            JsonNode response = next();
            assertThat(response.path("requestId").asText()).isEqualTo(requestId);
            return response;
        }

        private JsonNode next() throws Exception {
            JsonNode message = messages.poll(5, TimeUnit.SECONDS);
            assertThat(message).isNotNull();
            return message;
        }
    }
}
