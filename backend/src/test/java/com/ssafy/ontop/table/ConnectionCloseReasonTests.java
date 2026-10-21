package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import com.ssafy.ontop.table.websocket.TablePeer;
import com.ssafy.ontop.table.websocket.TableWebSocketHandler;
import com.ssafy.ontop.table.websocket.TableWebSocketMetrics;
import com.ssafy.ontop.table.websocket.WebSocketHeartbeat;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.IOException;
import java.time.Duration;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PingMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ConnectionCloseReasonTests {

    private final TableHub hub = new TableHub(new ObjectMapper(), Optional.empty(), false);
    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();
    private final CountDownLatch release = new CountDownLatch(1);

    @BeforeEach
    void bind() {
        new TableWebSocketMetrics(hub).bindTo(registry);
    }

    @AfterEach
    void shutdown() {
        release.countDown();
        hub.shutdown();
        registry.close();
    }

    @Test
    void 소켓종료와_전송오류_이벤트를_구분하고_중복이벤트는_다시_세지않는다() throws Exception {
        TableWebSocketHandler handler = new TableWebSocketHandler(hub, false);
        Peer closed = new Peer();
        Peer error = new Peer();

        handler.afterConnectionClosed(closed.socket, CloseStatus.NORMAL);
        handler.handleTransportError(closed.socket, new IOException("test error after close"));
        handler.handleTransportError(error.socket, new IOException("test transport error"));
        handler.afterConnectionClosed(error.socket, CloseStatus.GOING_AWAY);

        assertReason(ConnectionCloseReason.SOCKET_CLOSED, 1);
        assertReason(ConnectionCloseReason.TRANSPORT_ERROR, 1);
        assertTotal(2);
    }

    @Test
    void 실제송신_예외는_SEND_ERROR로_집계한다() throws Exception {
        Peer peer = new Peer();
        peer.fail = true;

        hub.receive(peer.id, "invalid-json");

        awaitReason(ConnectionCloseReason.SEND_ERROR);
        hub.disconnect(peer.id, ConnectionCloseReason.SOCKET_CLOSED);
        assertTotal(1);
        assertReason(ConnectionCloseReason.SOCKET_CLOSED, 0);
    }

    @Test
    void 막힌송신의_큐초과는_뒤늦은_종료사유로_덮어쓰지않는다() throws Exception {
        Peer peer = new Peer();
        peer.block = true;
        try {
            hub.receive(peer.id, "invalid-json");
            assertThat(peer.sending.await(5, TimeUnit.SECONDS)).isTrue();
            for (int count = 0; count < 129; count++) {
                hub.receive(peer.id, "invalid-json");
            }

            awaitReason(ConnectionCloseReason.SEND_QUEUE_FULL);
            hub.disconnect(peer.id, ConnectionCloseReason.TRANSPORT_ERROR);
            assertTotal(1);
            assertReason(ConnectionCloseReason.TRANSPORT_ERROR, 0);
        } finally {
            release.countDown();
        }
    }

    @Test
    void 퐁마감_만료사유는_뒤의_stop에서_유지한다() throws Exception {
        AtomicLong clock = new AtomicLong();
        WebSocketSession socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn("heartbeat-reason");
        CountDownLatch pingSent = new CountDownLatch(1);
        doAnswer(call -> {
            pingSent.countDown();
            return null;
        }).when(socket).sendMessage(any(PingMessage.class));
        TablePeer peer = new TablePeer(socket, () -> { }, new WebSocketHeartbeat(
                Duration.ofSeconds(10), Duration.ofSeconds(10), clock::get));
        try {
            peer.start();
            clock.set(TimeUnit.SECONDS.toNanos(10));
            assertThat(peer.checkHeartbeat()).isTrue();
            assertThat(pingSent.await(5, TimeUnit.SECONDS)).isTrue();
            clock.set(TimeUnit.SECONDS.toNanos(20));

            assertThat(peer.checkHeartbeat()).isFalse();
            peer.stop(ConnectionCloseReason.SOCKET_CLOSED);
            assertThat(peer.closeReason()).isEqualTo(ConnectionCloseReason.HEARTBEAT_TIMEOUT);
        } finally {
            peer.stop();
        }
    }

    @Test
    void 앱종료는_남은연결만_SERVER_SHUTDOWN으로_집계한다() throws Exception {
        Peer left = new Peer();
        new Peer();
        hub.disconnect(left.id, ConnectionCloseReason.SOCKET_CLOSED);

        hub.shutdown();
        hub.shutdown();

        assertReason(ConnectionCloseReason.SOCKET_CLOSED, 1);
        assertReason(ConnectionCloseReason.SERVER_SHUTDOWN, 1);
        assertTotal(2);
        assertThat(registry.find("ontop.websocket.connections.closed.by.reason").functionCounters())
                .hasSize(7).allSatisfy(counter -> {
                    assertThat(counter.getId().getTags()).hasSize(1);
                    assertThat(counter.getId().getTag("reason")).isIn(
                            "SOCKET_CLOSED", "TRANSPORT_ERROR", "HEARTBEAT_TIMEOUT", "SEND_QUEUE_FULL",
                            "SEND_ERROR", "SERVER_SHUTDOWN", "UNSPECIFIED");
                });
    }

    @Test
    void 서로다른_종료가_동시에_도착해도_한사유와_전체에_각한번만_센다() throws Exception {
        Peer peer = new Peer();
        CountDownLatch start = new CountDownLatch(1);
        try (var workers = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = workers.submit(() -> {
                start.await();
                hub.disconnect(peer.id, ConnectionCloseReason.SOCKET_CLOSED);
                return null;
            });
            var second = workers.submit(() -> {
                start.await();
                hub.disconnect(peer.id, ConnectionCloseReason.TRANSPORT_ERROR);
                return null;
            });
            start.countDown();
            first.get(5, TimeUnit.SECONDS);
            second.get(5, TimeUnit.SECONDS);
        }

        assertTotal(1);
        assertThat(hub.closedConnections(ConnectionCloseReason.SOCKET_CLOSED)
                + hub.closedConnections(ConnectionCloseReason.TRANSPORT_ERROR)).isEqualTo(1);
    }

    private void awaitReason(ConnectionCloseReason reason) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (hub.closedConnections(reason) == 0 && System.nanoTime() < deadline) {
            Thread.sleep(10);
        }
        assertReason(reason, 1);
    }

    private void assertReason(ConnectionCloseReason reason, long expected) {
        assertThat(hub.closedConnections(reason)).isEqualTo(expected);
        assertThat(registry.get("ontop.websocket.connections.closed.by.reason").tag("reason", reason.name())
                .functionCounter().count()).isEqualTo(expected);
    }

    private void assertTotal(long expected) {
        long sum = 0;
        for (ConnectionCloseReason reason : ConnectionCloseReason.values()) {
            sum += hub.closedConnections(reason);
        }
        assertThat(sum).isEqualTo(expected);
        assertThat(hub.metricsSnapshot().closedConnections()).isEqualTo(expected);
        assertThat(hub.metricsSnapshot().activeConnections()).isZero();
    }

    private class Peer {
        private final String id = UUID.randomUUID().toString();
        private final WebSocketSession socket = mock(WebSocketSession.class);
        private final CountDownLatch sending = new CountDownLatch(1);
        private volatile boolean fail;
        private volatile boolean block;

        private Peer() throws Exception {
            when(socket.getId()).thenReturn(id);
            CountDownLatch connected = new CountDownLatch(1);
            doAnswer(call -> {
                if (fail) {
                    throw new IOException("test send error");
                }
                if (block) {
                    sending.countDown();
                    boolean interrupted = false;
                    while (true) {
                        try {
                            release.await();
                            break;
                        } catch (InterruptedException exception) {
                            interrupted = true;
                        }
                    }
                    if (interrupted) {
                        Thread.currentThread().interrupt();
                    }
                }
                connected.countDown();
                return null;
            }).when(socket).sendMessage(any(TextMessage.class));
            hub.connect(socket);
            assertThat(connected.await(5, TimeUnit.SECONDS)).isTrue();
        }
    }
}
