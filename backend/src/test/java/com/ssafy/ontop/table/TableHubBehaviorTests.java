package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser.Provider;
import com.ssafy.ontop.behavior.config.BehaviorLogProperties;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.BehaviorEventType;
import com.ssafy.ontop.behavior.domain.DropReason;
import com.ssafy.ontop.behavior.domain.PositionSample;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.behavior.service.BufferedBehaviorLog;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.config.WorldEmoteProperties;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import com.ssafy.ontop.world.service.WorldChatService;
import com.ssafy.ontop.world.service.WorldEmoteService;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TableHubBehaviorTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private final WorldChannelRegistry registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
            new Channel("one", "하나", 3))), Duration.ofNanos(1), () -> 0L);
    private final TableHub hub = new TableHub(mapper, Optional.empty(), false, Optional.empty(),
            Duration.ofSeconds(10), Duration.ofSeconds(10), registry,
            new WorldChatService(Duration.ofSeconds(1)),
            new WorldEmoteService(new WorldEmoteProperties(List.of("WAVE")), Duration.ofSeconds(1),
                    Clock.systemUTC(), System::nanoTime));
    private final CapturingLog log = new CapturingLog();

    @AfterEach
    void shutdown() {
        hub.shutdown();
    }

    @Test
    void 광장_행동은_성공한_요청만_사용자_번호와_함께_기록한다() throws Exception {
        hub.configureBehaviorLog(log);
        Peer user = peer(101);
        user.join("one");
        registry.move(user.userId, new WorldChannelRegistry.Position(0, 0, 0, 0, 0));

        user.request("WORLD_CHAT_SEND", Map.of("text", "안녕 👋"));
        assertThat(user.request("WORLD_CHAT_SEND", Map.of("text", "너무 빠름"))
                .path("payload").path("code").asText()).isEqualTo("CHAT_TOO_FREQUENT");
        user.request("WORLD_EMOTE_SEND", Map.of("emoteCode", "WAVE"));
        user.request("CHANNEL_LEAVE", Map.of());
        hub.disconnect(user.id, ConnectionCloseReason.SOCKET_CLOSED);

        assertThat(log.types()).containsExactly(BehaviorEventType.WS_CONNECTED, BehaviorEventType.CHANNEL_JOINED,
                BehaviorEventType.CHAT_SENT, BehaviorEventType.EMOTE_SENT, BehaviorEventType.CHANNEL_LEFT,
                BehaviorEventType.WS_DISCONNECTED);
        assertThat(log.events).allSatisfy(event -> assertThat(event.userId()).isEqualTo(101L));
        BehaviorEvent chat = log.find(BehaviorEventType.CHAT_SENT);
        assertThat(chat.channelId()).isEqualTo("one");
        assertThat(chat.props()).containsOnlyKeys("length", "recipients")
                .containsEntry("length", 4)
                .containsEntry("recipients", 0);
        assertThat(log.find(BehaviorEventType.EMOTE_SENT).props()).containsEntry("emoteCode", "WAVE");
        assertThat(log.find(BehaviorEventType.CHANNEL_LEFT).props()).containsEntry("byDisconnect", false);
        assertThat(log.find(BehaviorEventType.WS_DISCONNECTED).props()).containsEntry("reason", "SOCKET_CLOSED");
    }

    @Test
    void 테이블_착석부터_끊김_정리까지_기록한다() throws Exception {
        hub.configureBehaviorLog(log);
        Peer user = peer(101);
        user.join("one");
        String tableId = hub.listTables("one").tables().getFirst().tableId();

        user.request("TABLE_JOIN", Map.of("tableId", tableId));
        user.drain();
        user.request("GAME_SELECT", Map.of("betAmountPerPlayer", 1, "gameCode", "OMOK"));
        user.drain();
        user.request("READY_SET", Map.of("ready", true));
        user.drain();
        user.request("TABLE_LEAVE", Map.of());
        user.drain();
        user.request("TABLE_JOIN", Map.of("tableId", tableId));
        hub.disconnect(user.id, ConnectionCloseReason.HEARTBEAT_TIMEOUT);

        assertThat(log.types()).containsSubsequence(BehaviorEventType.TABLE_JOINED, BehaviorEventType.GAME_SELECTED,
                BehaviorEventType.TABLE_READY_SET, BehaviorEventType.TABLE_LEFT, BehaviorEventType.TABLE_JOINED,
                BehaviorEventType.WS_DISCONNECTED, BehaviorEventType.CHANNEL_LEFT, BehaviorEventType.TABLE_LEFT);
        assertThat(log.find(BehaviorEventType.GAME_SELECTED).props()).containsEntry("gameCode", "OMOK");
        assertThat(log.find(BehaviorEventType.TABLE_READY_SET).props()).containsEntry("ready", true);
        assertThat(log.events.stream().filter(event -> event.type() == BehaviorEventType.TABLE_LEFT)
                .map(event -> event.props().get("byDisconnect"))).containsExactly(false, true);
        assertThat(log.events.stream().filter(event -> event.type() == BehaviorEventType.TABLE_LEFT))
                .allSatisfy(event -> assertThat(event.tableId()).isEqualTo(tableId));
    }

    @Test
    void 로그_큐가_가득_차도_요청은_정상_처리된다() throws Exception {
        BufferedBehaviorLog full = new BufferedBehaviorLog((events, positions) -> { },
                new BehaviorLogProperties(true, 1, 1, Duration.ofSeconds(1), Duration.ofSeconds(1)));
        hub.configureBehaviorLog(full);
        Peer user = peer(101);

        JsonNode joined = user.request("CHANNEL_JOIN", Map.of("channelId", "one"));

        assertThat(joined.path("type").asText()).isEqualTo("CHANNEL_STATE");
        assertThat(full.dropped(DropReason.QUEUE_FULL)).isEqualTo(1);
        full.close();
    }

    private Peer peer(long accountId) throws Exception {
        Peer peer = new Peer();
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(invocation -> {
            if (invocation.getArgument(0) instanceof TextMessage text) {
                peer.messages.add(ReadyConsent.received(peer, mapper.readTree(text.getPayload())));
            }
            return null;
        }).when(session).sendMessage(any());
        assertThat(hub.connectAuthenticated(session,
                new VerifiedWebSocketUser(accountId, Provider.NAVER, TestLoginSessions.ID))).isTrue();
        peer.userId = peer.next("CONNECTED").path("payload").path("userId").asText();
        return peer;
    }

    private static final class CapturingLog implements BehaviorLog {
        private final List<BehaviorEvent> events = new CopyOnWriteArrayList<>();

        @Override
        public void record(Supplier<BehaviorEvent> event) {
            events.add(event.get());
        }

        @Override
        public void recordPosition(Supplier<PositionSample> sample) {
        }

        private List<BehaviorEventType> types() {
            return events.stream().map(BehaviorEvent::type).toList();
        }

        private BehaviorEvent find(BehaviorEventType type) {
            return events.stream().filter(event -> event.type() == type).findFirst().orElseThrow();
        }
    }

    private class Peer {
        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
        private String userId;

        private void join(String channel) throws Exception {
            request("CHANNEL_JOIN", Map.of("channelId", channel));
            next("WORLD_STATE");
        }

        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", ReadyConsent.payload(this, type, payload))));
            while (true) {
                JsonNode response = messages.poll(5, TimeUnit.SECONDS);
                assertThat(response).isNotNull();
                if (response.path("requestId").asText().equals(requestId)) {
                    return response;
                }
            }
        }

        private JsonNode next(String type) throws Exception {
            while (true) {
                JsonNode response = messages.poll(5, TimeUnit.SECONDS);
                assertThat(response).isNotNull();
                if (response.path("type").asText().equals(type)) {
                    return response;
                }
            }
        }

        private void drain() {
            messages.clear();
        }
    }
}
