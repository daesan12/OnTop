package com.ssafy.ontop.observability;

import com.ssafy.ontop.auth.websocket.MemberWebSocketConnections;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.TableWebSocketHandler;
import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import java.nio.ByteBuffer;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.PongMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DevWebSocketTimingTests {

    @Test
    void recordsTextHandlingWithoutChangingDeliveredMessage() throws Exception {
        checkMessage(false);
    }

    @Test
    void recordsFailedHandlingAndPreservesTheException() throws Exception {
        checkMessage(true);
    }

    @Test
    void registersBothTimersBeforeMessagesAndReusesThem() throws Exception {
        TableHub hub = mock(TableHub.class);
        var connections = mock(MemberWebSocketConnections.class);
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("test-socket");
        var registry = new SimpleMeterRegistry();
        Metrics.addRegistry(registry);
        try {
            var measured = (TableWebSocketHandler) DevObservabilityConfiguration.devWebSocketTiming()
                    .postProcessAfterInitialization(new TableWebSocketHandler(hub, true, connections), "handler");
            var textTimer = registry.get("ontop.websocket.handler.duration").tag("kind", "text").timer();
            var controlTimer = registry.get("ontop.websocket.handler.duration").tag("kind", "control").timer();
            assertThat(textTimer.count()).isZero();
            assertThat(controlTimer.count()).isZero();
            measured.handleMessage(session, new TextMessage("first"));
            measured.handleMessage(session, new TextMessage("second"));
            ByteBuffer pong = ByteBuffer.wrap(new byte[]{1});
            measured.handleMessage(session, new PongMessage(pong));
            verify(hub).receive("test-socket", "first");
            verify(hub).receive("test-socket", "second");
            verify(hub).pong("test-socket", pong);
            assertThat(textTimer.count()).isEqualTo(2);
            assertThat(controlTimer.count()).isEqualTo(1);
            assertThat(registry.get("ontop.websocket.handler.duration").tag("kind", "text").timer())
                    .isSameAs(textTimer);
            assertThat(registry.find("ontop.websocket.handler.duration").timers()).hasSize(2);
        } finally {
            Metrics.removeRegistry(registry);
            registry.close();
        }
    }

    private void checkMessage(boolean fails) throws Exception {
        TableHub hub = mock(TableHub.class);
        var connections = mock(MemberWebSocketConnections.class);
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.getId()).thenReturn("test-socket");
        if (fails) {
            doThrow(new IllegalStateException("test failure")).when(hub).receive("test-socket", "test-message");
        }
        var original = new TableWebSocketHandler(hub, true, connections);
        var measured = (TableWebSocketHandler) DevObservabilityConfiguration.devWebSocketTiming()
                .postProcessAfterInitialization(original, "handler");
        var registry = new SimpleMeterRegistry();
        Metrics.addRegistry(registry);
        try {
            if (fails) {
                assertThatThrownBy(() -> measured.handleMessage(session, new TextMessage("test-message")))
                        .isInstanceOf(IllegalStateException.class).hasMessage("test failure");
            } else {
                measured.handleMessage(session, new TextMessage("test-message"));
            }
            verify(hub).receive("test-socket", "test-message");
            assertThat(registry.get("ontop.websocket.handler.duration").tag("kind", "text").timer().count())
                    .isEqualTo(1);
        } finally {
            Metrics.removeRegistry(registry);
            registry.close();
        }
    }
}
