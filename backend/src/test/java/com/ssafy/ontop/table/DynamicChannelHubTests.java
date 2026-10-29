package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.RestSecurityTestSupport;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.service.ChannelQueryService;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CountDownLatch;
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

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK, properties = {
        "spring.profiles.active=local",
        "ontop.auth.jwt-secret-base64=AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8=",
        "ontop.websocket.authenticated=false",
        "ontop.start-rehearsal.enabled=true",
        "ontop.start-rehearsal.delay-millis=0",
        "ontop.world.dynamic-channels.enabled=true",
        "ontop.world.dynamic-channels.capacity=2",
        "ontop.world.dynamic-channels.spawn-at=1",
        "ontop.world.dynamic-channels.max-channels=2",
        "ontop.world.dynamic-channels.idle-timeout=100ms"
})
@Import(RestSecurityTestSupport.class)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_EACH_TEST_METHOD)
class DynamicChannelHubTests {
    @Autowired private TableHub hub;
    @Autowired private ChannelQueryService channelQuery;
    @Autowired private ObjectMapper mapper;

    @Test
    void 혼잡하면_테이블이_준비된_채널을_만들고_유휴_채널은_정리한다() throws Exception {
        assertThat(channelQuery.listChannels().items()).hasSize(1);
        Peer first = peer();
        assertThat(first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1")).path("type").asText())
                .isEqualTo("CHANNEL_STATE");

        var channels = channelQuery.listChannels().items();
        assertThat(channels).hasSize(2);
        String next = channels.stream().map(item -> item.channelId())
                .filter(id -> !id.equals("channel-1")).findFirst().orElseThrow();
        var tables = hub.listTables(next).tables();
        assertThat(tables).hasSize(16);
        assertThat(tables).allMatch(table -> table.anchorId() != null);
        assertThat(tables.stream().map(table -> table.anchorId())).doesNotHaveDuplicates();

        Peer second = peer();
        assertThat(second.request("CHANNEL_JOIN", Map.of("channelId", next)).path("type").asText())
                .isEqualTo("CHANNEL_STATE");
        Peer third = peer();
        Peer fourth = peer();
        CountDownLatch start = new CountDownLatch(1);
        BlockingQueue<JsonNode> raced = new LinkedBlockingQueue<>();
        Thread one = concurrentJoin(third, start, raced);
        Thread two = concurrentJoin(fourth, start, raced);
        start.countDown();
        one.join(10_000);
        two.join(10_000);
        assertThat(one.isAlive() || two.isAlive()).isFalse();
        JsonNode firstRace = raced.poll(5, TimeUnit.SECONDS);
        JsonNode secondRace = raced.poll(5, TimeUnit.SECONDS);
        assertThat(firstRace).isNotNull();
        assertThat(secondRace).isNotNull();
        assertThat(List.of(firstRace.path("type").asText(), secondRace.path("type").asText()))
                .containsExactlyInAnyOrder("CHANNEL_STATE", "ERROR");
        assertThat(List.of(firstRace, secondRace).stream()
                .map(response -> response.path("payload").path("code").asText()).toList())
                .contains("CHANNEL_FULL");
        assertThat(channelQuery.listChannels().items()).hasSize(2);

        hub.disconnect(second.id);
        hub.disconnect(first.id);
        hub.disconnect(third.id);
        hub.disconnect(fourth.id);
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        while (channelQuery.listChannels().items().size() != 1 && System.nanoTime() < deadline) {
            Thread.sleep(100);
        }
        assertThat(channelQuery.listChannels().items()).hasSize(1);
        assertThat(hub.listTables("channel-1").tables()).hasSize(16);
        Peer returning = peer();
        returning.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
        assertThat(channelQuery.listChannels().items()).hasSize(2);
        assertThat(channelQuery.listChannels().items().stream().map(item -> item.channelId()))
                .doesNotContain(next);
        hub.disconnect(returning.id);
    }

    @Test
    void 접속자가_없어도_진행중인_게임_상태가_있으면_채널을_유지한다() throws Exception {
        Peer first = peer();
        first.request("CHANNEL_JOIN", Map.of("channelId", "channel-1"));
        String spare = channelQuery.listChannels().items().stream().map(item -> item.channelId())
                .filter(id -> !id.equals("channel-1")).findFirst().orElseThrow();
        String tableId = hub.listTables(spare).tables().getFirst().tableId();
        Peer player = peer();
        Peer opponent = peer();
        player.request("CHANNEL_JOIN", Map.of("channelId", spare));
        opponent.request("CHANNEL_JOIN", Map.of("channelId", spare));
        assertThat(player.request("TABLE_JOIN", Map.of("tableId", tableId)).path("type").asText())
                .isEqualTo("TABLE_STATE");
        assertThat(opponent.request("TABLE_JOIN", Map.of("tableId", tableId)).path("type").asText())
                .isEqualTo("TABLE_STATE");
        JsonNode selected = player.request("GAME_SELECT",
                Map.of("betAmountPerPlayer", 1, "gameCode", "DICE", "targetScore", 4000));
        assertThat(selected.path("type").asText()).isEqualTo("TABLE_STATE");
        Map<String, Object> consent = Map.of("ready", true, "betAmountPerPlayer", 1,
                "expectedVersion", selected.path("payload").path("version").asLong());
        assertThat(player.request("READY_SET", consent).path("type").asText())
                .isEqualTo("TABLE_STATE");
        assertThat(opponent.request("READY_SET", consent).path("type").asText())
                .isEqualTo("TABLE_STATE");
        long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
        while (hub.listTables(spare).tables().getFirst().status().equals("WAITING") && System.nanoTime() < deadline) {
            Thread.sleep(50);
        }
        assertThat(hub.listTables(spare).tables().getFirst().status()).isNotEqualTo("WAITING");
        hub.disconnect(player.id);
        hub.disconnect(opponent.id);
        Thread.sleep(1_500);
        assertThat(channelQuery.listChannels().items().stream().map(item -> item.channelId()))
                .contains(spare);
        hub.disconnect(first.id);
    }

    private Thread concurrentJoin(Peer peer, CountDownLatch start, BlockingQueue<JsonNode> raced) {
        return Thread.startVirtualThread(() -> {
            try {
                start.await();
                raced.add(peer.request("CHANNEL_JOIN", Map.of("channelId", "channel-1")));
            } catch (Exception exception) {
                throw new AssertionError(exception);
            }
        });
    }

    private Peer peer() throws Exception {
        Peer peer = new Peer(UUID.randomUUID().toString());
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(invocation -> {
            if (invocation.getArgument(0) instanceof TextMessage message) {
                peer.messages.add(mapper.readTree(message.getPayload()));
            }
            return null;
        }).when(session).sendMessage(any());
        hub.connect(session);
        return peer;
    }

    private class Peer {
        private final String id;
        private final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();

        private Peer(String id) { this.id = id; }

        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", payload)));
            long deadline = System.nanoTime() + Duration.ofSeconds(5).toNanos();
            while (System.nanoTime() < deadline) {
                JsonNode message = messages.poll(100, TimeUnit.MILLISECONDS);
                if (message != null && requestId.equals(message.path("requestId").asText())) { return message; }
            }
            throw new AssertionError("채널 요청 응답이 도착하지 않았습니다.");
        }
    }
}
