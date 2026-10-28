package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.RestSecurityTestSupport;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.service.ChannelQueryService;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** Logical channel-capacity check; not a network or browser load benchmark. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK, properties = {
        "spring.profiles.active=local",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.websocket.authenticated=false",
        "ontop.websocket.heartbeat.interval=1h",
        "ontop.websocket.heartbeat.timeout=1h",
        "ontop.world.dynamic-channels.enabled=true",
        "ontop.world.dynamic-channels.capacity=20",
        "ontop.world.dynamic-channels.spawn-at=18",
        "ontop.world.dynamic-channels.max-channels=5",
        "ontop.world.dynamic-channels.idle-timeout=5m"
})
@Import(RestSecurityTestSupport.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class FiveDynamicChannelsTests {
    @Autowired private TableHub hub;
    @Autowired private ChannelQueryService channelQuery;
    @Autowired private ObjectMapper mapper;

    @Test
    void five_channels_hold_100_users_without_creating_a_sixth() throws Exception {
        List<String> channelIds = new ArrayList<>(List.of("channel-1"));
        List<Peer> peers = new ArrayList<>();
        Set<String> tableIds = new HashSet<>();

        assertThat(channelQuery.listChannels().items()).hasSize(1);
        var initialTables = hub.listTables("channel-1").tables();
        assertThat(initialTables).hasSize(16);
        for (var table : initialTables) {
            assertThat(table.anchorId()).isNotNull();
            assertThat(tableIds.add(table.tableId())).isTrue();
        }
        for (int index = 0; index < 4; index++) {
            String current = channelIds.get(index);
            for (int count = 0; count < 18; count++) {
                Peer peer = new Peer();
                peers.add(peer);
                assertThat(peer.join(current).path("type").asText()).isEqualTo("CHANNEL_STATE");
            }

            var available = channelQuery.listChannels().items();
            assertThat(available).hasSize(index + 2);
            String next = available.stream().map(item -> item.channelId())
                    .filter(id -> !channelIds.contains(id)).findFirst().orElseThrow();
            channelIds.add(next);
            var tables = hub.listTables(next).tables();
            assertThat(tables).hasSize(16);
            assertThat(tables).allMatch(table -> table.anchorId() != null);
            assertThat(tables.stream().map(table -> table.anchorId())).doesNotHaveDuplicates();
            for (var table : tables) {
                assertThat(tableIds.add(table.tableId())).isTrue();
            }
        }

        assertThat(channelIds).hasSize(5);
        assertThat(tableIds).hasSize(80);
        for (int index = 0; index < 4; index++) {
            for (int count = 0; count < 2; count++) {
                Peer peer = new Peer();
                peers.add(peer);
                assertThat(peer.join(channelIds.get(index)).path("type").asText())
                        .isEqualTo("CHANNEL_STATE");
            }
        }
        for (int count = 0; count < 20; count++) {
            Peer peer = new Peer();
            peers.add(peer);
            assertThat(peer.join(channelIds.get(4)).path("type").asText())
                    .isEqualTo("CHANNEL_STATE");
        }

        assertThat(peers).hasSize(100);
        assertThat(channelQuery.listChannels().items()).hasSize(5)
                .allMatch(item -> item.currentUsers() == 20 && item.capacity() == 20 && !item.joinable());
        Peer overflow = new Peer();
        JsonNode rejected = overflow.join(channelIds.getFirst());
        assertThat(rejected.path("type").asText()).isEqualTo("ERROR");
        assertThat(rejected.path("payload").path("code").asText()).isEqualTo("CHANNEL_FULL");
        assertThat(channelQuery.listChannels().items()).hasSize(5);
    }

    private class Peer {
        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<JsonNode> replies = new LinkedBlockingQueue<>();

        private Peer() throws Exception {
            WebSocketSession session = mock(WebSocketSession.class);
            when(session.getId()).thenReturn(id);
            doAnswer(invocation -> {
                if (invocation.getArgument(0) instanceof TextMessage message) {
                    JsonNode response = mapper.readTree(message.getPayload());
                    if (response.hasNonNull("requestId")) {
                        replies.add(response);
                    }
                }
                return null;
            }).when(session).sendMessage(any());
            hub.connect(session);
        }

        private JsonNode join(String channelId) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId,
                    "type", "CHANNEL_JOIN", "payload", Map.of("channelId", channelId))));
            JsonNode response;
            while ((response = replies.poll(5, TimeUnit.SECONDS)) != null) {
                if (requestId.equals(response.path("requestId").asText())) {
                    return response;
                }
            }
            throw new AssertionError("채널 입장 응답이 도착하지 않았습니다.");
        }
    }
}
