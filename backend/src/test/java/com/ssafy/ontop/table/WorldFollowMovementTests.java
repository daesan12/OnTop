package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.movement.WorldPhysics;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
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
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.data.Offset.offset;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/** 실제 Hub→Registry→Bullet 이동을 검증한다. 전송 어댑터와 시계/초기 배치만 테스트 대역이다. */
class WorldFollowMovementTests {
    private final ObjectMapper mapper = new ObjectMapper();
    private final AtomicLong clock = new AtomicLong();
    private final WorldChannelRegistry channels = new WorldChannelRegistry(new WorldChannelProperties(List.of(
            new WorldChannelProperties.Channel("a", "A", 4))), Duration.ofNanos(1), clock::get);
    private final TableHub hub = new TableHub(mapper, Optional.empty(), false, Optional.empty(),
            Duration.ofSeconds(10), Duration.ofSeconds(10), channels);

    @AfterEach
    void shutdown() {
        hub.shutdown();
    }

    @Test
    void 입력부터_실제_이동_정지_재개_종료까지_이어진다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        place(first, 0);
        place(second, 8);
        var started = first.request("WORLD_FOLLOW_START", Map.of("targetId", second.userId));
        String followId = started.at("/payload/links/0/followId").asText();
        for (int i = 0; i < 60; i++) {
            tick();
        }
        double stopped = channels.positionOf(first.userId).x();
        assertThat(stopped).isBetween(5.8, 6.1);
        assertThat(channels.positionOf(first.userId).moving()).isFalse();
        assertThat(first.request("WORLD_FOLLOW_CHECK", Map.of()).at("/payload/links")).hasSize(1);
        place(second, 12);
        tick();
        assertThat(channels.positionOf(first.userId).x()).isGreaterThan(stopped);
        first.request("WORLD_FOLLOW_STOP", Map.of("followId", followId));
        stopped = channels.positionOf(first.userId).x();
        for (int i = 0; i < 10; i++) {
            tick();
        }
        assertThat(channels.positionOf(first.userId).x()).isCloseTo(stopped, offset(.001));
        assertThat(channels.positionOf(first.userId).moving()).isFalse();
    }

    @Test
    void 정지_heartbeat는_유지하고_이동과_점프는_해제하면서_직접입력을_보존한다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        place(first, 0);
        place(second, 8);
        first.request("WORLD_FOLLOW_START", Map.of("targetId", second.userId));
        tick();
        first.request("WORLD_MOVE", Map.of("seq", 1, "dx", 0, "dz", 0, "run", false));
        double x = channels.positionOf(first.userId).x();
        tick();
        assertThat(channels.positionOf(first.userId).x()).isGreaterThan(x);
        assertThat(channels.positionOf(first.userId).lastInputSeq()).isEqualTo(1);
        first.request("WORLD_MOVE", Map.of("seq", 2, "dx", -1, "dz", 0, "run", false));
        x = channels.positionOf(first.userId).x();
        tick();
        assertThat(channels.positionOf(first.userId).x()).isLessThan(x);
        assertThat(first.request("WORLD_FOLLOW_CHECK", Map.of()).at("/payload/links")).isEmpty();
        first.request("WORLD_FOLLOW_START", Map.of("targetId", second.userId));
        tick();
        first.request("WORLD_MOVE", Map.of("seq", 3, "dx", 0, "dz", 0, "run", false, "jump", true));
        assertThat(first.request("WORLD_FOLLOW_CHECK", Map.of()).at("/payload/links")).isEmpty();
    }

    @Test
    void 상대_단절은_따라가는_입력도_멈춘다() throws Exception {
        Peer first = peer();
        Peer second = peer();
        place(first, 0);
        place(second, 8);
        first.request("WORLD_FOLLOW_START", Map.of("targetId", second.userId));
        tick();
        hub.disconnect(second.id);
        double x = channels.positionOf(first.userId).x();
        tick();
        assertThat(channels.positionOf(first.userId).x()).isCloseTo(x, offset(.001));
        assertThat(first.request("WORLD_FOLLOW_CHECK", Map.of()).at("/payload/links")).isEmpty();
    }

    private void tick() {
        clock.addAndGet(WorldPhysics.STEP_NANOS);
        ReflectionTestUtils.invokeMethod(hub, "advanceWorld");
    }

    private void place(Peer peer, double x) {
        var rooms = (Map<?, ?>) ReflectionTestUtils.getField(channels, "rooms");
        var physics = (WorldPhysics) ReflectionTestUtils.getField(rooms.get("a"), "physics");
        physics.place(peer.userId, x, .84, 36);
        tick();
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
        peer.userId = peer.messages.poll(5, TimeUnit.SECONDS).at("/payload/userId").asText();
        peer.request("CHANNEL_JOIN", Map.of("channelId", "a"));
        return peer;
    }

    private class Peer {
        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();
        private String userId;

        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", payload)));
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            JsonNode response;
            while ((response = messages.poll(Math.max(1, deadline - System.nanoTime()), TimeUnit.NANOSECONDS)) != null) {
                if (response.path("requestId").asText().equals(requestId)) {
                    assertThat(response.path("type").asText()).isNotEqualTo("ERROR");
                    return response;
                }
                if (System.nanoTime() >= deadline) {
                    break;
                }
            }
            throw new AssertionError("응답 없음: " + type);
        }
    }
}
