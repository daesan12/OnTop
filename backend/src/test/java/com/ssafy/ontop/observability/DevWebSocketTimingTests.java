package com.ssafy.ontop.observability;

import com.ssafy.ontop.auth.websocket.MemberWebSocketConnections;
import com.ssafy.ontop.table.service.TableHub;
import com.ssafy.ontop.table.websocket.TableWebSocketHandler;
import io.micrometer.core.instrument.Metrics;
import io.micrometer.core.instrument.simple.SimpleMeterRegistry;
import org.junit.jupiter.api.Test;
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
