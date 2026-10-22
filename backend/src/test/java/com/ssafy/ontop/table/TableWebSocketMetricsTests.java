package com.ssafy.ontop.table;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.ssafy.ontop.auth.security.TestLoginSessions;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser.Provider;
import com.ssafy.ontop.auth.websocket.VerifiedWebSocketUser;
import com.ssafy.ontop.table.service.TableHub.MetricsSnapshot;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.ConnectionCloseReason;
import com.ssafy.ontop.table.websocket.TableWebSocketMetrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.io.IOException;
import java.util.Optional;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TableWebSocketMetricsTests {

    private final TableHub hub = new TableHub(new ObjectMapper(), Optional.empty(), false);
    private final SimpleMeterRegistry registry = new SimpleMeterRegistry();

    @AfterEach
    void shutdown() {
        hub.shutdown();
        registry.close();
    }

    @Test
    void 현재연결과_누적수락_종료_텍스트수신을_구분하고_중복종료는_제외한다() {
        new TableWebSocketMetrics(hub).bindTo(registry);
        assertMetrics(0, 0, 0, 0);
        hub.connect(socket("dev"));
        assertThat(hub.connectAuthenticated(socket("account"), new VerifiedWebSocketUser(101, Provider.NAVER, TestLoginSessions.ID)))
                .isTrue();
        assertThat(hub.connectAuthenticated(socket("duplicate"), new VerifiedWebSocketUser(101, Provider.NAVER, TestLoginSessions.ID)))
                .isFalse();
        hub.receive("dev", "not-json");
        hub.receive("account", "{\"requestId\":\"leave-1\",\"type\":\"TABLE_LEAVE\",\"payload\":{}}");
        hub.receive("unknown", "not-json");
        assertMetrics(2, 2, 0, 2);

        hub.disconnect("dev");
        hub.disconnect("dev");
        hub.receive("dev", "not-json");
        assertMetrics(1, 2, 1, 2);
        assertThat(registry.getMeters()).hasSize(6 + ConnectionCloseReason.values().length);
        assertThat(registry.getMeters().stream()
                .filter(meter -> !meter.getId().getName().equals("ontop.websocket.connections.closed.by.reason")))
                .allSatisfy(meter ->
                assertThat(meter.getId().getTags()).isEmpty());
    }

    @Test
    void 비동기_전송실패도_종료로_한번만_집계한다() throws Exception {
        new TableWebSocketMetrics(hub).bindTo(registry);
        WebSocketSession socket = socket("failed");
        AtomicBoolean fail = new AtomicBoolean();
        CountDownLatch connected = new CountDownLatch(1);
        doAnswer(call -> {
            if (fail.get()) {
                throw new IOException("test send failure");
            }
            connected.countDown();
            return null;
        }).when(socket).sendMessage(any(TextMessage.class));
        hub.connect(socket);
        assertThat(connected.await(5, TimeUnit.SECONDS)).isTrue();
        fail.set(true);

        hub.receive("failed", "not-json");
        verify(socket, timeout(5000)).close(any());
        hub.disconnect("failed");
        assertMetrics(0, 1, 1, 1);
    }

    @Test
    void 앱종료는_활성수를_비우고_누적계수를_유지하며_반복종료에_증가하지않는다() {
        new TableWebSocketMetrics(hub).bindTo(registry);
        hub.connect(socket("first"));
        hub.connect(socket("second"));
        hub.disconnect("first");

        hub.shutdown();
        hub.shutdown();
        hub.disconnect("second");
        assertMetrics(0, 2, 2, 0);
    }

    private WebSocketSession socket(String id) {
        WebSocketSession socket = mock(WebSocketSession.class);
        when(socket.getId()).thenReturn(id);
        return socket;
    }

    private void assertMetrics(long active, long accepted, long closed, long received) {
        assertThat(hub.metricsSnapshot()).isEqualTo(new MetricsSnapshot(active, accepted, closed, received));
        assertThat(registry.get("ontop.websocket.connections.active").gauge().value()).isEqualTo(active);
        assertThat(registry.get("ontop.websocket.connections.accepted").functionCounter().count()).isEqualTo(accepted);
        assertThat(registry.get("ontop.websocket.connections.closed").functionCounter().count()).isEqualTo(closed);
        assertThat(registry.get("ontop.websocket.messages.received").functionCounter().count()).isEqualTo(received);
    }
}
