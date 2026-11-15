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
import com.ssafy.ontop.world.mobility.MobilityRentals;
import com.ssafy.ontop.world.mobility.MobilityWallet;
import com.ssafy.ontop.world.movement.WorldPhysics;
import com.ssafy.ontop.world.service.WorldChannelRegistry;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.BooleanSupplier;
import java.util.function.Supplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
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

    @Test
    void 같은_대여_요청은_한_번_결제하고_하차하면_공개_탈것을_제거한다() throws Exception {
        var wallet = mock(MobilityWallet.class);
        Peer user = peer(101);
        user.request("CHANNEL_JOIN", Map.of("channelId", "one"));
        Peer observer = peer(102);
        observer.request("CHANNEL_JOIN", Map.of("channelId", "one"));
        String lease = mobilityLease(wallet);
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        when(wallet.charge(eq(101L), eq(lease), eq(1L), eq(2), any(BooleanSupplier.class))).thenAnswer(call -> {
            entered.countDown();
            if (!release.await(4, TimeUnit.SECONDS)) {
                throw new IllegalStateException("테스트 결제 대기 시간 초과");
            }
            return ((BooleanSupplier) call.getArgument(4)).getAsBoolean()
                    ? MobilityWallet.Payment.PAID : MobilityWallet.Payment.CANCELLED;
        });
        String first = user.send("WORLD_MOBILITY_START", mobilityStart(lease));
        try {
            assertThat(entered.await(2, TimeUnit.SECONDS)).isTrue();
            String retry = user.send("WORLD_MOBILITY_START", mobilityStart(lease));
            // A world tick and another connection's request can finish while the first DB call is pending.
            tick(1);
            observer.request("CHANNEL_JOIN", Map.of("channelId", "one"));
            assertThat(registry.worldState("one").vehicles()).isEmpty();
            release.countDown();
            assertThat(user.awaitResponse(first).at("/payload/status").asText()).isEqualTo("RIDING");
            assertThat(user.awaitResponse(retry).at("/payload/total").asLong()).isEqualTo(2);
        } finally {
            release.countDown();
        }

        long mountedVersion = registry.worldState("one").version();
        observer.awaitPublicVehicle("101", "SCOOTER", mountedVersion);
        assertThat(user.request("WORLD_MOBILITY_END", Map.of("leaseId", lease))
                .at("/payload/total").asLong()).isEqualTo(2);
        observer.awaitPublicVehicle("101", "", mountedVersion + 1);
        verify(wallet).charge(eq(101L), eq(lease), eq(1L), eq(2), any(BooleanSupplier.class));
        assertThat(registry.worldState("one").vehicles()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(longs = {1, 2})
    void 하차가_먼저면_진행_중인_첫_결제와_갱신_결제를_취소한다(long second) throws Exception {
        var wallet = mock(MobilityWallet.class);
        Peer user = peer(101);
        user.request("CHANNEL_JOIN", Map.of("channelId", "one"));
        String lease = mobilityLease(wallet);
        var entered = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var authorized = new CompletableFuture<Boolean>();
        when(wallet.charge(eq(101L), eq(lease), eq(second), eq(2), any(BooleanSupplier.class))).thenAnswer(call -> {
            entered.countDown();
            if (!release.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("테스트 결제 대기 시간 초과");
            }
            boolean commit = ((BooleanSupplier) call.getArgument(4)).getAsBoolean();
            authorized.complete(commit);
            return commit ? MobilityWallet.Payment.PAID : MobilityWallet.Payment.CANCELLED;
        });
        if (second == 2) {
            assertThat(user.request("WORLD_MOBILITY_START", mobilityStart(lease)).at("/payload/total").asLong())
                    .isEqualTo(2);
        } else {
            user.send("WORLD_MOBILITY_START", mobilityStart(lease));
        }
        try {
            assertThat(entered.await(3, TimeUnit.SECONDS)).isTrue();
            var ended = user.request("WORLD_MOBILITY_END", Map.of("leaseId", lease)).path("payload");
            assertThat(ended.path("status").asText()).isEqualTo("ENDED");
            assertThat(ended.path("total").asLong()).isEqualTo((second - 1) * 2);
            assertThat(ended.has("receipt")).isFalse();
            assertThat(registry.worldState("one").vehicles()).isEmpty();
        } finally {
            release.countDown();
        }
        assertThat(authorized.get(2, TimeUnit.SECONDS)).isFalse();
        tick(2);
        verify(wallet).charge(eq(101L), eq(lease), eq(1L), eq(2), any(BooleanSupplier.class));
        if (second == 2) {
            verify(wallet).charge(eq(101L), eq(lease), eq(2L), eq(2), any(BooleanSupplier.class));
        }
        verifyNoMoreInteractions(wallet);
    }

    @Test
    void 이미_커밋_결정이_난_갱신은_최종_이용료에_한_번만_포함된다() throws Exception {
        var wallet = mock(MobilityWallet.class);
        Peer user = peer(101);
        user.request("CHANNEL_JOIN", Map.of("channelId", "one"));
        String lease = mobilityLease(wallet);
        var authorized = new CompletableFuture<Boolean>();
        var release = new CountDownLatch(1);
        when(wallet.charge(eq(101L), eq(lease), eq(2L), eq(2), any(BooleanSupplier.class))).thenAnswer(call -> {
            boolean commit = ((BooleanSupplier) call.getArgument(4)).getAsBoolean();
            authorized.complete(commit);
            if (!release.await(5, TimeUnit.SECONDS)) {
                throw new IllegalStateException("테스트 결제 대기 시간 초과");
            }
            return commit ? MobilityWallet.Payment.PAID : MobilityWallet.Payment.CANCELLED;
        });
        var started = user.request("WORLD_MOBILITY_START", mobilityStart(lease));
        assertThat(started.at("/payload/receipt").asText()).isEqualTo(lease + ":1");
        String end;
        try {
            assertThat(authorized.get(3, TimeUnit.SECONDS)).isTrue();
            end = user.send("WORLD_MOBILITY_END", Map.of("leaseId", lease));
            assertThat(registry.worldState("one").vehicles()).isEmpty();
        } finally {
            release.countDown();
        }
        var ended = user.awaitResponse(end).path("payload");
        assertThat(ended.path("status").asText()).isEqualTo("ENDED");
        assertThat(ended.path("total").asLong()).isEqualTo(4);
        assertThat(ended.path("receipt").asText()).isEqualTo(lease + ":2");
        verify(wallet).charge(eq(101L), eq(lease), eq(1L), eq(2), any(BooleanSupplier.class));
        verify(wallet).charge(eq(101L), eq(lease), eq(2L), eq(2), any(BooleanSupplier.class));
        verifyNoMoreInteractions(wallet);
    }

    @Test
    void 갱신마다_영수증을_보내고_잔액이_부족하면_확정된_요금만_유지한다() throws Exception {
        var wallet = mock(MobilityWallet.class);
        Peer user = peer(101);
        user.request("CHANNEL_JOIN", Map.of("channelId", "one"));
        String lease = mobilityLease(wallet);
        when(wallet.charge(eq(101L), eq(lease), eq(2L), eq(2), any(BooleanSupplier.class))).thenAnswer(call ->
                ((BooleanSupplier) call.getArgument(4)).getAsBoolean()
                        ? MobilityWallet.Payment.PAID : MobilityWallet.Payment.CANCELLED);
        when(wallet.charge(eq(101L), eq(lease), eq(3L), eq(2), any(BooleanSupplier.class)))
                .thenReturn(MobilityWallet.Payment.INSUFFICIENT);
        assertThat(user.request("WORLD_MOBILITY_START", mobilityStart(lease)).at("/payload/total").asLong())
                .isEqualTo(2);
        var renewed = user.awaitMobilityUpdate("RIDING");
        assertThat(renewed.path("total").asLong()).isEqualTo(4);
        assertThat(renewed.path("receipt").asText()).isEqualTo(lease + ":2");
        var ended = user.awaitMobilityUpdate("INSUFFICIENT");
        assertThat(ended.path("total").asLong()).isEqualTo(4);
        assertThat(ended.has("receipt")).isFalse();
        assertThat(registry.worldState("one").vehicles()).isEmpty();
    }

    private String mobilityLease(MobilityWallet wallet) {
        var at = registry.positionOf("101");
        var stations = mapper.valueToTree(List.of(Map.of("id", "mobility-entry", "yaw", 0,
                "reachPosition", List.of(at.x(), at.y(), at.z()), "radius", 3, "heightTolerance", .7)));
        synchronized (hub) {
            ReflectionTestUtils.setField(hub, "rentals", new MobilityRentals(wallet, stations));
        }
        String lease = UUID.randomUUID().toString();
        when(wallet.charge(eq(101L), eq(lease), eq(1L), eq(2), any(BooleanSupplier.class))).thenAnswer(call ->
                ((BooleanSupplier) call.getArgument(4)).getAsBoolean()
                        ? MobilityWallet.Payment.PAID : MobilityWallet.Payment.CANCELLED);
        return lease;
    }

    private Map<String, String> mobilityStart(String lease) {
        return Map.of("stationId", "mobility-entry", "vehicle", "SCOOTER", "leaseId", lease);
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

        private void awaitPublicVehicle(String avatarId, String expected, long minimumVersion) throws Exception {
            long endsAt = System.nanoTime() + TimeUnit.SECONDS.toNanos(4);
            while (System.nanoTime() < endsAt) {
                JsonNode event = messages.poll(200, TimeUnit.MILLISECONDS);
                if (event != null && event.path("type").asText().equals("WORLD_STATE")
                        && event.path("payload").path("version").asLong() >= minimumVersion
                        && event.path("payload").path("vehicles").path(avatarId).asText().equals(expected)) {
                    return;
                }
            }
            throw new AssertionError("상대 연결에서 탈것 상태를 받지 못했습니다: " + expected);
        }

        private JsonNode request(String type, Object payload) throws Exception {
            return awaitResponse(send(type, payload));
        }

        private String send(String type, Object payload) throws Exception {
            String requestId = UUID.randomUUID().toString();
            hub.receive(id, mapper.writeValueAsString(Map.of("requestId", requestId, "type", type, "payload", payload)));
            return requestId;
        }

        private JsonNode awaitResponse(String requestId) throws Exception {
            while (true) {
                JsonNode response = messages.poll(5, TimeUnit.SECONDS);
                assertThat(response).isNotNull();
                if (response.path("requestId").asText().equals(requestId)) {
                    assertThat(response.path("type").asText()).isNotEqualTo("ERROR");
                    return response;
                }
            }
        }

        private JsonNode awaitMobilityUpdate(String status) throws Exception {
            long expires = System.nanoTime() + TimeUnit.SECONDS.toNanos(4);
            while (System.nanoTime() < expires) {
                JsonNode response = messages.poll(200, TimeUnit.MILLISECONDS);
                if (response != null && response.path("type").asText().equals("WORLD_MOBILITY_STATE")
                        && response.path("payload").path("status").asText().equals(status)) {
                    assertThat(response.path("requestId").isNull()).isTrue();
                    return response.path("payload");
                }
            }
            throw new AssertionError("대여 상태를 받지 못했습니다: " + status);
        }
    }
}
