package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser.Provider;
import com.ssafy.ontop.behavior.domain.BehaviorEvent;
import com.ssafy.ontop.behavior.domain.PositionSample;
import com.ssafy.ontop.behavior.service.BehaviorLog;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.world.config.WorldChannelProperties;
import com.ssafy.ontop.world.config.WorldChannelProperties.Channel;
import com.ssafy.ontop.world.movement.WorldPhysics;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TableHubPositionTests {

    private final ObjectMapper mapper = new ObjectMapper();
    private final AtomicLong clock = new AtomicLong();
    private final WorldChannelRegistry registry = new WorldChannelRegistry(new WorldChannelProperties(List.of(
            new Channel("one", "하나", 3))), Duration.ofNanos(1), clock::get);
    private final TableHub hub = new TableHub(mapper, Optional.empty(), false, Optional.empty(),
            Duration.ofSeconds(10), Duration.ofSeconds(10), registry);
    private final List<PositionSample> positions = new CopyOnWriteArrayList<>();

    @AfterEach
    void shutdown() {
        hub.shutdown();
    }

    @Test
    void 입장하면_스폰_위치를_남기고_움직이면_시작과_멈춤을_남긴다() throws Exception {
        hub.configureBehaviorLog(new CapturingLog());
        Peer user = peer(101);

        user.request("CHANNEL_JOIN", Map.of("channelId", "one"));

        assertThat(positions).singleElement().satisfies(spawn -> {
            assertThat(spawn.userId()).isEqualTo(101L);
            assertThat(spawn.channelId()).isEqualTo("one");
            assertThat(spawn.moving()).isFalse();
            assertThat(spawn.mapVersion()).isNotBlank();
        });

        user.request("WORLD_MOVE", Map.of("seq", 1, "dx", 0, "dz", -1, "run", false));

        // CI 스케줄러가 늦으면 250ms 입력 유효 시간이 먼저 끝난다. 물리 시각을 직접 진행한다.
        tick(5);
        assertThat(positions).hasSizeGreaterThanOrEqualTo(2);
        assertThat(positions.get(1).moving()).isTrue();
        tick(30);
        assertThat(positions).hasSizeGreaterThanOrEqualTo(3);
        assertThat(positions.getLast().moving()).isFalse();
        PositionSample spawn = positions.getFirst();
        PositionSample stopped = positions.getLast();
        assertThat(Math.hypot(stopped.x() - spawn.x(), stopped.z() - spawn.z())).isGreaterThan(0.1);
    }

    @Test
    void 테이블에_앉아_있는_동안에는_위치를_남기지_않는다() throws Exception {
        hub.configureBehaviorLog(new CapturingLog());
        Peer user = peer(101);
        user.request("CHANNEL_JOIN", Map.of("channelId", "one"));
        user.request("TABLE_JOIN", Map.of("tableId", hub.listTables("one").tables().getFirst().tableId()));
        positions.clear();

        tick(30);

        assertThat(positions).isEmpty();
    }

    private void tick(int count) {
        synchronized (hub) {
            for (int tick = 0; tick < count; tick++) {
                clock.addAndGet(WorldPhysics.STEP_NANOS);
                ReflectionTestUtils.invokeMethod(hub, "advanceWorld");
            }
        }
    }

    private Peer peer(long accountId) throws Exception {
        Peer peer = new Peer();
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn(peer.id);
        doAnswer(invocation -> {
            if (invocation.getArgument(0) instanceof TextMessage text) {
                peer.messages.add(mapper.readTree(text.getPayload()));
            }
            return null;
        }).when(session).sendMessage(any());
        assertThat(hub.connectAuthenticated(session,
                new VerifiedWebSocketUser(accountId, Provider.NAVER, TestLoginSessions.ID))).isTrue();
        return peer;
    }

    private final class CapturingLog implements BehaviorLog {
        @Override
        public void record(Supplier<BehaviorEvent> event) {
        }

        @Override
        public void recordPosition(Supplier<PositionSample> sample) {
            positions.add(sample.get());
        }
    }

    private class Peer {
        private final String id = UUID.randomUUID().toString();
        private final BlockingQueue<JsonNode> messages = new LinkedBlockingQueue<>();

        private JsonNode request(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", payload)));
            while (true) {
                JsonNode response = messages.poll(5, TimeUnit.SECONDS);
                assertThat(response).isNotNull();
                if (response.path("requestId").asText().equals(requestId)) {
                    assertThat(response.path("type").asText()).isNotEqualTo("ERROR");
                    return response;
                }
            }
        }
    }
}
