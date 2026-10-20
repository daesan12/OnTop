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
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
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
        first.request("TABLE_JOIN", Map.of("tableId", table("channel-1")));

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
        assertThat(hub.listTables("channel-1").tables().getFirst().occupiedSeats()).isZero();
        assertThat(second.messages.poll(100, TimeUnit.MILLISECONDS)).isNull();
    }

    @Test
    void 미입장과_다른_채널의_테이블_요청은_상태를_변경하지_않는다() throws Exception {
        Peer user = peer();
        String own = table("channel-1");
        String other = table("channel-2");
        assertThat(own).isNotEqualTo(other);
        assertThat(user.request("TABLE_JOIN", Map.of("tableId", own)).path("payload").path("code").asText())
                .isEqualTo("NOT_IN_CHANNEL");
        user.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
        assertThat(user.request("TABLE_JOIN", Map.of("tableId", other)).path("payload").path("code").asText())
                .isEqualTo("TABLE_CHANNEL_MISMATCH");
        assertThat(user.request("TABLE_JOIN", Map.of("tableId", "table-1")).path("payload").path("code").asText())
                .isEqualTo("TABLE_NOT_FOUND");
        assertThat(hub.listTables("channel-1").tables()).allMatch(row -> row.occupiedSeats() == 0);
        assertThat(hub.listTables("channel-2").tables()).allMatch(row -> row.occupiedSeats() == 0);
    }

    @Test
    void 게임_선택과_준비는_다른_채널의_테이블에_전파되지_않는다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        Peer other = peer();
        first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
        second.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
        first.next();
        other.request("CHANNEL_JOIN", Map.of("channelId", "channel-2"));
        first.request("TABLE_JOIN", Map.of("tableId", table("channel-1")));
        second.request("TABLE_JOIN", Map.of("tableId", table("channel-1")));
        first.next();
        other.request("TABLE_JOIN", Map.of("tableId", table("channel-2")));
        first.request("GAME_SELECT", Map.of("gameCode", "DICE"));
        second.next();
        first.request("READY_SET", Map.of("ready", true));
        second.next();
        assertThat(second.request("READY_SET", Map.of("ready", true)).path("payload").path("allReady").asBoolean())
                .isTrue();
        first.next();
        assertThat(other.messages.poll(150, TimeUnit.MILLISECONDS)).isNull();
        var isolated = hub.listTables("channel-2").tables().getFirst();
        assertThat(isolated.occupiedSeats()).isEqualTo(1);
        assertThat(isolated.gameCode()).isNull();
        assertThat(isolated.readyCount()).isZero();
        assertThat(isolated.allReady()).isFalse();
        assertThat(first.request("CHANNEL_LEAVE", Map.of()).path("payload").path("code").asText())
                .isEqualTo("TABLE_BUSY");
    }

    @Test
    void 채널_테이블의_마지막_좌석_동시요청은_하나만_성공한다() throws Exception {
        Peer owner = peer();
        Peer first = peer();
        Peer second = peer();
        owner.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
        first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
        owner.next();
        second.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
        owner.next();
        first.next();
        String tableId = table("channel-1");
        owner.request("TABLE_JOIN", Map.of("tableId", tableId));
        owner.request("GAME_SELECT", Map.of("gameCode", "DICE"));
        CountDownLatch gate = new CountDownLatch(1);
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var one = workers.submit(() -> { gate.await(); return first.request("TABLE_JOIN", Map.of("tableId", tableId)); });
            var two = workers.submit(() -> { gate.await(); return second.request("TABLE_JOIN", Map.of("tableId", tableId)); });
            gate.countDown();
            List<JsonNode> results = List.of(one.get(5, TimeUnit.SECONDS), two.get(5, TimeUnit.SECONDS));
            assertThat(results).filteredOn(row -> row.path("type").asText().equals("TABLE_STATE")).hasSize(1);
            assertThat(results).filteredOn(row -> row.path("payload").path("code").asText().equals("TABLE_FULL"))
                    .hasSize(1);
        }
        assertThat(hub.listTables("channel-1").tables().getFirst().occupiedSeats()).isEqualTo(2);
        assertThat(hub.listTables("channel-2").tables()).allMatch(row -> row.occupiedSeats() == 0);
    }

    private String table(String channelId) {
        return hub.listTables(channelId).tables().getFirst().tableId();
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
