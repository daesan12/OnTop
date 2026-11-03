package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.map.PreparedParkMap;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.nio.file.Path;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class WorldBroadcastTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private TableHub hub;

    @BeforeEach
    void 준비한다() throws Exception {
        var scene = PreparedParkMap.load(Path.of("../frontend/generated/park/server-map.json"),
                Path.of("../frontend/generated/park/manifest.json"), Set.of("channel-1")).createScene();
        var registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
                new Channel("channel-1", "첫 공원", 40), new Channel("channel-2", "다른 공원", 40))),
                Duration.ofMillis(50), () -> 0L, scene);
        hub = new TableHub(mapper, Optional.empty(), false, Optional.empty(),
                Duration.ofSeconds(10), Duration.ofSeconds(10), registry);
    }

    @AfterEach
    void 종료한다() {
        if (hub != null) {
            hub.shutdown();
        }
    }

    @Test
    void 같은_채널_30명은_동일한_공개_JSON을_받고_다음_버전은_새로_만든다() throws Exception {
        Peer other = peer();
        other.join("channel-2");
        other.nextWorld(1);
        Peer outside = peer();
        List<Peer> peers = new ArrayList<>();
        Message previous = null;

        for (int i = 0; i < 30; i++) {
            Peer member = peer();
            peers.add(member);
            member.join("channel-1");
            if (i == 28) {
                previous = peers.getFirst().nextWorld(29);
            }
        }

        Message broadcast = peers.getFirst().nextWorld(30);
        assertThat(broadcast.value().path("requestId").isNull()).isTrue();
        assertThat(broadcast.value().path("payload").path("channelId").asText()).isEqualTo("channel-1");
        assertThat(broadcast.value().path("payload").path("version").asLong())
                .isGreaterThan(previous.value().path("payload").path("version").asLong());
        assertThat(broadcast.raw()).isNotSameAs(previous.raw());
        for (Peer member : peers.subList(1, peers.size())) {
            Message received = member.nextWorld(30);
            assertThat(received.raw()).isSameAs(broadcast.raw());
            assertThat(received.value()).isEqualTo(broadcast.value());
        }
        assertThat(other.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
        assertThat(outside.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
    }

    @Test
    void 이동_요청의_전체상태_응답과_requestId는_본인에게만_유지한다() throws Exception {
        Peer first = peer();
        first.join("channel-1");
        first.nextWorld(1);
        Peer second = peer();
        second.join("channel-1");
        first.nextWorld(2);
        second.nextWorld(2);
        String requestId = UUID.randomUUID().toString();

        first.send(requestId, "WORLD_MOVE", Map.of("seq", 1, "dx", 0, "dz", 0, "run", false, "jump", false));

        Message response = first.next("WORLD_STATE");
        assertThat(response.value().path("requestId").asText()).isEqualTo(requestId);
        assertThat(response.value().path("payload").path("avatars")).hasSize(2);
        assertThat(second.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
    }

    private Peer peer() throws Exception {
        Peer peer = new Peer();
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(invocation -> {
            if (invocation.getArgument(0) instanceof TextMessage text) {
                JsonNode value = mapper.readTree(text.getPayload());
                if (!value.path("type").asText().equals("WORLD_PARK_DEBRIS_STATE")) {
                    peer.messages.add(new Message(text.getPayload(), value));
                }
            }
            return null;
        }).when(session).sendMessage(any());
        hub.connect(session);
        peer.next("CONNECTED");
        return peer;
    }

    private record Message(String raw, JsonNode value) {
    }

    private class Peer {
        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<Message> messages = new LinkedBlockingQueue<>();

        private void send(String requestId, String type, Object payload) throws Exception {
            hub.receive(id, mapper.writeValueAsString(Map.of(
                    "requestId", requestId, "type", type, "payload", payload)));
        }

        private void join(String channel) throws Exception {
            String requestId = UUID.randomUUID().toString();
            send(requestId, "CHANNEL_JOIN", Map.of("channelId", channel));
            assertThat(next("CHANNEL_STATE").value().path("requestId").asText()).isEqualTo(requestId);
        }

        private Message nextWorld(int users) throws Exception {
            Message result;
            do {
                result = next("WORLD_STATE");
            } while (result.value().path("payload").path("avatars").size() < users);
            assertThat(result.value().path("payload").path("avatars")).hasSize(users);
            return result;
        }

        private Message next(String type) throws Exception {
            Message result;
            do {
                result = messages.poll(5, TimeUnit.SECONDS);
                assertThat(result).isNotNull();
            } while (!result.value().path("type").asText().equals(type));
            return result;
        }
    }
}
