package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.winter.community.WinterCommunityException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
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
